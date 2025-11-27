const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'public', '20241128_151019.jpg');
const destDir = path.join(__dirname, '..', 'client', 'public');
const dest = path.join(destDir, 'hero.jpg');

if (!fs.existsSync(src)) {
  console.error('Source photo not found:', src);
  process.exit(2);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied', src, '->', dest);
