import fs from 'node:fs';
import path from 'node:path';

const mainBundle = path.resolve('dist/main/index.js');
const oldWindowsIcon = 'assets/generated/icons/win/icon.ico';
const newWindowsIcon = 'assets/generated/icons/win/icon.png';

if (!fs.existsSync(mainBundle)) process.exit(0);

const source = fs.readFileSync(mainBundle, 'utf8');
if (!source.includes(oldWindowsIcon)) process.exit(0);

fs.writeFileSync(
  mainBundle,
  source.replaceAll(oldWindowsIcon, newWindowsIcon),
  'utf8',
);

console.log('[143 Music] Patched Windows dev icon to 143 Music PNG');
