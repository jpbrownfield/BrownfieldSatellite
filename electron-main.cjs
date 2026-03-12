const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

const logFile = path.join(app.getPath('userData'), 'launcher-debug.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(message);
}

log('--- App Starting ---');
log(`Log file: ${logFile}`);
log(`__dirname: ${__dirname}`);
log(`App Path: ${app.getAppPath()}`);
log(`CWD: ${process.cwd()}`);
log(`Exec Path: ${process.execPath}`);
log(`Resources Path: ${process.resourcesPath}`);
log(`App Exe Path: ${app.getPath('exe')}`);
log(`App Data Path: ${app.getPath('appData')}`);
log(`User Data Path: ${app.getPath('userData')}`);
log(`Temp Path: ${app.getPath('temp')}`);
log(`Desktop Path: ${app.getPath('desktop')}`);
log(`Documents Path: ${app.getPath('documents')}`);
log(`Downloads Path: ${app.getPath('downloads')}`);
log(`Music Path: ${app.getPath('music')}`);
log(`Pictures Path: ${app.getPath('pictures')}`);
log(`Videos Path: ${app.getPath('videos')}`);
log(`Logs Path: ${app.getPath('logs')}`);
log(`Locale: ${app.getLocale()}`);
log(`App Name: ${app.getName()}`);
log(`App Version: ${app.getVersion()}`);
log(`Platform: ${process.platform}`);
log(`Arch: ${process.arch}`);
log(`Versions: ${JSON.stringify(process.versions, null, 2)}`);

let serverProcess;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0a0a0a',
    title: 'Brownfield Satellite',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Hide the default menu bar for a cleaner look
    autoHideMenuBar: true
  });

  // Show loading screen first
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  // Load the local server with retries
  const loadWithRetry = (url, retries = 15) => {
    log(`Attempting to load URL: ${url} (Retries left: ${retries})`);
    mainWindow.loadURL(url).catch((err) => {
      if (retries > 0) {
        log(`Load failed, retrying in 1s... Error: ${err.message}`);
        setTimeout(() => loadWithRetry(url, retries - 1), 1000);
      } else {
        log(`Failed to load URL after multiple attempts: ${err.message}`);
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(e => {
          log(`Fallback to local file failed: ${e.message}`);
        });
      }
    });
  };

  loadWithRetry('http://localhost:3000');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Start the Express server
function startServer() {
  const serverPath = path.join(__dirname, 'server.ts');
  log(`Starting server process at: ${serverPath}`);
  
  if (!fs.existsSync(serverPath)) {
    log(`CRITICAL: Server file NOT found at ${serverPath}`);
    return;
  }

  try {
    // Try to find tsx loader
    let tsxPath = path.join(__dirname, 'node_modules', 'tsx', 'dist', 'loader.mjs');
    if (!fs.existsSync(tsxPath)) {
      // Fallback for different install structures
      tsxPath = path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'loader.mjs');
    }
    
    if (!fs.existsSync(tsxPath)) {
      log(`CRITICAL: tsx loader NOT found!`);
    } else {
      log(`Using tsx loader at: ${tsxPath}`);
    }

    serverProcess = fork(serverPath, [], {
      execArgv: fs.existsSync(tsxPath) ? ['--import', `file://${tsxPath}`] : ['--import', 'tsx'],
      env: { ...process.env, NODE_ENV: 'production', PORT: '3000' },
      stdio: ['inherit', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      log(`[Server STDOUT]: ${msg}`);
    });

    serverProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      log(`[Server STDERR]: ${msg}`);
    });

    serverProcess.on('error', (err) => {
      log(`CRITICAL: Server process error: ${err.message}`);
    });

    serverProcess.on('exit', (code, signal) => {
      log(`Server process exited with code: ${code}, signal: ${signal}`);
    });
  } catch (err) {
    log(`CRITICAL: Failed to fork server process: ${err.message}`);
  }
}

app.on('ready', () => {
  // In a real build, we'd wait for the server to be ready
  // For now, we'll just start it and wait a second before opening the window
  startServer();
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // Kill the browser if it's still open
    if (serverProcess) {
      // Send a message to the server to close the browser
      // Or just kill the whole tree
      serverProcess.kill();
    }
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
