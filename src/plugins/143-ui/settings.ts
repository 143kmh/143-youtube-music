import type { RendererContext } from '@/types/contexts';
import type { PluginConfig } from '@/types/plugins';

type Settings = {
  quality: 'default' | 'maximum' | 'opus';
  enabled: boolean;
  alwaysOnTop: boolean;
  resumeOnStart: boolean;
};

export const mountSettings = (ipc: RendererContext<PluginConfig>['ipc']) => {
  let disposed = false;
  const topbar = document.querySelector<HTMLElement>('.ui143-topbar');
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'ui143-circle-button ui143-settings-button';
  gear.setAttribute('aria-label', 'Settings');
  gear.title = 'Settings';
  gear.textContent = '⚙';
  topbar?.append(gear);
  const dialog = document.createElement('dialog');
  dialog.className = 'ui143-settings';
  dialog.setAttribute('aria-label', '143 Music settings');
  document.body.append(dialog);
  const read = () => ipc.invoke('143:settings:get') as Promise<Settings>;
  const button = (label: string, action: () => void) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.addEventListener('click', action);
    return control;
  };
  const render = (settings: Settings) => {
    dialog.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = '143 Music settings';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const save = async (
      key: string,
      value: unknown,
      input: HTMLInputElement | HTMLSelectElement,
    ) => {
      input.disabled = true;
      try {
        const updated = (await ipc.invoke(
          '143:settings:set',
          key,
          value,
        )) as Settings;
        if (!disposed && dialog.open) render(updated);
      } catch {
        status.textContent = 'Could not save this setting. Try again.';
        input.disabled = false;
      }
    };
    const checkbox = (
      label: string,
      key: 'enabled' | 'alwaysOnTop' | 'resumeOnStart',
    ) => {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[key];
      input.addEventListener('change', () => {
        return save(key, input.checked, input);
      });
      row.append(input, document.createTextNode(label));
      return row;
    };
    const qualityLabel = document.createElement('label');
    qualityLabel.textContent = 'Audio quality';
    const quality = document.createElement('select');
    for (const [value, label] of [
      ['default', 'YouTube Music default'],
      ['maximum', 'Premium HQ · AAC'],
      ['opus', 'Premium HQ · Opus (experimental)'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      quality.append(option);
    }
    quality.value = settings.quality;
    quality.addEventListener('change', () => {
      return save('quality', quality.value, quality);
    });
    qualityLabel.append(quality);
    dialog.append(
      title,
      checkbox('Enable Premium HQ audio', 'enabled'),
      qualityLabel,
      checkbox('Always on top', 'alwaysOnTop'),
      checkbox('Resume on start', 'resumeOnStart'),
      button('Audio details', () => {
        return ipc.invoke('143:window', 'audio-details');
      }),
      button('Advanced settings', () => {
        dialog.close();
        return ipc.invoke('143:window', 'advanced');
      }),
      status,
      button('Close', () => dialog.close()),
    );
  };
  gear.addEventListener('click', async () => {
    try {
      const settings = await read();
      if (!disposed) {
        render(settings);
        if (!dialog.open) dialog.showModal();
      }
    } catch {
      if (!disposed) {
        dialog.textContent = 'Could not load settings. Press Escape to close.';
        if (!dialog.open) dialog.showModal();
      }
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
  return () => {
    disposed = true;
    dialog.remove();
    gear.remove();
  };
};
