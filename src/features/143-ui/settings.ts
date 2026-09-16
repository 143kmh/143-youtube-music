import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

type Settings = {
  quality: 'default' | 'maximum' | 'opus';
  enabled: boolean;
  discordEnabled: boolean;
  discordApplicationId: string;
  discordAutoReconnect: boolean;
  discordShowDuration: boolean;
  discordClearOnPause: boolean;
  discordPauseTimeoutMinutes: number;
  discordPlayButton: boolean;
  discordStatus:
    | 'disabled'
    | 'needs-application-id'
    | 'connecting'
    | 'connected'
    | 'disconnected';
  alwaysOnTop: boolean;
  resumeOnStart: boolean;
  customFrame: boolean;
  maximized: boolean;
  accent: string;
};

type BackendSettings = Omit<Settings, 'accent'>;
type SettingsTab = 'appearance' | 'audio' | 'discord' | 'app';

type BooleanSettingKey =
  | 'enabled'
  | 'discordEnabled'
  | 'discordAutoReconnect'
  | 'discordShowDuration'
  | 'discordClearOnPause'
  | 'discordPlayButton'
  | 'alwaysOnTop'
  | 'resumeOnStart';

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

    .ui143-settings {
      width: min(760px, 92vw) !important;
      max-height: min(720px, 88vh);
      padding: 0 !important;
      overflow: hidden;
      border-color: rgba(255,255,255,.09) !important;
      border-radius: 15px !important;
      background: #151517 !important;
      box-shadow: 0 30px 100px rgba(0,0,0,.58);
    }

    .ui143-settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      min-height: 72px;
      padding: 0 24px;
      border-bottom: 1px solid rgba(255,255,255,.055);
    }

    .ui143-settings-header h2 {
      margin: 0 !important;
      font-size: 20px !important;
      letter-spacing: -.025em;
    }

    .ui143-settings-close {
      width: 34px;
      height: 34px;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 50% !important;
      background: rgba(255,255,255,.045) !important;
      color: #aaa !important;
      font-size: 21px;
      cursor: pointer;
    }

    .ui143-settings-close:hover {
      background: rgba(255,255,255,.09) !important;
      color: #fff !important;
    }

    .ui143-settings-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,.045);
      background: rgba(255,255,255,.012);
    }

    .ui143-settings-tab {
      margin: 0 !important;
      padding: 8px 13px !important;
      border: 0 !important;
      border-radius: 999px !important;
      background: transparent !important;
      color: #8f8f92 !important;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .ui143-settings-tab:hover {
      color: #ddd !important;
      background: rgba(255,255,255,.045) !important;
    }

    .ui143-settings-tab.is-active {
      color: #fff !important;
      background: var(--ui143-accent-soft) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui143-accent-strong) 28%, transparent);
    }

    .ui143-settings-panels {
      min-height: 360px;
      max-height: calc(min(720px, 88vh) - 126px);
      overflow: auto;
      padding: 10px 24px 26px;
    }

    .ui143-settings-panel[hidden] { display: none !important; }
    .ui143-settings-panel { animation: ui143-settings-panel-in 140ms ease; }

    @keyframes ui143-settings-panel-in {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ui143-settings-section-title {
      margin: 20px 0 9px;
      color: #aaa;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .ui143-settings-note {
      margin: -2px 0 12px;
      color: #777;
      font-size: 10.5px;
      line-height: 1.5;
    }

    .ui143-settings-discord-status { color: #aaa; }

    .ui143-settings-panel > label {
      min-height: 42px;
      margin: 8px 0 !important;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.022);
    }

    .ui143-settings-panel > label:hover { background: rgba(255,255,255,.038); }

    .ui143-settings-inline {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) 86px;
      align-items: center;
      gap: 12px !important;
    }

    .ui143-settings-inline input[type="number"] {
      width: 86px;
      min-width: 0;
      padding: 7px 9px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 7px;
      background: #202020;
      color: #eee;
      font: inherit;
    }

    .ui143-settings-inline input[type="number"]:disabled { opacity: .45; }

    .ui143-settings-app-id {
      display: block !important;
      padding: 10px !important;
    }

    .ui143-settings-app-id input[type="text"] {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      margin-top: 8px;
      padding: 9px 10px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 7px;
      background: #202020;
      color: #eee;
      font: inherit;
    }

    .ui143-settings-panel select {
      margin-left: auto;
      min-width: min(320px, 50%);
    }

    .ui143-settings-panel > button {
      margin: 10px 8px 0 0 !important;
    }

    .ui143-settings-status {
      min-height: 18px;
      margin: 12px 2px 0;
      color: #d98c8c;
      font-size: 11px;
    }

    .ui143-accent-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 9px;
      margin: 10px 0 18px;
    }

    .ui143-accent-swatch {
      width: 30px;
      height: 30px;
      margin: 0 !important;
      padding: 0 !important;
      border: 2px solid transparent !important;
      border-radius: 50% !important;
      background: var(--swatch) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.12);
      cursor: pointer;
    }

    .ui143-accent-swatch:hover { transform: scale(1.07); }
    .ui143-accent-swatch.is-selected {
      border-color: #fff !important;
      box-shadow: 0 0 0 2px var(--ui143-accent-soft);
    }

    .ui143-accent-custom {
      display: inline-flex !important;
      align-items: center;
      min-height: 0 !important;
      gap: 9px !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      color: #aaa;
      font-size: 12px;
    }

    .ui143-accent-custom input[type="color"] {
      width: 36px;
      height: 30px;
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

export const mountSettings = (ipc: RendererContext<FeatureConfig>['ipc']) => {
  let disposed = false;
  let activeTab: SettingsTab = 'appearance';
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

    const checkbox = (label: string, key: BooleanSettingKey) => {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[key];
      input.addEventListener('change', () => save(key, input.checked, input));
      row.append(input, document.createTextNode(label));
      return row;
    };

    const sectionTitle = (label: string) => {
      const element = document.createElement('div');
      element.className = 'ui143-settings-section-title';
      element.textContent = label;
      return element;
    };

    const appearancePanel = document.createElement('section');
    appearancePanel.className = 'ui143-settings-panel';
    appearancePanel.dataset.settingsPanel = 'appearance';
    const appearanceTitle = sectionTitle('Appearance');
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
    appearancePanel.append(appearanceTitle, accentLabel, accents);

    const audioPanel = document.createElement('section');
    audioPanel.className = 'ui143-settings-panel';
    audioPanel.dataset.settingsPanel = 'audio';
    const audioTitle = sectionTitle('Audio');
    const qualityLabel = document.createElement('label');
    const qualityText = document.createElement('span');
    qualityText.textContent = 'Audio quality';
    const quality = document.createElement('select');
    for (const [value, label] of [
      ['default', 'YouTube Music default'],
      ['maximum', 'Premium HQ · AAC'],
      ['opus', 'Premium HQ · Opus'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      quality.append(option);
    }
    quality.value = settings.quality;
    quality.addEventListener('change', () => save('quality', quality.value, quality));
    qualityLabel.append(qualityText, quality);
    audioPanel.append(
      audioTitle,
      checkbox('Enable Premium HQ audio', 'enabled'),
      qualityLabel,
      button('Audio details', () => {
        void ipc.invoke('143:window', 'audio-details');
      }),
    );

    const discordPanel = document.createElement('section');
    discordPanel.className = 'ui143-settings-panel';
    discordPanel.dataset.settingsPanel = 'discord';
    const discordTitle = sectionTitle('Discord');
    const discordNote = document.createElement('p');
    discordNote.className = 'ui143-settings-note';
    discordNote.textContent =
      '143 Music connects to Discord directly. Paste the Application ID for your “143 Music” Discord application below.';
    const discordStatus = document.createElement('p');
    discordStatus.className = 'ui143-settings-note ui143-settings-discord-status';
    discordStatus.textContent = `Status: ${
      {
        disabled: 'disabled',
        'needs-application-id': 'Application ID required',
        connecting: 'connecting…',
        connected: 'connected',
        disconnected: 'Discord unavailable',
      }[settings.discordStatus]
    }`;
    const applicationIdLabel = document.createElement('label');
    applicationIdLabel.className = 'ui143-settings-app-id';
    applicationIdLabel.append(document.createTextNode('Discord Application ID'));
    const applicationId = document.createElement('input');
    applicationId.type = 'text';
    applicationId.inputMode = 'numeric';
    applicationId.autocomplete = 'off';
    applicationId.spellcheck = false;
    applicationId.placeholder = 'e.g. 1234567890123456789';
    applicationId.value = settings.discordApplicationId;
    applicationId.addEventListener('change', () =>
      save('discordApplicationId', applicationId.value.trim(), applicationId),
    );
    applicationIdLabel.append(applicationId);

    const timeoutLabel = document.createElement('label');
    timeoutLabel.className = 'ui143-settings-inline';
    const timeoutText = document.createElement('span');
    timeoutText.textContent = 'Clear after pause (minutes)';
    const timeout = document.createElement('input');
    timeout.type = 'number';
    timeout.min = '0';
    timeout.max = '1440';
    timeout.step = '1';
    timeout.value = String(settings.discordPauseTimeoutMinutes);
    timeout.disabled = !settings.discordClearOnPause;
    timeout.addEventListener('change', () => {
      const minutes = Number(timeout.value);
      if (!Number.isFinite(minutes)) return;
      void save(
        'discordPauseTimeoutMinutes',
        Math.max(0, Math.min(1440, Math.round(minutes))),
        timeout,
      );
    });
    timeoutLabel.append(timeoutText, timeout);

    discordPanel.append(
      discordTitle,
      discordNote,
      discordStatus,
      applicationIdLabel,
      checkbox('Enable Discord Rich Presence', 'discordEnabled'),
      checkbox('Auto reconnect to Discord', 'discordAutoReconnect'),
      checkbox('Show remaining track time', 'discordShowDuration'),
      checkbox('Clear presence when paused', 'discordClearOnPause'),
      timeoutLabel,
      checkbox('Show “Play on YouTube Music” button', 'discordPlayButton'),
    );

    const appPanel = document.createElement('section');
    appPanel.className = 'ui143-settings-panel';
    appPanel.dataset.settingsPanel = 'app';
    const appTitle = sectionTitle('App');
    appPanel.append(
      appTitle,
      checkbox('Always on top', 'alwaysOnTop'),
      checkbox('Resume on start', 'resumeOnStart'),
      button('Advanced settings', () => {
        dialog.close();
        void ipc.invoke('143:window', 'advanced');
      }),
    );

    const panels = new Map<SettingsTab, HTMLElement>([
      ['appearance', appearancePanel],
      ['audio', audioPanel],
      ['discord', discordPanel],
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
    panelWrap.append(appearancePanel, audioPanel, discordPanel, appPanel, status);
    dialog.append(header, tabBar, panelWrap);
    activate(activeTab);
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
      const control = button(symbol, () => {
        void ipc.invoke('143:window', action);
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
      void ipc.invoke('143:window', 'maximize');
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
