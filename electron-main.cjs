const { app, BrowserWindow, shell, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const logFile = path.join(app.getPath('userData'), 'launcher-debug.log');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json');

// Clear log file on startup to avoid confusion with old errors
try {
  fs.writeFileSync(logFile, `--- New Session: ${new Date().toISOString()} ---\n`);
} catch (e) {}

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {}
  console.log(message);
}

log('--- App Starting (Desktop Mode) ---');
log(`Platform: ${process.platform}, Arch: ${process.arch}`);

let mainWindow;
let currentBrowserProcess = null;

const killCurrentBrowser = () => {
  if (currentBrowserProcess) {
    const pid = currentBrowserProcess.pid;
    if (pid) {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${pid} /f /t`, (err) => {
          if (err) log("Process already closed or could not be killed");
        });
      } else {
        currentBrowserProcess.kill();
      }
    }
    currentBrowserProcess = null;
  }
  // Unregister the shortcuts so normal keyboard behavior returns
  globalShortcut.unregister('Home');
  globalShortcut.unregister('Escape');
};

// IPC Handlers
ipcMain.handle('desktop:launch', async (event, { browserPath, url, userAgent }) => {
  log(`Desktop launch requested: ${url} using ${browserPath} (UA: ${userAgent})`);
  killCurrentBrowser();

  // Register remote control global shortcuts to close the stream
  const closeStream = () => {
    log("Remote Home/Esc key pressed! Closing stream...");
    killCurrentBrowser();
    
    // Notify the frontend that it was closed so it can return to the menu
    if (mainWindow) {
      mainWindow.webContents.send('desktop:closed-remotely');
    }
  };
  
  globalShortcut.register('Home', closeStream);
  globalShortcut.register('Escape', closeStream);

  // Launch in app mode (no top bar) but without immediate fullscreen
  // Added flags to prevent redirects and automation detection
  const flags = [
    `--app="${url}"`,
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--password-store=basic', // Avoid some auth prompts
    '--remote-debugging-port=9222', // Enable debug port for puppeteer
  ];

  if (userAgent) {
    flags.push(`--user-agent="${userAgent}"`);
  }

  const command = `"${browserPath}" ${flags.join(' ')}`;
  
  if (process.platform === 'win32' && !fs.existsSync(browserPath)) {
    log(`Error: Browser not found at ${browserPath}`);
    throw new Error(`Browser not found at ${browserPath}`);
  }

  currentBrowserProcess = exec(command, (error) => {
    if (error && !error.killed) {
      log(`Exec error: ${error.message}`);
    }
  });

  // Wait 3 seconds, then try to focus and fullscreen via PowerShell (Windows only)
  if (process.platform === 'win32') {
    setTimeout(() => {
      try {
        log('Attempting to focus and fullscreen browser window...');
        // Heuristic: look for a window with the domain in the title
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        const psCommand = `
          $code = @'
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
            [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          }
'@;
          Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue;
          $wshell = New-Object -ComObject WScript.Shell;
          $app = Get-Process | Where-Object {$_.MainWindowTitle -like "*${domain}*"} | Select-Object -First 1;
          if ($app) {
            try {
              [Win32]::ShowWindowAsync($app.MainWindowHandle, 3) | Out-Null;
              [Win32]::SetForegroundWindow($app.MainWindowHandle) | Out-Null;
              Start-Sleep -Milliseconds 500;
              $wshell.SendKeys('{F11}');
            } catch {
              Write-Error "Failed to activate or maximize: $_";
            }
          } else {
            Write-Warning "No window found with title containing '${domain}'";
          }
        `;
        
        // Encode the PowerShell command to Base64 to avoid all newline and escaping errors
        const base64Cmd = Buffer.from(psCommand, 'utf16le').toString('base64');
        exec(`powershell -EncodedCommand ${base64Cmd}`, (err) => {
          if (err) log(`PowerShell error: ${err.message}`);
        });
      } catch (e) {
        log(`Failed to trigger auto-fullscreen: ${e.message}`);
      }
    }, 3000);
  }

  return { success: true };
});

ipcMain.handle('desktop:validate-path', async (event, browserPath) => {
  if (!browserPath) return { exists: false, message: "Path is required" };
  const exists = fs.existsSync(browserPath);
  return { exists, message: exists ? "Browser found!" : "File not found at this path." };
});

ipcMain.handle('desktop:close', async () => {
  killCurrentBrowser();
  return { success: true };
});

ipcMain.handle('desktop:auto-play', async (event, { targetText, apiKey }) => {
  log(`Auto-play requested for: ${targetText}`);
  try {
    if (!apiKey) throw new Error("Gemini API Key missing");

    // Connect to existing browser
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null
    });
    
    // Get the page we just opened
    const pages = await browser.pages();
    const page = pages.find(p => !p.url().includes('devtools://')) || pages[0];
    
    if (!page) throw new Error("No page found to inspect.");

    // Wait for the page's components and network to visually settle
    try {
      log("Waiting for page DOM to settle...");
      await page.waitForFunction('document.readyState === "complete"', { timeout: 10000 });
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 });
      
      // Inject script to wait until the DOM stops mutating (simulating waiting for connectedCallbacks/framework renders)
      await page.evaluate(() => {
        return new Promise(resolve => {
          let maxWaitTimeout = setTimeout(resolve, 10000); // 10 second absolute max wait
          
          let idleTimeout = setTimeout(() => {
            clearTimeout(maxWaitTimeout);
            resolve();
          }, 1500);
          
          const observer = new MutationObserver(() => {
            clearTimeout(idleTimeout);
            idleTimeout = setTimeout(() => {
              clearTimeout(maxWaitTimeout);
              resolve();
            }, 1500); // 1.5s of no DOM mutations
          });
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
      });
      log("Page DOM has settled");
    } catch (e) {
      log(`Timeout waiting for page to settle (proceeding anyway): ${e.message}`);
    }

    // Capture screenshot
    const screenshotBuffer = await page.screenshot({ encoding: 'base64' });

    // Build REST request to Gemini for coordinates
    const modelName = "gemini-3.1-flash-lite-preview"; // or full flash if needed
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const prompt = `Return ONLY a raw JSON object with { "x": number, "y": number } representing the exact pixel coordinates to click on the "${targetText}" on this screen. If it is not found, return { "error": "not found" }. Do NOT use markdown blocks.`;

    const payload = JSON.stringify({
      contents: [{ 
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: screenshotBuffer } }
        ] 
      }]
    });

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      rejectUnauthorized: false
    };

    const responseText = await new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) reject(new Error(`API Error: ${body}`));
          else resolve(body);
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    const jsonResponse = JSON.parse(responseText);
    const textOutput = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanedText = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    
    log(`Gemini Vision response: ${cleanedText}`);

    let coords;
    try {
      coords = JSON.parse(cleanedText);
    } catch (e) {
      throw new Error(`Failed to parse AI coordinates: ${cleanedText}`);
    }

    if (coords.error || typeof coords.x !== 'number') {
      throw new Error(`Target not found by AI: ${coords.error || 'Invalid format'}`);
    }

    // Click the coordinates
    await page.mouse.click(coords.x, coords.y);
    browser.disconnect();

    return { success: true, coords };

  } catch (error) {
    log(`Auto-play error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('settings:get', async () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    log(`Error reading settings: ${e}`);
  }
  return {};
});

ipcMain.handle('settings:save', async (event, settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    log("Settings saved successfully");
    return { success: true };
  } catch (e) {
    log(`Error saving settings: ${e.message}`);
    throw e;
  }
});

ipcMain.handle('gemini:call', async (event, { prompt, useSearch, apiKey }) => {
  log(`Gemini call requested. Prompt length: ${prompt.length}, Search: ${useSearch}`);
  try {
    if (!apiKey) {
      log("Error: Gemini API Key is missing");
      throw new Error("Gemini API Key is missing");
    }
    
    log(`Initializing Gemini REST call (key length: ${apiKey.length})`);
    
    const modelName = "gemini-3.1-flash-lite-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const data = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: useSearch ? [{ googleSearch: {} }] : []
    });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'Electron/BrownfieldSatellite'
        },
        timeout: 30000,
        rejectUnauthorized: false 
      };

      log(`Calling REST API: ${modelName}`);
      
      const result = await new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            log(`Gemini API Response Status: ${res.statusCode}`);
            log(`Content-Type: ${res.headers['content-type']}`);
            
            try {
              // Check status code BEFORE parsing JSON
              if (res.statusCode !== 200) {
                log(`Gemini API Error (${res.statusCode}): ${body.substring(0, 500)}`);
                let errorMessage = `Gemini API Error (${res.statusCode})`;
                try {
                  const json = JSON.parse(body);
                  errorMessage = json.error?.message || errorMessage;
                } catch (e) {
                  // If not JSON, it might be an HTML error page from a proxy
                  if (body.includes('<html') || body.includes('<!DOCTYPE html')) {
                    errorMessage = "Network error: The API returned an HTML page. This often means a proxy or firewall is blocking the request.";
                  }
                }
                return reject(new Error(errorMessage));
              }

              const json = JSON.parse(body);
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
              log("Gemini call successful");
              resolve({ text });
            } catch (e) {
              log(`Error parsing Gemini response: ${e.message}`);
              log(`Body snippet: ${body.substring(0, 200)}`);
              reject(new Error("Failed to parse Gemini response. The server returned invalid data."));
            }
          });
        });

      req.on('error', (error) => {
        log(`Gemini REST CRITICAL error: ${error.message}`);
        if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
          reject(new Error("Gemini API connection failed. Please check your internet connection or firewall settings."));
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        log("Gemini REST request timed out");
        reject(new Error("Gemini API request timed out."));
      });

      req.write(data);
      req.end();
    });

    return result;
  } catch (error) {
    log(`Gemini CRITICAL error: ${error.message}`);
    if (error.stack) log(`Stack: ${error.stack}`);
    
    // Provide a more helpful error message for "fetch failed"
    if (error.message === 'fetch failed') {
      throw new Error("Gemini API connection failed. Please check your internet connection or firewall settings.");
    }
    throw error;
  }
});

ipcMain.handle('debug:get-logs', async () => {
  try {
    if (fs.existsSync(logFile)) {
      return fs.readFileSync(logFile, 'utf8');
    }
    return "Log file not found";
  } catch (e) {
    return `Error reading log: ${e.message}`;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0a',
    title: 'Brownfield Satellite',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  killCurrentBrowser();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
