const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const logFile = path.join(app.getPath('userData'), 'launcher-debug.log');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (e) {}
  console.log(message);
}

log('--- App Starting (Desktop Mode) ---');

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

  const command = `"${browserPath}" --app="${url}" --start-fullscreen`;
  
  if (process.platform === 'win32' && !fs.existsSync(browserPath)) {
    log(`Error: Browser not found at ${browserPath}`);
    throw new Error(`Browser not found at ${browserPath}`);
  }

  currentBrowserProcess = exec(command, (error) => {
    if (error && !error.killed) {
      log(`Exec error: ${error.message}`);
    }
  });

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
  log(`Gemini call requested: ${prompt.substring(0, 50)}...`);
  try {
    if (!apiKey) throw new Error("Gemini API Key is missing");
    
    const ai = new GoogleGenAI({ apiKey });
    
    const config = {};
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config
    });

    return { text: response.text || "" };
  } catch (error) {
    log(`Gemini error: ${error.message}`);
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
