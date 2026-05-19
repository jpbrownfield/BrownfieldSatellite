interface Bridge {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, func: (...args: any[]) => void) => void;
  removeListener: (channel: string, func: (...args: any[]) => void) => void;
  isNW: boolean;
}

const isNW = typeof (window as any).nw !== 'undefined';
const SETTINGS_KEY = 'brownfield_satellite_settings';

// Ensure Vite doesn't try to bundle these if they don't exist
const nodeRequire = (window as any).require;
const fs = nodeRequire ? nodeRequire('fs') : null;
const path = nodeRequire ? nodeRequire('path') : null;
const os = nodeRequire ? nodeRequire('os') : null;
const http = nodeRequire ? nodeRequire('http') : null;
const { spawn } = nodeRequire ? nodeRequire('child_process') : { spawn: null };

// Wipe nw-debug.log on startup to keep it clean
if (isNW && fs && path) {
  try {
    const logPath = path.join(process.cwd(), 'nw-debug.log');
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
    }
  } catch (e) {
    console.error("Failed to wipe nw-debug.log:", e);
  }
}

let activeStreamWindow: any = null;
let activeAgentProcesses: any[] = [];
let osRemoteProcess: any = null;

function initRemoteMouse() {
  if (!isNW || !spawn) return;
  if (osRemoteProcess) return;

  try {
    let executable = 'python';
    const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    
    // 1. Try Venv first in dev
    if (fs.existsSync(venvPython)) {
      executable = venvPython;
    }

    let args = [path.join(process.cwd(), 'automation', 'remote_mouse.py')];

    // 2. Fallback to Prod EXE
    if (!fs.existsSync(args[0])) {
      const prodExecutable = path.join(path.dirname(process.execPath), 'remote_mouse.exe');
      if (fs.existsSync(prodExecutable)) {
        executable = prodExecutable;
        args = [];
      } else {
        console.warn("[Bridge] No remote_mouse script or EXE found.");
        return;
      }
    }
    
    console.log(`[Bridge] Spawning Remote Mouse: ${executable} ${args.join(' ')}`);
    osRemoteProcess = spawn(executable, args);
    
    // Ensure the process is killed when the main NW.js window closes
    if (window.nw) {
      window.nw.Window.get().on('close', () => {
        if (osRemoteProcess) {
          console.log("[Bridge] Killing Remote Mouse process on app close...");
          osRemoteProcess.kill();
        }
        window.nw.Window.get().close(true);
      });
    }

    osRemoteProcess.stdout.on('data', (data: any) => {
      const out = data.toString();
      
      // Log all raw output to console for easier debugging
      console.log(`[Remote Mouse Raw]: ${out.trim()}`);
      if (isNW && fs) {
        try { fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Remote Mouse Raw]: ${out.trim()}\n`); } catch(e) {}
      }

      try {
        const parsed = JSON.parse(out);
        if (parsed.log) {
          if (isNW && fs) fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Remote Mouse HID]: ${parsed.log}\n`);
        }
        if (parsed.error) {
          console.error(`[Remote Mouse ERROR]: ${parsed.error}`);
          if (isNW && fs) fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Remote Mouse ERROR]: ${parsed.error}\n`);
        }
      } catch (e) {
        // Not JSON, that's fine
      }

      if (out.includes('"kill"')) {
        console.log('OS-Level remote mouse requested stream close (BrowserBack/BrowserHome pressed)');
        if (activeStreamWindow) {
          try { 
            if (activeStreamWindow.kill) {
              // If it's a Node ChildProcess (like our detached Chrome), we must forcefully kill its process tree on Windows
              try {
                const killProc = require('child_process').spawn('taskkill', ['/pid', activeStreamWindow.pid.toString(), '/f', '/t']);
                killProc.on('error', () => { activeStreamWindow.kill(); }); // Fallback
              } catch (e) {
                activeStreamWindow.kill();
              }
            }
            else activeStreamWindow.close();
          } catch(e) {}
          activeStreamWindow = null;
        }
        if (window.nw) {
          try { window.nw.Window.get().emit('desktop:closed-remotely'); } catch(e){}
        }
      }
      if (out.includes('"nav_home"')) {
        if (window.nw) {
          try { window.nw.Window.get().emit('desktop:nav-home'); } catch(e){}
        }
      }

      if (out.includes('"voice_search"')) {
        try {
          const parsed = JSON.parse(out);
          if (parsed.action === 'voice_search' && parsed.query) {
            console.log(`[Voice Search Triggered]: ${parsed.query}`);
            if (window.nw) {
              window.nw.Window.get().emit('desktop:voice-search', parsed.query);
            }
          }
        } catch (e) {
          console.error("Failed to parse voice_search JSON", e);
        }
      }
    });

    osRemoteProcess.stderr.on('data', (data: any) => {
      const errOut = data.toString().trim();
      if (errOut) {
        console.error(`[Remote Mouse Error]: ${errOut}`);
        if (isNW && fs) {
          try { fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Remote Mouse Error]: ${errOut}\n`); } catch(e) {}
        }
      }
    });

    // Starts in "app" mode
    try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "app" }) + "\n"); } catch(e){}

  } catch (e) {
    console.error("Failed to attach global OS-level remote mouse script", e);
  }
}

// Start persistence
if (isNW) {
  setTimeout(initRemoteMouse, 500); // Give fs time to be ready
}

// Helper to run Python/compiled sub-process
const runAgent = (reqData: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!spawn) return reject(new Error("child_process is not available. Are you running in NW.js?"));
    
    // In dev mode, we run python natively.
    // In prod mode (built with PyInstaller), we run the agent.exe located right next to the app
    let executable = 'python';
    let args = [path.join(process.cwd(), 'automation', 'agent.py')];

    // If agent.py doesn't exist here, we are in the packaged PROD build
    if (!fs.existsSync(args[0])) {
      const prodExecutable = path.join(path.dirname(process.execPath), 'agent.exe');
      if (fs.existsSync(prodExecutable)) {
        executable = prodExecutable;
        args = []; // No script needed, it's compiled inside
      } else {
        return reject(new Error(`Agent executable not found at: ${prodExecutable}`));
      }
    }

    const pyProcess = spawn(executable, args);
    activeAgentProcesses.push(pyProcess);
    
    let output = '';
    let errorOutput = '';

      pyProcess.stdout.on('data', (data: Buffer) => { 
        const chunk = data.toString();
        output += chunk; 
        try { if (isNW && fs) fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Agent STDOUT]: ${chunk.trim()}\n`); } catch(e){}
      });
      pyProcess.stderr.on('data', (data: Buffer) => { 
        const chunk = data.toString();
        errorOutput += chunk; 
        // Stream logs immediately to console for debugging
        console.log(`[Agent]: ${chunk.trim()}`);
        try { if (isNW && fs) fs.appendFileSync(path.join(process.cwd(), 'nw-debug.log'), `[Agent]: ${chunk.trim()}\n`); } catch(e){}
      });

    pyProcess.on('close', (code: number) => {
      activeAgentProcesses = activeAgentProcesses.filter(p => p !== pyProcess);
      
      if (errorOutput) console.warn("Agent Log:", errorOutput);
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) return reject(new Error(parsed.error));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse agent output: ${output} | Err: ${errorOutput}`));
      }
    });

    pyProcess.stdin.write(JSON.stringify(reqData));
    pyProcess.stdin.end();
  });
};

const getSettings = async () => {
  if (isNW) {
    const SETTINGS_FILE = path.join((window as any).nw.App.dataPath, 'app-settings.json');
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
  } else {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  }
  return {};
};

export const bridge: Bridge = {
  isNW,
  on: (channel, func) => { if (isNW) (window as any).nw.Window.get().on(channel, func); },
  removeListener: (channel, func) => { if (isNW) (window as any).nw.Window.get().removeListener(channel, func); },
  invoke: async (channel: string, ...args: any[]) => {
    switch (channel) {
      case 'settings:get': {
        return await getSettings();
      }

      case 'settings:save': {
        if (isNW) {
          const SETTINGS_FILE = path.join((window as any).nw.App.dataPath, 'app-settings.json');
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(args[0], null, 2));

            // Overwrite user-agent in package.json if it exists
            const pkgPath = path.resolve(process.cwd(), 'package.json');
            if (fs.existsSync(pkgPath)) {
              try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (args[0].userAgent && pkg['user-agent'] !== args[0].userAgent) {
                  pkg['user-agent'] = args[0].userAgent;
                  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
                  console.log('Updated package.json user-agent on startup settings hook.');
                }
              } catch (e) {
                console.error('Failed to update package.json:', e);
              }
            }
          } else {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(args[0]));
          }
          return { success: true };
        }

        case 'debug:get-logs': {
          if (isNW) {
            const logPath = path.resolve(process.cwd(), 'nw-debug.log');
            if (fs.existsSync(logPath)) {
              return fs.readFileSync(logPath, 'utf8');
            } else {
              return 'No nw-debug.log found.';
            }
          }
          return 'Logs available only in Desktop mode.';
        }

        case 'extensions:backup': {
          if (!isNW) return { success: false };
          
          // Use the app-specific profile directory we create in desktop:launch
          const profileDir = path.join(os.homedir(), 'BrownfieldSatelliteProfile');
          const defaultAppExtPath = path.join(profileDir, 'Default', 'Extensions');
          const backupDest = path.join(process.cwd(), 'exported-extensions');
          
          if (!fs.existsSync(defaultAppExtPath)) {
             throw new Error('No extensions found in the Brownfield profile. Add some first!');
          }
          
          if (!fs.existsSync(backupDest)) fs.mkdirSync(backupDest);
          
          // Recursive copy
          fs.cpSync(defaultAppExtPath, backupDest, { recursive: true });
          console.log('Extensions exported to:', backupDest);
          return { success: true };
        }

        case 'extensions:import': {
          if (!isNW) return { success: false };
          const bundledExtPath = path.join(process.cwd(), 'exported-extensions');
          
          // Import them directly to the app-specific profile directory
          const profileDir = path.join(os.homedir(), 'BrownfieldSatelliteProfile');
          const targetAppExtPath = path.join(profileDir, 'Default', 'Extensions');
          
          if (!fs.existsSync(bundledExtPath)) {
             throw new Error('No exported-extensions folder found to import from.');
          }
          
          if (!fs.existsSync(targetAppExtPath)) fs.mkdirSync(targetAppExtPath, { recursive: true });
          
          fs.cpSync(bundledExtPath, targetAppExtPath, { recursive: true });
          console.log('Extensions imported from:', bundledExtPath, 'to', targetAppExtPath);
          return { success: true };
        }

        case 'gemini:call': {
          const { prompt, apiKey, useSearch } = args[0];
          if (!apiKey) throw new Error("Gemini API Key is missing.");
          
          try {
            const response = await runAgent({
              action: 'gemini:call',
              apiKey,
              prompt,
              useSearch
            });
          return { text: response.text || "" };
        } catch (error: any) {
          throw new Error(`Gemini Call Failed: ${error.message}`);
        }
      }

      case 'desktop:launch': {
        const { url, browserPath, userAgent } = args[0];

        // Kill any pending automation processes from previous targets
        activeAgentProcesses.forEach(p => {
          try { p.kill(); } catch (e) {}
        });
        activeAgentProcesses = [];
        
        if (isNW) {
          // If we have a custom browser path (e.g. C:/Program Files/Google/Chrome/...) configured,
          // we use node's child_process to spawn THEIR real chrome. This means they are automatically
          // logged in, have their extensions, and NEVER get detected as a bot by Netflix.
          let finalBrowserPath = browserPath;
          
          if (!finalBrowserPath || finalBrowserPath.trim() === '') {
            // Fetch playwright chromium path if empty
            try {
              let executable = 'python';
              if (!fs.existsSync(path.join(process.cwd(), 'automation'))) {
                 // In production packaged env
                 executable = path.join(path.dirname(process.execPath), 'automation_env', 'python.exe');
              }
              const result = require('child_process').execSync(`"${executable}" -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()"`, { encoding: 'utf-8' });
              const pwPath = result.trim();
              if (fs.existsSync(pwPath)) {
                finalBrowserPath = pwPath;
                console.log('Resolved Playwright Chromium path:', finalBrowserPath);
              }
            } catch (e) {
              console.error('Failed to resolve Playwright Chromium path', e);
            }
          }

          if (finalBrowserPath && fs.existsSync(finalBrowserPath)) {
            return new Promise((resolve) => {
              if (activeStreamWindow) {
                try { activeStreamWindow.kill(); } catch(e){}
                activeStreamWindow = null;
              }

              // Create a dedicated Chrome profile directory so it doesn't conflict with their already-open browser!
              // If we don't do this, Chrome will just open a new tab in their existing window, ignoring the kiosk flags.
              const profileDir = path.join(os.homedir(), 'BrownfieldSatelliteProfile');

              // Prevent "Crash Restore" blocks from discarding launch flags without deleting the user cache/cookies.
              // This surgically resets the "Crashed" flag inside Edge/Chrome's internal state.
              const prefPath = path.join(profileDir, 'Default', 'Preferences');
              if (fs.existsSync(prefPath)) {
                try {
                  const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
                  if (prefs && prefs.profile) {
                    prefs.profile.exit_type = 'Normal';
                    prefs.profile.exited_cleanly = true;
                    fs.writeFileSync(prefPath, JSON.stringify(prefs));
                  }
                } catch (e) {
                  console.error('Could not patch browser preferences:', e);
                }
              }

              // We launch their Chrome in "App Mode" (removes URL bar and tabs)
              // and "Start Fullscreen" so it looks exactly like our NW.js window.
              // Crucially, we open port 9222 ONLY on this specific instance so our Python agent can control it!
              const chromeProcess = spawn(finalBrowserPath, [
                `--app=${url}`,
                '--start-fullscreen',
                '--kiosk', // Enforces absolute fullscreen without window borders
                '--remote-debugging-port=9222',
                '--remote-debugging-host=127.0.0.1',
                '--remote-allow-origins=*', // Prevent origin rejection
                '--disable-infobars',
                '--hide-crash-restore-bubble',
                `--user-data-dir=${profileDir}`,
                '--disable-blink-features=AutomationControlled',
                '--enable-features=AllowLegacyMV2Extensions',
                '--disable-features=ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled'
              ], { detached: true }); // Detached so it survives if our app closes during launch

              chromeProcess.stdout?.on('data', (data: any) => {
                console.log(`Chrome [STDOUT]: ${data.toString()}`);
              });
              
              chromeProcess.stderr?.on('data', (data: any) => {
                console.error(`Chrome [STDERR]: ${data.toString()}`);
              });

              activeStreamWindow = chromeProcess;
              
              if (osRemoteProcess) {
                try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "browser" }) + "\n"); } catch(e){}
              }

              chromeProcess.on('close', (code: number) => {
                console.log(`Chrome closed with code ${code}`);
                activeStreamWindow = null;
                if (osRemoteProcess) {
                  try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "app" }) + "\n"); } catch(e){}
                }
              });

              resolve({ success: true, usingRealBrowser: true });
            });
          }

          // ---- FALLBACK to NW.js internal window if browser path is invalid ----
          if (activeStreamWindow) {
            activeStreamWindow.close();
            activeStreamWindow = null;
          }

          return new Promise((resolve) => {
            (window as any).nw.Window.open(url, {
              id: 'media_player', // Gives it a persistent unique ID
              title: "Brownfield Satellite Stream",
              frame: false,      // Removes the window header and borders entirely
              fullscreen: true,  // Auto-maximizes to perfectly fill the screen
              focus: true
            }, (win: any) => {
              activeStreamWindow = win;
              
              if (osRemoteProcess) {
                try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "browser" }) + "\n"); } catch(e){}
              }

              // Inject a script into Netflix/Max to close the window when the remote hits Home/Back
              win.on('loaded', () => {
                const script = `
                    // Identical V-Cursor for NW.js fallback window
                    if (!window._brownfieldInjected) {
                      window._brownfieldInjected = true;
                      const cursor = document.createElement('div');
                      cursor.id = 'brownfield-virtual-cursor';
                      Object.assign(cursor.style, {
                        position: 'fixed', left: '50%', top: '50%',
                        width: '24px', height: '24px', marginLeft: '-12px', marginTop: '-12px',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        boxShadow: '0 0 10px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 255, 255, 0.4)',
                        borderRadius: '50%', zIndex: '9999999', pointerEvents: 'none', 
                        transition: 'left 0.05s linear, top 0.05s linear, transform 0.1s',
                        display: 'none'
                      });
                      
                      const ensureCursor = () => { if (!document.getElementById('brownfield-virtual-cursor') && document.body) document.body.appendChild(cursor); };
                      if (document.body) ensureCursor(); else document.addEventListener('DOMContentLoaded', ensureCursor);
                      
                      let cx = window.innerWidth / 2, cy = window.innerHeight / 2, pActive = false;

                      window.addEventListener('keydown', (e) => {
                        const active = document.activeElement;
                        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
                        const exitKeys = ['Escape', 'BrowserBack', 'BrowserHome', 'MediaStop'];
                        
                        if (!isInput && (e.key === 'Backspace' || e.key === 'Home')) exitKeys.push(e.key);

                        if (exitKeys.includes(e.key)) {
                          e.preventDefault(); e.stopPropagation();
                          nw.Window.get().close();
                          return;
                        }

                        if (!isInput && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
                          ensureCursor();
                          if (!pActive) { pActive = true; cursor.style.display = 'block'; cx = window.innerWidth/2; cy = window.innerHeight/2; }
                          
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            cursor.style.transform = 'scale(0.7)'; setTimeout(() => { cursor.style.transform = 'scale(1)'; }, 150);
                            cursor.style.display = 'none';
                            const target = document.elementFromPoint(cx, cy);
                            cursor.style.display = 'block';
                            if (target) target.click();
                            return;
                          }

                          e.preventDefault();
                          const step = 60;
                          if (e.key === 'ArrowUp') cy -= step;
                          if (e.key === 'ArrowDown') cy += step;
                          if (e.key === 'ArrowLeft') cx -= step;
                          if (e.key === 'ArrowRight') cx += step;

                          if (cx < 100) window.scrollBy(-step, 0); if (cx > window.innerWidth - 100) window.scrollBy(step, 0);
                          if (cy < 100) window.scrollBy(0, -step); if (cy > window.innerHeight - 100) window.scrollBy(0, step);

                          cx = Math.max(0, Math.min(window.innerWidth, cx)); cy = Math.max(0, Math.min(window.innerHeight, cy));
                          cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px';
                        }
                      }, true);
                    }
                  `;
                  win.eval(null, script);
                });

              win.on('closed', () => {
                activeStreamWindow = null;
                if (osRemoteProcess) {
                  try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "app" }) + "\n"); } catch(e){}
                }
              });
              resolve({ success: true });
            });
          });
        } else {
          window.open(url, '_blank');
          return { success: true };
        }
      }

      case 'desktop:validate-path': {
        const { browserPath } = args[0];
        
        if (!browserPath || browserPath.trim() === "") {
           // Let's resolve the playwright chromium
           try {
              let executable = 'python';
              if (!fs.existsSync(path.join(process.cwd(), 'automation'))) {
                 executable = path.join(path.dirname(process.execPath), 'automation_env', 'python.exe');
              }
              const result = require('child_process').execSync(`"${executable}" -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()"`, { encoding: 'utf-8' });
              const pwPath = result.trim();
              if (fs.existsSync(pwPath)) {
                return { exists: true, message: `Using embedded Playwright Chromium: ${path.basename(pwPath)}` };
              }
           } catch(e) {}
           return { exists: false, message: "Browser path is empty and Playwright Chromium could not be located." };
        }

        if (fs.existsSync(browserPath)) {
          return { exists: true, message: `Executable found! Using: ${path.basename(browserPath)}` };
        } else {
          return { exists: false, message: `File not found at: ${browserPath}. Check your path! (Common Edge path: C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe)` };
        }
      }

      case 'desktop:close': {
        // Kill any pending automation processes so they don't fire erroneously in the background
        activeAgentProcesses.forEach(p => {
          try { p.kill(); } catch (e) {}
        });
        activeAgentProcesses = [];

        if (osRemoteProcess) {
          try { osRemoteProcess.stdin.write(JSON.stringify({ mode: "app" }) + "\n"); } catch(e){}
        }

        if (isNW && activeStreamWindow) {
          try {
             // If it's a child_process (real Chrome)
             if (activeStreamWindow.kill) activeStreamWindow.kill();
             // If it's an NW.js window
             else activeStreamWindow.close();
          } catch(e) {}
          activeStreamWindow = null;
        }
        return { success: true };
      }

      case 'desktop:auto-play': {
        if (!isNW) return { success: false, error: "Only available in NW.js build" };
        
        const { targetText, mediaType, apiKey, platform, visionPrompt, referenceUrl, enableDomSearch, enableGeminiSearch, enableOpenCvSearch } = args[0];
        if (!apiKey) throw new Error("Gemini API Key missing");

        try {
          const result = await runAgent({
            action: 'desktop:auto-play',
            apiKey,
            targetText,
            mediaType,
            platform: platform || 'unknown',
            visionPrompt,
            referenceUrl,
            enableDomSearch,
            enableGeminiSearch,
            enableOpenCvSearch
          });
          
          if (result.success) {
            return { success: true, coords: result.coords };
          }
          throw new Error("Automation failed via Python");
        } catch (error: any) {
          throw error;
        }
      }

      default:
        throw new Error(`Unknown bridge channel: ${channel}`);
    }
  }
};
