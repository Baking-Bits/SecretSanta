const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'start-dev.ps1');
const candidates = ['pwsh', 'pwsh.exe', 'powershell', 'powershell.exe'];

for (const cmd of candidates) {
  try {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    const res = spawnSync(cmd, args, { stdio: 'inherit' });
    if (res.error) {
      // try next
      continue;
    }
    process.exit(res.status);
  } catch (err) {
    continue;
  }
}

console.error('Could not find PowerShell executable (tried pwsh and powershell). Please run the script manually: start-dev.ps1');
process.exit(1);
