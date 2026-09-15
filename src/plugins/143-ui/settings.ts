import type { RendererContext } from '@/types/contexts';
import type { PluginConfig } from '@/types/plugins';

type Settings = {
  quality: 'default' | 'maximum' | 'opus';
  enabled: boolean;
  alwaysOnTop: boolean;
  resumeOnStart: boolean;
  customFrame: boolean;
  maximized: boolean;
  accent: string;
};

type BackendSettings = Omit<Settings, 'accent'>;

const ACCENT_STORAGE_KEY = 'ui143-accent';
const DEFAULT_ACCENT = '#60519B';
const BRAND_STYLE_ID = 'ui143-brand-theme';

const accentPresets = [
  ['Purple', '#60519B'],
  ['Blue', '#4F7EE8'],
  ['Red', '#D95C67'],
  ['Emerald', '#44B88B'],
  ['Amber', '#D59A45'],
  ['Rose', '#D65A96'],
  ['Silver', '#A7ADB8'],
] as const;

const normalizeAccent = (value: unknown) =>
  typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value.trim())
    ? value.trim().toUpperCase()
    : DEFAULT_ACCENT;

const storedAccent = () => {
  try {
    return normalizeAccent(window.localStorage.getItem(ACCENT_STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT;
  }
};

const applyAccent = (accent: string) => {
  const value = normalizeAccent(accent);
  const root = document.documentElement;
  root.style.setProperty('--ui143-accent', value);
  root.style.setProperty(
    '--ui143-accent-strong',
    `color-mix(in srgb, ${value} 78%, white)`,
  );
  root.style.setProperty(
    '--ui143-accent-soft',
    `color-mix(in srgb, ${value} 18%, transparent)`,
  );
  root.style.setProperty(
    '--ui143-accent-glow',
    `color-mix(in srgb, ${value} 48%, transparent)`,
  );
  return value;
};

const installBrandTheme = () => {
  document.getElementById(BRAND_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = BRAND_STYLE_ID;
  style.textContent = `
    .ui143-brand {
      gap: 9px !important;
      padding-left: 22px !important;
    }

    .ui143-brand-mark {
      min-width: 0 !important;
      height: auto !important;
      padding: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: var(--ui143-accent-strong) !important;
      font-family: "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive !important;
      font-size: 27px !important;
      font-weight: 700 !important;
      font-style: italic !important;
      line-height: 1 !important;
      letter-spacing: -2.4px !important;
      transform: skewX(-7deg) rotate(-2deg);
      transform-origin: center;
      text-shadow: 0 0 18px var(--ui143-accent-glow);
    }

    .ui143-brand-name {
      margin-left: 1px;
      color: #fff !important;
      font-family: "Avenir Next", "Segoe UI Variable Display", "Inter Tight", Inter, ui-sans-serif, sans-serif !important;
      font-size: 16px !important;
      font-weight: 620 !important;
      line-height: 1 !important;
      letter-spacing: -0.18px !important;
      transform: translateY(1px);
    }

    .ui143-nav-item.is-active {
      background: var(--ui143-accent-soft) !important;
      box-shadow: inset 2px 0 0 var(--ui143-accent-strong);
    }

    .ui143-search:focus-within {
      border-color: color-mix(in srgb, var(--ui143-accent-strong) 76%, white) !important;
      box-shadow: 0 0 0 1px var(--ui143-accent-soft) !important;
    }

    .ui143-player-progress-fill::after {
      background: linear-gradient(
        105deg,
        transparent 0 18%,
        color-mix(in srgb, var(--ui143-accent) 10%, transparent) 30%,
        color-mix(in srgb, var(--ui143-accent-strong) 86%, transparent) 48%,
        rgba(255,255,255,.7) 55%,
        transparent 74% 100%
      ) !important;
    }

    .ui143-search-hero-grid:has(> .ui143-search-top-tracks:only-child) {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .ui143-search-hero-grid > .ui143-search-top-tracks:only-child {
      grid-column: 1 / -1;
    }

    .ui143-settings-section-title {
      margin: 22px 0 9px;
      color: #aaa;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .ui143-accent-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 6px 0 14px;
    }

    .ui143-accent-swatch {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      background: var(--swatch);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      cursor: pointer;
    }

    .ui143-accent-swatch:hover {
      transform: scale(1.07);
    }

    .ui143-accent-swatch.is-selected {
      border-color: #fff;
      box-shadow: 0 0 0 2px var(--ui143-accent-soft);
    }

    .ui143-accent-custom {
      display: inline-flex !important;
      align-items: center;
      gap: 9px !important;
      margin: 0 !important;
      color: #aaa;
      font-size: 12px;
    }

    .ui143-accent-custom input[type="color"] {
      width: 34px;
      height: 28px;
      padding: 2px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 7px;
      background: #222;
      cursor: pointer;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

export const mountSettings = (ipc: RendererContext<PluginConfig>['ipc']) => {
  let disposed = false;
  const removeBrandTheme = installBrandTheme();
  applyAccent(storedAccent());

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

  const read = async (): Promise<Settings> => {
    const backend = (await ipc.invoke('143:settings:get')) as BackendSettings;
    return { ...backend, accent: storedAccent() };
  };

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
        )) as BackendSettings;
        if (!disposed && dialog.open)
          render({ ...updated, accent: storedAccent() });
      } catch {
        status.textContent = 'Could not save this setting. Try again.';
        input.disabled = false;
      }
    };

    const setAccent = (value: string) => {
      const accent = applyAccent(value);
      try {
        window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      } catch {
        // The live theme still works even if this profile blocks storage.
      }
      if (!disposed && dialog.open) render({ ...settings, accent });
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

    const appearanceTitle = document.createElement('div');
    appearanceTitle.className = 'ui143-settings-section-title';
    appearanceTitle.textContent = 'Appearance';
    const accentLabel = document.createElement('div');
    accentLabel.textContent = 'Accent color';
    const accents = document.createElement('div');
    accents.className = 'ui143-accent-picker';
    for (const [name, value] of accentPresets) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'ui143-accent-swatch';
      swatch.title = name;
      swatch.setAttribute('aria-label', `${name} accent`);
      swatch.style.setProperty('--swatch', value);
      swatch.classList.toggle(
        'is-selected',
        normalizeAccent(settings.accent) === normalizeAccent(value),
      );
      swatch.addEventListener('click', () => setAccent(value));
      accents.append(swatch);
    }
    const customAccent = document.createElement('label');
    customAccent.className = 'ui143-accent-custom';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.value = normalizeAccent(settings.accent);
    customInput.setAttribute('aria-label', 'Custom accent color');
    customInput.addEventListener('input', () => setAccent(customInput.value));
    customAccent.append(customInput, document.createTextNode('Custom'));
    accents.append(customAccent);

    const audioTitle = document.createElement('div');
    audioTitle.className = 'ui143-settings-section-title';
    audioTitle.textContent = 'Audio';
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

    const appTitle = document.createElement('div');
    appTitle.className = 'ui143-settings-section-title';
    appTitle.textContent = 'App';

    dialog.append(
      title,
      appearanceTitle,
      accentLabel,
      accents,
      audioTitle,
      checkbox('Enable Premium HQ audio', 'enabled'),
      qualityLabel,
      appTitle,
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

  const controls = document.createElement('div');
  controls.className = 'ui143-window-controls';
  // The frame mode is selected before BrowserWindow creation, independently of renderer timing.
  if (!navigator.userAgent.includes('Macintosh')) {
    for (const [label, symbol, action] of [
      ['Minimize', '−', 'minimize'],
      ['Maximize or restore', '□', 'maximize'],
      ['Close window', '×', 'close'],
    ]) {
      const control = button(symbol, () => {
        return ipc.invoke('143:window', action);
      });
      control.title = label;
      control.setAttribute('aria-label', label);
      controls.append(control);
    }
    topbar?.append(controls);
  }

  const doubleClick = (event: MouseEvent) => {
    if (
      event.target === topbar ||
      (event.target instanceof Element &&
        event.target.matches('.ui143-topbar-spacer, .ui143-product'))
    )
      ipc.invoke('143:window', 'maximize');
  };
  topbar?.addEventListener('dblclick', doubleClick);

  return () => {
    disposed = true;
    dialog.remove();
    gear.remove();
    controls.remove();
    removeBrandTheme();
    topbar?.removeEventListener('dblclick', doubleClick);
  };
};