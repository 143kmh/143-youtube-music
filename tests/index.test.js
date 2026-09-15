import path from 'node:path';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { test, expect, _electron as electron } from '@playwright/test';

process.env.NODE_ENV = 'test';

const appPath = path.resolve(import.meta.dirname, '..');

test('143 Music launches with an isolated default profile', async ({}, testInfo) => {
  const profile = testInfo.outputPath('profile');
  await mkdir(profile, { recursive: true });
  const bootstrap = testInfo.outputPath('bootstrap.cjs');
  await writeFile(
    bootstrap,
    `require('electron').app.setPath('userData', ${JSON.stringify(profile)}); import(${JSON.stringify(pathToFileURL(path.join(appPath, 'dist/main/index.js')).href)});`,
  );
  const app = await electron.launch({
    cwd: appPath,
    env: { ...process.env, NODE_ENV: 'production' },
    args: [
      bootstrap,
      '--no-sandbox',
      '--disable-gpu',
      '--whitelisted-ips=',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const window = await app.firstWindow();

    const consentForm = await window.$(
      "form[action='https://consent.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com/save']",
    );
    if (consentForm) {
      await consentForm.click('button');
    }

    // const title = await window.title();
    // expect(title.replaceAll(/\s/g, ' ')).toEqual('Pear Desktop');

    const url = window.url();
    expect(
      url.startsWith(
        'https://music.\u0079\u006f\u0075\u0074\u0075\u0062\u0065.com',
      ),
    ).toBe(true);

    await expect(window.locator('#ui143-player')).toBeVisible();
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      window.getByRole('dialog', { name: '143 Music settings' }),
    ).toBeVisible();
    await window.getByRole('checkbox', { name: 'Always on top' }).check();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
        ),
      )
      .toBe(true);
    await window.getByRole('button', { name: 'Close', exact: true }).click();
    await window.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      window.getByRole('checkbox', { name: 'Always on top' }),
    ).toBeChecked();
    await window.screenshot({ path: testInfo.outputPath('settings.png') });
    await window.getByRole('button', { name: 'Close', exact: true }).click();
    if (process.platform !== 'darwin') {
      await window.getByRole('button', { name: 'Maximize or restore' }).click();
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isMaximized(),
          ),
        )
        .toBe(true);
      await window.getByRole('button', { name: 'Maximize or restore' }).click();
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].isMaximized(),
          ),
        )
        .toBe(false);
    }
  } finally {
    await app.close();
  }
});
