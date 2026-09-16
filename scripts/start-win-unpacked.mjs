import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.platform !== 'win32') {
  console.error('[143 Music] start:win is only available on Windows.');
  process.exit(1);
}

const exePath = path.resolve('pack', 'win-unpacked', 'YouTube Music.exe');
if (!fs.existsSync(exePath)) {
  console.error(`[143 Music] Missing unpacked executable: ${exePath}`);
  console.error('[143 Music] Run this command through pnpm start:win so the app is built first.');
  process.exit(1);
}

const child = spawn(exePath, [], {
  cwd: path.dirname(exePath),
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error('[143 Music] Failed to launch unpacked Windows app', error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
