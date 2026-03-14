import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { exec, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple logger for server startup
const logFile = path.join(process.cwd(), 'server-debug.log');
function log(msg: string) {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  } catch (e) {}
  console.log(msg);
}

try {
  log("Server process initialized");
  log(`CWD: ${process.cwd()}`);
  log(`__filename: ${__filename}`);
  log(`__dirname: ${__dirname}`);
  dotenv.config();
  log("Dotenv configured");

  let currentBrowserProcess: ChildProcess | null = null;

  async function startServer() {
    log("Starting startServer function");
    const app = express();
    const PORT = Number(process.env.PORT) || 3000;

    app.use(express.json());

    const killCurrentBrowser = () => {
      if (currentBrowserProcess) {
        // On Windows, we use taskkill to ensure the entire process tree is closed
        // This is important because browsers often spawn multiple sub-processes
        const pid = currentBrowserProcess.pid;
        if (pid) {
          exec(`taskkill /pid ${pid} /f /t`, (err) => {
            if (err) console.log("Process already closed or could not be killed");
          });
        }
        currentBrowserProcess = null;
      }
    };

    // Desktop Launch Endpoint
    app.post("/api/desktop/launch", (req, res) => {
      const { browserPath, url } = req.body;
      log(`Desktop launch requested: ${url} using ${browserPath}`);
      
      if (!browserPath || !url) {
        log("Error: browserPath and url are required");
        return res.status(400).json({ error: "browserPath and url are required" });
      }

      // Close any previous window first to prevent buildup
      killCurrentBrowser();

      // In cloud environment, we don't actually run the command for security
      if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DESKTOP_LAUNCH) {
        const command = `"${browserPath}" --app="${url}" --start-fullscreen`;
        return res.json({ 
          success: true, 
          simulated: true, 
          command,
          message: "Desktop launch simulated. Previous window would be closed." 
        });
      }

      // Construct command
      const command = `"${browserPath}" --app="${url}" --start-fullscreen`;
      
      // Check if path exists (only if not simulated)
      if (process.platform === 'win32' && !fs.existsSync(browserPath)) {
        log(`Error: Browser not found at ${browserPath}`);
        return res.status(404).json({ 
          error: "Browser not found", 
          details: `The file "${browserPath}" does not exist. Please check your settings.` 
        });
      }

      currentBrowserProcess = exec(command, (error) => {
        if (error && !error.killed) {
          console.error("Exec error:", error);
        }
      });

      res.json({ success: true });
    });

    // Validate Browser Path Endpoint
    app.post("/api/desktop/validate-path", (req, res) => {
      const { path: browserPath } = req.body;
      
      if (!browserPath) {
        return res.status(400).json({ exists: false, message: "Path is required" });
      }

      // In cloud environment, we can't check the user's local path
      if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DESKTOP_LAUNCH) {
        return res.json({ 
          exists: true, 
          message: "Path format looks valid (Cloud Simulation)" 
        });
      }

      if (fs.existsSync(browserPath)) {
        res.json({ exists: true, message: "Browser found!" });
      } else {
        res.json({ exists: false, message: "File not found at this path." });
      }
    });

    // Debug Log Endpoint
    app.get("/api/debug/log", (req, res) => {
      try {
        if (fs.existsSync(logFile)) {
          const data = fs.readFileSync(logFile, 'utf8');
          res.header('Content-Type', 'text/plain');
          return res.send(data);
        }
        res.status(404).send("Log file not found");
      } catch (e: any) {
        res.status(500).send(`Error reading log: ${e.message}`);
      }
    });

    // Explicit Close Endpoint
    app.post("/api/desktop/close", (req, res) => {
      killCurrentBrowser();
      res.json({ success: true });
    });

    // Persistent Settings Endpoints
    const SETTINGS_FILE = path.join(process.cwd(), 'app-settings.json');

    app.get("/api/settings", (req, res) => {
      try {
        if (fs.existsSync(SETTINGS_FILE)) {
          const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
          return res.json(JSON.parse(data));
        }
      } catch (e) {
        log(`Error reading settings: ${e}`);
      }
      res.json({});
    });

    app.post("/api/settings", (req, res) => {
      log(`Received request to save settings: ${JSON.stringify(req.body).substring(0, 100)}...`);
      try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
        log("Settings saved successfully");
        res.json({ success: true });
      } catch (e: any) {
        log(`Error saving settings: ${e.message}`);
        res.status(500).json({ error: e.message });
      }
    });

    // Gemini API Proxy
    app.post("/api/gemini", async (req, res) => {
      log(`Received Gemini request: ${req.body.prompt?.substring(0, 50)}...`);
      try {
        const { prompt, useSearch, apiKey: clientApiKey } = req.body;
        // Prefer client-provided key, then server env
        const apiKey = clientApiKey || process.env.GEMINI_API_KEY;

        if (!apiKey) {
          return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
        }

        const ai = new GoogleGenAI({ apiKey });
        
        const config: any = {};
        if (useSearch) {
          config.tools = [{ googleSearch: {} }];
        }

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config
        });

        res.json({ text: response.text || "" });
      } catch (error: any) {
        console.error("Gemini Proxy Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
      }
    });

    // Iframe Proxy to bypass X-Frame-Options
    app.get("/api/proxy", async (req, res) => {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).send("URL is required");

      try {
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        const contentType = response.headers.get("content-type") || "text/html";
        
        // Copy headers but exclude security ones that block iframes
        response.headers.forEach((value, key) => {
          const lowerKey = key.toLowerCase();
          if (!['x-frame-options', 'content-security-policy', 'content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) {
            res.setHeader(key, value);
          }
        });

        if (contentType.includes("text/html")) {
          let html = await response.text();
          
          // Inject base tag to fix relative links
          const urlObj = new URL(targetUrl);
          const baseTag = `<base href="${urlObj.origin}${urlObj.pathname}">`;
          
          // Try to inject base tag and also a script to prevent frame busting
          const headInjection = `
            ${baseTag}
            <script>
              // Prevent frame busting
              window.onbeforeunload = function() { return false; };
              // Attempt to override top-level navigation
              window.top = window.self;
            </script>
          `;
          
          html = html.replace("<head>", `<head>${headInjection}`);
          res.send(html);
        } else {
          const buffer = await response.arrayBuffer();
          res.send(Buffer.from(buffer));
        }
      } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).send("Failed to proxy content");
      }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      log("Setting up Vite middleware for development");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      log("Setting up static file serving for production");
      const distPath = path.join(process.cwd(), 'dist');
      log(`Dist folder exists: ${fs.existsSync(distPath)}`);
      const indexPath = path.join(distPath, 'index.html');
      log(`Dist path: ${distPath}`);
      log(`Index path exists: ${fs.existsSync(indexPath)}`);
      // Serve static files in production
      app.use(express.static("dist"));
      app.get("*", (req, res) => {
        res.sendFile("dist/index.html", { root: "." });
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      log(`Server running on http://localhost:${PORT}`);
    });

    // Cleanup on exit
    process.on('SIGTERM', () => {
      killCurrentBrowser();
      process.exit(0);
    });
    process.on('SIGINT', () => {
      killCurrentBrowser();
      process.exit(0);
    });
  }

  log("Calling startServer()...");
  startServer().catch(err => {
    log(`CRITICAL: startServer failed: ${err.message}`);
  });
} catch (e: any) {
  log(`FATAL ERROR during server init: ${e.message}`);
  log(e.stack);
}
