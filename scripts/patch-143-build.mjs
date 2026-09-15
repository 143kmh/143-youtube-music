import fs from 'node:fs';
import path from 'node:path';

const mainBundle = path.resolve('dist/main/index.js');
const oldWindowsIcon = 'assets/generated/icons/win/icon.ico';
const newWindowsIcon = 'assets/generated/icons/win/icon.png';
const windowsAppId = 'com.143aimclub.music';
const oldWindowsAppIds = [
  'com.github.th-ch.youtube-music',
  'com.github.th-ch.\\u0079\\u006f\\u0075\\u0074\\u0075\\u0062\\u0065\\u002d\\u006d\\u0075\\u0073\\u0069\\u0063',
];

if (!fs.existsSync(mainBundle)) process.exit(0);

let source = fs.readFileSync(mainBundle, 'utf8');
let changed = false;

if (source.includes(oldWindowsIcon)) {
  source = source.replaceAll(oldWindowsIcon, newWindowsIcon);
  changed = true;
}

for (const oldAppId of oldWindowsAppIds) {
  if (!source.includes(oldAppId)) continue;
  source = source.replaceAll(oldAppId, windowsAppId);
  changed = true;
}

if (!changed) {
  console.log('[143 Music] Windows dev identity already patched');
  process.exit(0);
}

fs.writeFileSync(mainBundle, source, 'utf8');
console.log('[143 Music] Patched Windows dev icon and AppUserModelID');
