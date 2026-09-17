const SETTINGS_POLISH_STYLE_ID = 'ui143-settings-polish';

export const mountSettingsPolish = () => {
  document.getElementById(SETTINGS_POLISH_STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = SETTINGS_POLISH_STYLE_ID;
  style.textContent = `
    .ui143-settings-url-wrap {
      grid-template-columns: minmax(0, 1fr) 108px !important;
      align-items: stretch !important;
      gap: 8px !important;
    }

    .ui143-settings-url-wrap > .ui143-settings-url,
    .ui143-settings-url-wrap > .ui143-settings-button {
      box-sizing: border-box !important;
      height: 42px !important;
    }

    .ui143-settings-url-wrap > .ui143-settings-button {
      position: static !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 108px !important;
      min-width: 108px !important;
      max-width: 108px !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 12px !important;
      transform: none !important;
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      letter-spacing: 0 !important;
      white-space: nowrap !important;
      text-transform: none !important;
    }
  `;
  document.head.append(style);

  return () => style.remove();
};
