import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

type DiscordStatus =
  | 'disabled'
  | 'needs-application-id'
  | 'connecting'
  | 'connected'
  | 'disconnected';

type BackendSettings = {
  quality: 'default' | 'maximum' | 'opus';
  enabled: boolean;
  discordEnabled: boolean;
  discordAutoReconnect: boolean;
  discordShowDuration: boolean;
  discordClearOnPause: boolean;
  discordPlayButton: boolean;
  discordStatus: DiscordStatus;
  alwaysOnTop: boolean;
  resumeOnStart: boolean;
  startWithWindows: boolean;
  startWithWindowsSupported: boolean;
  appVersion: string;
  customFrame: boolean;
  maximized: boolean;
};

type Settings = BackendSettings & {
  accent: string;
  obsUseAccentColor: boolean;
  obsHideWhenPaused: boolean;
  obsUrl: string;
};

type SettingsTab = 'appearance' | 'audio' | 'discord' | 'obs' | 'app';
type BooleanSettingKey =
  | 'enabled'
  | 'discordEnabled'
  | 'discordAutoReconnect'
  | 'discordShowDuration'
  | 'discordClearOnPause'
  | 'discordPlayButton'
  | 'alwaysOnTop'
  | 'resumeOnStart'
  | 'startWithWindows';

const ACCENT_STORAGE_KEY = 'ui143-accent';
const OBS_ACCENT_STORAGE_KEY = 'ui143-obs-use-accent';
const OBS_HIDE_STORAGE_KEY = 'ui143-obs-hide-when-paused';
const DEFAULT_ACCENT = '#60519B';
const DEFAULT_OBS_URL = 'http://127.0.0.1:14321/overlay';
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

const storedObsUseAccent = () => {
  try {
    return window.localStorage.getItem(OBS_ACCENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const storedObsHide = () => {
  try {
    const value = window.localStorage.getItem(OBS_HIDE_STORAGE_KEY);
    return value == null ? true : value === 'true';
  } catch {
    return true;
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
    .ui143-brand { gap: 9px !important; padding-left: 22px !important; }
    .ui143-brand-mark {
      min-width: 0 !important; height: auto !important; padding: 0 !important;
      border-radius: 0 !important; background: transparent !important;
      color: var(--ui143-accent-strong) !important;
      font-family: "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive !important;
      font-size: 27px !important; font-weight: 700 !important; font-style: italic !important;
      line-height: 1 !important; letter-spacing: -2.4px !important;
      transform: skewX(-7deg) rotate(-2deg); transform-origin: center;
      text-shadow: 0 0 18px var(--ui143-accent-glow);
    }
    .ui143-brand-name {
      margin-left: 1px; color: var(--ui143-accent-strong) !important;
      font-family: "Avenir Next", "Segoe UI Variable Display", "Inter Tight", Inter, ui-sans-serif, sans-serif !important;
      font-size: 16px !important; font-weight: 620 !important; line-height: 1 !important;
      letter-spacing: -.18px !important; transform: translateY(1px);
      text-shadow: 0 0 16px var(--ui143-accent-glow);
    }
    .ui143-product { display: none !important; }
    .ui143-nav-item.is-active {
      background: var(--ui143-accent-soft) !important;
      box-shadow: inset 2px 0 0 var(--ui143-accent-strong);
    }
    .ui143-search:focus-within {
      border-color: color-mix(in srgb, var(--ui143-accent-strong) 76%, white) !important;
      box-shadow: 0 0 0 1px var(--ui143-accent-soft) !important;
    }

    .ui143-settings {
      width: min(760px, 92vw) !important; max-height: min(720px, 88vh);
      padding: 0 !important; overflow: hidden;
      border-color: rgba(255,255,255,.09) !important; border-radius: 15px !important;
      background: #151517 !important; box-shadow: 0 30px 100px rgba(0,0,0,.58);
    }
    .ui143-settings-header {
      display: flex; align-items: center; justify-content: space-between; gap: 18px;
      min-height: 72px; padding: 0 24px; border-bottom: 1px solid rgba(255,255,255,.055);
    }
    .ui143-settings-header h2 { margin: 0 !important; font-size: 20px !important; letter-spacing: -.025em; }
    .ui143-settings-close {
      width: 34px; height: 34px; margin: 0 !important; padding: 0 !important; border: 0 !important;
      border-radius: 50% !important; background: rgba(255,255,255,.045) !important;
      color: #aaa !important; font-size: 21px; cursor: pointer;
    }
    .ui143-settings-close:hover { background: rgba(255,255,255,.09) !important; color: #fff !important; }
    .ui143-settings-tabs {
      display: flex; align-items: center; gap: 6px; padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,.045); background: rgba(255,255,255,.012);
    }
    .ui143-settings-tab {
      margin: 0 !important; padding: 8px 13px !important; border: 0 !important;
      border-radius: 999px !important; background: transparent !important;
      color: #8f8f92 !important; font-size: 12px; font-weight: 700; cursor: pointer;
    }
    .ui143-settings-tab:hover { color: #ddd !important; background: rgba(255,255,255,.045) !important; }
    .ui143-settings-tab.is-active {
      color: #fff !important; background: var(--ui143-accent-soft) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui143-accent-strong) 28%, transparent);
    }
    .ui143-settings-panels {
      min-height: 360px; max-height: calc(min(720px, 88vh) - 126px);
      overflow: auto; padding: 10px 24px 26px;
    }
    .ui143-settings-panel[hidden] { display: none !important; }
    .ui143-settings-panel { animation: ui143-settings-panel-in 140ms ease; }
    @keyframes ui143-settings-panel-in {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ui143-settings-section-title {
      margin: 20px 0 9px; color: #aaa; font-size: 11px; font-weight: 800;
      letter-spacing: .08em; text-transform: uppercase;
    }
    .ui143-settings-note { margin: -2px 0 12px; color: #777; font-size: 10.5px; line-height: 1.5; }
    .ui143-settings-discord-status { color: #aaa; }
    .ui143-settings-row,
    .ui143-settings-switch-row {
      min-height: 44px; margin: 8px 0; padding: 8px 10px; border-radius: 8px;
      background: rgba(255,255,255,.022);
    }
    .ui143-settings-row:hover,
    .ui143-settings-switch-row:hover { background: rgba(255,255,255,.038); }
    .ui143-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .ui143-settings-value { color: #a8a8ad; font-size: 12px; font-variant-numeric: tabular-nums; }
    .ui143-settings-switch-row {
      position: relative; display: flex; align-items: center; gap: 12px; cursor: pointer;
    }
    .ui143-settings-switch-copy { flex: 1; min-width: 0; }
    .ui143-switch-input { position: absolute; opacity: 0; pointer-events: none; }
    .ui143-switch-track {
      position: relative; flex: 0 0 auto; width: 40px; height: 22px; border-radius: 999px;
      background: #35353a; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
      transition: background 150ms ease, box-shadow 150ms ease;
    }
    .ui143-switch-track::after {
      content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
      border-radius: 50%; background: #c6c6ca; transition: transform 150ms ease, background 150ms ease;
    }
    .ui143-switch-input:checked + .ui143-switch-track {
      background: var(--ui143-accent-strong);
      box-shadow: 0 0 0 1px var(--ui143-accent-soft), 0 0 16px var(--ui143-accent-glow);
    }
    .ui143-switch-input:checked + .ui143-switch-track::after { transform: translateX(18px); background: #fff; }
    .ui143-switch-input:disabled + .ui143-switch-track { opacity: .4; }
    .ui143-settings-switch-row:has(.ui143-switch-input:disabled) { opacity: .58; cursor: default; }
    .ui143-settings-select,
    .ui143-settings-url {
      border: 1px solid rgba(255,255,255,.14); border-radius: 7px;
      background: #202020; color: #eee; font: inherit;
    }
    .ui143-settings-select { min-width: min(320px, 50%); padding: 7px 9px; }
    .ui143-settings-url-wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin: 8px 0 14px; }
    .ui143-settings-url { min-width: 0; width: 100%; padding: 9px 10px; }
    .ui143-settings-button {
      margin: 10px 8px 0 0 !important; padding: 8px 12px !important;
      border: 1px solid rgba(255,255,255,.11) !important; border-radius: 8px !important;
      background: rgba(255,255,255,.045) !important; color: #ddd !important; cursor: pointer;
    }
    .ui143-settings-button:hover { background: rgba(255,255,255,.085) !important; color: #fff !important; }
    .ui143-settings-status { min-height: 18px; margin: 12px 2px 0; color: #d98c8c; font-size: 11px; }
    .ui143-accent-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin: 10px 0 18px; }
    .ui143-accent-swatch {
      width: 30px; height: 30px; margin: 0 !important; padding: 0 !important;
      border: 2px solid transparent !important; border-radius: 50% !important;
      background: var(--swatch) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); cursor: pointer;
    }
    .ui143-accent-swatch:hover { transform: scale(1.07); }
    .ui143-accent-swatch.is-selected { border-color: #fff !important; box-shadow: 0 0 0 2px var(--ui143-accent-soft); }
    .ui143-accent-custom {
      display: inline-flex; align-items: center; gap: 9px; color: #aaa; font-size: 12px;
    }
    .ui143-accent-custom input[type="color"] {
      width: 36px; height: 30px; padding: 2px; border: 1px solid rgba(255,255,255,.16);
      border-radius: 7px; background: #222; cursor: pointer;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

export const mountSettings = (ipc: RendererContext<FeatureConfig>['ipc']) => {
  let disposed = false;
  let activeTab: SettingsTab = 'appearance';
  const removeBrandTheme = installBrandTheme();
  applyAccent(storedAccent());

  const topbar = document.querySelector<HTMLElement>('.ui143-topbar');
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'ui143-circle-button ui143-settings-button-icon';
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
    let obsUrl = DEFAULT_OBS_URL;
    try {
      const value = await ipc.invoke('obs-overlay:get-url');
      if (typeof value === 'string' && value.startsWith('http://127.0.0.1:'))
        obsUrl = value;
    } catch {
      // OBS feature may still be starting; the preferred URL remains useful.
    }
    return {
      ...backend,
      accent: storedAccent(),
      obsUseAccentColor: storedObsUseAccent(),
      obsHideWhenPaused: storedObsHide(),
      obsUrl,
    };
  };

  const sectionTitle = (label: string) => {
    const element = document.createElement('div');
    element.className = 'ui143-settings-section-title';
    element.textContent = label;
    return element;
  };

  const actionButton = (label: string, action: () => void) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'ui143-settings-button';
    control.textContent = label;
    control.addEventListener('click', action);
    return control;
  };

  const render = (settings: Settings) => {
    dialog.replaceChildren();

    const header = document.createElement('div');
    header.className = 'ui143-settings-header';
    const title = document.createElement('h2');
    title.textContent = '143 Music settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui143-settings-close';
    close.setAttribute('aria-label', 'Close settings');
    close.title = 'Close';
    close.textContent = '×';
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);

    const status = document.createElement('p');
    status.className = 'ui143-settings-status';
    status.setAttribute('role', 'status');

    const save = async (
      key: string,
      value: unknown,
      input: HTMLInputElement | HTMLSelectElement,
    ) => {
      input.disabled = true;
      try {
        await ipc.invoke('143:settings:set', key, value);
        if (!disposed && dialog.open) render(await read());
      } catch {
        status.textContent = 'Could not save this setting. Try again.';
        input.disabled = false;
      }
    };

    const switchRow = (
      label: string,
      checked: boolean,
      onChange: (checked: boolean, input: HTMLInputElement) => void,
      disabled = false,
    ) => {
      const row = document.createElement('label');
      row.className = 'ui143-settings-switch-row';
      const copy = document.createElement('span');
      copy.className = 'ui143-settings-switch-copy';
      copy.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'ui143-switch-input';
      input.checked = checked;
      input.disabled = disabled;
      const track = document.createElement('span');
      track.className = 'ui143-switch-track';
      input.addEventListener('change', () => onChange(input.checked, input));
      row.append(copy, input, track);
      return row;
    };

    const backendSwitch = (
      label: string,
      key: BooleanSettingKey,
      disabled = false,
    ) =>
      switchRow(
        label,
        settings[key],
        (checked, input) => void save(key, checked, input),
        disabled,
      );

    const valueRow = (label: string, value: string) => {
      const row = document.createElement('div');
      row.className = 'ui143-settings-row';
      const name = document.createElement('span');
      name.textContent = label;
      const current = document.createElement('span');
      current.className = 'ui143-settings-value';
      current.textContent = value;
      row.append(name, current);
      return row;
    };

    const appearancePanel = document.createElement('section');
    appearancePanel.className = 'ui143-settings-panel';
    appearancePanel.dataset.settingsPanel = 'appearance';
    appearancePanel.append(sectionTitle('Appearance'));
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
      swatch.addEventListener('click', () => {
        const accent = applyAccent(value);
        try {
          window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
        } catch {}
        if (!disposed && dialog.open) render({ ...settings, accent });
      });
      accents.append(swatch);
    }
    const customAccent = document.createElement('label');
    customAccent.className = 'ui143-accent-custom';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.value = normalizeAccent(settings.accent);
    customInput.setAttribute('aria-label', 'Custom accent color');
    customInput.addEventListener('input', () => {
      const accent = applyAccent(customInput.value);
      try {
        window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      } catch {}
    });
    customInput.addEventListener('change', () => {
      if (!disposed && dialog.open)
        render({ ...settings, accent: storedAccent() });
    });
    customAccent.append(customInput, document.createTextNode('Custom'));
    accents.append(customAccent);
    appearancePanel.append(accentLabel, accents);

    const audioPanel = document.createElement('section');
    audioPanel.className = 'ui143-settings-panel';
    audioPanel.dataset.settingsPanel = 'audio';
    audioPanel.append(sectionTitle('Audio'));
    audioPanel.append(backendSwitch('Enable Premium HQ audio', 'enabled'));
    const qualityRow = document.createElement('label');
    qualityRow.className = 'ui143-settings-row';
    const qualityText = document.createElement('span');
    qualityText.textContent = 'Audio quality';
    const quality = document.createElement('select');
    quality.className = 'ui143-settings-select';
    for (const [value, label] of [
      ['default', 'YouTube Music default'],
      ['maximum', 'Premium HQ · AAC'],
      ['opus', 'Premium HQ · Opus'],
    ] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      quality.append(option);
    }
    quality.value = settings.quality;
    quality.addEventListener('change', () => void save('quality', quality.value, quality));
    qualityRow.append(qualityText, quality);
    audioPanel.append(
      qualityRow,
      actionButton('Audio details', () => {
        void ipc.invoke('143:window', 'audio-details');
      }),
    );

    const discordPanel = document.createElement('section');
    discordPanel.className = 'ui143-settings-panel';
    discordPanel.dataset.settingsPanel = 'discord';
    discordPanel.append(sectionTitle('Discord'));
    const discordStatus = document.createElement('p');
    discordStatus.className = 'ui143-settings-note ui143-settings-discord-status';
    discordStatus.textContent = `Status: ${
      {
        disabled: 'disabled',
        'needs-application-id': 'unavailable',
        connecting: 'connecting…',
        connected: 'connected',
        disconnected: 'Discord unavailable',
      }[settings.discordStatus]
    }`;
    discordPanel.append(
      discordStatus,
      backendSwitch('Discord Rich Presence', 'discordEnabled'),
      backendSwitch('Auto reconnect to Discord', 'discordAutoReconnect'),
      backendSwitch('Show remaining track time', 'discordShowDuration'),
      backendSwitch(
        'Hide Rich Presence after 30 seconds paused',
        'discordClearOnPause',
      ),
      backendSwitch('Show “Play on YouTube Music” button', 'discordPlayButton'),
    );

    const obsPanel = document.createElement('section');
    obsPanel.className = 'ui143-settings-panel';
    obsPanel.dataset.settingsPanel = 'obs';
    obsPanel.append(sectionTitle('OBS overlay'));
    const obsNote = document.createElement('p');
    obsNote.className = 'ui143-settings-note';
    obsNote.textContent =
      'Add this local URL as an OBS Browser Source. The overlay is served only from this computer.';
    const urlWrap = document.createElement('div');
    urlWrap.className = 'ui143-settings-url-wrap';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'ui143-settings-url';
    urlInput.readOnly = true;
    urlInput.value = settings.obsUrl;
    urlInput.setAttribute('aria-label', 'OBS Browser Source URL');
    const copyUrl = actionButton('Copy URL', () => {
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(settings.obsUrl);
          copyUrl.textContent = 'Copied';
          window.setTimeout(() => (copyUrl.textContent = 'Copy URL'), 1200);
        } catch {
          urlInput.select();
          document.execCommand('copy');
        }
      };
      void copy();
    });
    copyUrl.style.margin = '0';
    urlWrap.append(urlInput, copyUrl);
    const obsAccent = switchRow(
      'Use 143 Music accent color in widget',
      settings.obsUseAccentColor,
      (checked) => {
        try {
          window.localStorage.setItem(OBS_ACCENT_STORAGE_KEY, String(checked));
        } catch {}
        if (!disposed && dialog.open)
          render({ ...settings, obsUseAccentColor: checked });
      },
    );
    const obsHide = switchRow(
      'Hide widget after 30 seconds paused',
      settings.obsHideWhenPaused,
      (checked) => {
        try {
          window.localStorage.setItem(OBS_HIDE_STORAGE_KEY, String(checked));
        } catch {}
        if (!disposed && dialog.open)
          render({ ...settings, obsHideWhenPaused: checked });
      },
    );
    obsPanel.append(obsNote, urlWrap, obsAccent, obsHide);

    const appPanel = document.createElement('section');
    appPanel.className = 'ui143-settings-panel';
    appPanel.dataset.settingsPanel = 'app';
    appPanel.append(
      sectionTitle('App'),
      valueRow('Version', settings.appVersion || 'Unknown'),
      backendSwitch('Always on top', 'alwaysOnTop'),
      backendSwitch('Resume on start', 'resumeOnStart'),
      backendSwitch(
        'Start with Windows',
        'startWithWindows',
        !settings.startWithWindowsSupported,
      ),
    );

    const panels = new Map<SettingsTab, HTMLElement>([
      ['appearance', appearancePanel],
      ['audio', audioPanel],
      ['discord', discordPanel],
      ['obs', obsPanel],
      ['app', appPanel],
    ]);

    const tabBar = document.createElement('nav');
    tabBar.className = 'ui143-settings-tabs';
    tabBar.setAttribute('aria-label', 'Settings sections');
    const tabButtons = new Map<SettingsTab, HTMLButtonElement>();
    const activate = (tab: SettingsTab) => {
      activeTab = tab;
      for (const [id, panel] of panels) panel.hidden = id !== tab;
      for (const [id, control] of tabButtons) {
        const active = id === tab;
        control.classList.toggle('is-active', active);
        control.setAttribute('aria-selected', String(active));
      }
    };

    for (const [id, label] of [
      ['appearance', 'Appearance'],
      ['audio', 'Audio'],
      ['discord', 'Discord'],
      ['obs', 'OBS'],
      ['app', 'App'],
    ] as const) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'ui143-settings-tab';
      control.textContent = label;
      control.setAttribute('role', 'tab');
      control.addEventListener('click', () => activate(id));
      tabButtons.set(id, control);
      tabBar.append(control);
    }

    const panelWrap = document.createElement('div');
    panelWrap.className = 'ui143-settings-panels';
    panelWrap.append(
      appearancePanel,
      audioPanel,
      discordPanel,
      obsPanel,
      appPanel,
      status,
    );
    dialog.append(header, tabBar, panelWrap);
    activate(activeTab);
  };

  const openSettings = async (tab?: SettingsTab) => {
    if (tab) activeTab = tab;
    try {
      const settings = await read();
      if (disposed) return;
      render(settings);
      if (!dialog.open) dialog.showModal();
    } catch {
      if (disposed) return;
      dialog.textContent = 'Could not load settings. Press Escape to close.';
      if (!dialog.open) dialog.showModal();
    }
  };

  gear.addEventListener('click', () => void openSettings());

  const openSettingsEvent = (event: Event) => {
    const requested = (event as CustomEvent<SettingsTab>).detail;
    const tab: SettingsTab =
      requested === 'appearance' ||
      requested === 'audio' ||
      requested === 'discord' ||
      requested === 'obs' ||
      requested === 'app'
        ? requested
        : activeTab;
    void openSettings(tab);
  };
  document.addEventListener('ui143:open-settings', openSettingsEvent);

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });

  const controls = document.createElement('div');
  controls.className = 'ui143-window-controls';
  if (!navigator.userAgent.includes('Macintosh')) {
    for (const [label, symbol, action] of [
      ['Minimize', '−', 'minimize'],
      ['Maximize or restore', '□', 'maximize'],
      ['Close window', '×', 'close'],
    ]) {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = symbol;
      control.title = label;
      control.setAttribute('aria-label', label);
      control.addEventListener('click', () => void ipc.invoke('143:window', action));
      controls.append(control);
    }
    topbar?.append(controls);
  }

  const doubleClick = (event: MouseEvent) => {
    if (
      event.target === topbar ||
      (event.target instanceof Element &&
        event.target.matches('.ui143-topbar-spacer'))
    )
      void ipc.invoke('143:window', 'maximize');
  };
  topbar?.addEventListener('dblclick', doubleClick);

  return () => {
    disposed = true;
    document.removeEventListener('ui143:open-settings', openSettingsEvent);
    dialog.remove();
    gear.remove();
    controls.remove();
    removeBrandTheme();
    topbar?.removeEventListener('dblclick', doubleClick);
  };
};