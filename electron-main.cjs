const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');

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
};

// IPC Handlers
ipcMain.handle('desktop:launch', async (event, { browserPath, url }) => {
  log(`Desktop launch requested: ${url} using ${browserPath}`);
  killCurrentBrowser();

  // Launch in app mode (no top bar) but without immediate fullscreen
  const command = `"${browserPath}" --app="${url}"`;
  
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
          $wshell = New-Object -ComObject WScript.Shell;
          $app = Get-Process | Where-Object {$_.MainWindowTitle -like "*${domain}*"} | Select-Object -First 1;
          if ($app) {
            try {
              $wshell.AppActivate($app.Id);
              Start-Sleep -Seconds 1;
              $wshell.SendKeys('{F11}');
            } catch {
              Write-Error "Failed to activate or send keys: $_";
            }
          } else {
            Write-Warning "No window found with title containing '${domain}'";
          }
        `;
        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, (err) => {
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
