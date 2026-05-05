import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import nwbuild from 'nw-builder';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');

console.log('Building Vite app...');
execSync('npm run build', { stdio: 'inherit', cwd: rootDir });

console.log('Preparing package.json for NW.js...');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

pkg.main = 'index.html';
delete pkg.devDependencies;
delete pkg.scripts;

fs.writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify(pkg, null, 2)
);

// We no longer copy the python scripts into the virtual filesystem.
// Instead, we compile it OUTSIDE the app.

console.log('Compiling Python Agent to standalone `.exe` using PyInstaller...');
try {
  // compile to the `release/temp_pyinstaller` folder to keep things clean
  execSync('pyinstaller --onefile --distpath ./release/automation_dist --workpath ./release/automation_build automation/agent.py', {
    stdio: 'inherit',
    cwd: rootDir
  });
  console.log('Python Agent compilation complete.');
} catch (error) {
  console.error("Pyinstaller failed! Ensure 'pyinstaller' is installed globally (pip install pyinstaller).");
  process.exit(1);
}

console.log('Compiling Remote Mouse Agent to standalone `.exe` using PyInstaller...');
try {
  execSync('pyinstaller --onefile --distpath ./release/automation_dist --workpath ./release/automation_build automation/remote_mouse.py', {
    stdio: 'inherit',
    cwd: rootDir
  });
  console.log('Remote Mouse compilation complete.');
} catch (error) {
  console.error("Pyinstaller failed for remote_mouse.py");
  process.exit(1);
}

console.log('Packaging with nw-builder...');
await nwbuild({
  srcDir: './dist',
  mode: 'build',
  version: 'latest',
  flavor: 'normal',
  platform: 'win',
  arch: 'x64',
  outDir: './release',
  glob: false,
  app: {
    name: 'Brownfield',
    genericName: 'Brownfield Satellite',
    icon: './icon.ico',
    version: '1.0.0'
  }
});

// nw-builder creates varying output directory structures depending on version.
// Usually it's `release/Brownfield - v1.0.0/win-x64/Brownfield.exe` or `release/Brownfield/win32...`
// We need to hunt down the `.exe` folder and copy `agent.exe` next to it.

console.log('Injecting compiled agent.exe and remote_mouse.exe beside the final NW.js application...');
const agentExePath = path.join(rootDir, 'release', 'automation_dist', 'agent.exe');
const remoteMouseExePath = path.join(rootDir, 'release', 'automation_dist', 'remote_mouse.exe');

function findAppFolder(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      // If we find an executable with our name, this is the root folder
      if (fs.existsSync(path.join(fullPath, 'Brownfield.exe'))) {
        return fullPath;
      }
      const nested = findAppFolder(fullPath);
      if (nested) return nested;
    }
  }
  return null;
}

const finalAppFolder = findAppFolder(releaseDir);

if (finalAppFolder) {
  if (fs.existsSync(agentExePath)) {
    fs.copyFileSync(agentExePath, path.join(finalAppFolder, 'agent.exe'));
    console.log(`Successfully injected agent.exe into ${finalAppFolder}`);
  } else {
    console.warn(`WARNING: Could not find agent.exe to inject.`);
  }
  
  if (fs.existsSync(remoteMouseExePath)) {
    fs.copyFileSync(remoteMouseExePath, path.join(finalAppFolder, 'remote_mouse.exe'));
    console.log(`Successfully injected remote_mouse.exe into ${finalAppFolder}`);
  } else {
    console.warn(`WARNING: Could not find remote_mouse.exe to inject.`);
  }
} else {
  console.warn(`WARNING: Could not find the final app folder. Build may be incomplete.`);
}

console.log('Build complete! You can zip or compile the final folder into an installer.');
