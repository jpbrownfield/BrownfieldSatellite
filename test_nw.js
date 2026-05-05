import { execSync } from 'child_process';
import fs from 'fs';

// Launch NW snippet to print data path
const html = `
<!DOCTYPE html>
<html>
<body>
  <script>
    const fs = require('fs');
    try {
      const p = require('path');
      console.log("REQUIRE WORKED");
      console.log("DATA PATH:", nw.App.dataPath);
      fs.writeFileSync('nw-debug.log', "SUCCESS: " + nw.App.dataPath);
    } catch(e) {
      fs.writeFileSync('nw-debug.log', "ERROR: " + e.message);
    }
    nw.App.quit();
  </script>
</body>
</html>
`;
fs.writeFileSync('temp.html', html);

// Modify package.json temporarily to boot temp.html
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const origMain = pkg.main;
pkg.main = 'temp.html';
fs.writeFileSync('package.json', JSON.stringify(pkg));

try {
  execSync('npx nw .');
} catch (e) {
}

// Restore
pkg.main = origMain;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

const log = fs.existsSync('nw-debug.log') ? fs.readFileSync('nw-debug.log', 'utf8') : 'NO LOG GENERATED';
console.log(log);
