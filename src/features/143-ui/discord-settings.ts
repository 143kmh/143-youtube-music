import {
  DISCORD_STATUS_MODE_OPTIONS,
  isDiscordStatusMode,
} from './discord-presence-options';

import type { RendererContext } from '@/types/contexts';
import type { FeatureConfig } from '@/types/features';

const OLD_PLAY_BUTTON_LABEL = 'Show “Play on YouTube Music” button';
const STATUS_ROW_ATTRIBUTE = 'data-ui143-discord-status-row';

export const mountDiscordSettingsControls = (
  ipc: RendererContext<FeatureConfig>['ipc'],
) => {
  let disposed = false;
  let scheduled = false;

  const enhance = async () => {
    scheduled = false;
    if (disposed) return;

    const panel = document.querySelector<HTMLElement>(
      '.ui143-settings-panel[data-settings-panel="discord"]',
    );
    if (!panel) return;

    for (const row of panel.querySelectorAll<HTMLElement>(
      '.ui143-settings-switch-row',
    )) {
      const label = row
        .querySelector<HTMLElement>('.ui143-settings-switch-copy')
        ?.textContent?.trim();
      if (label === OLD_PLAY_BUTTON_LABEL) row.remove();
    }

    let row = panel.querySelector<HTMLElement>(`[${STATUS_ROW_ATTRIBUTE}]`);
    let select = row?.querySelector<HTMLSelectElement>('select') ?? null;

    if (!row || !select) {
      row = document.createElement('label');
      row.className = 'ui143-settings-row';
      row.setAttribute(STATUS_ROW_ATTRIBUTE, '');

      const label = document.createElement('span');
      label.textContent = 'Status under your name';

      select = document.createElement('select');
      select.className = 'ui143-settings-select';
      select.setAttribute('aria-label', 'Discord status under your name');
      for (const optionInfo of DISCORD_STATUS_MODE_OPTIONS) {
        const option = document.createElement('option');
        option.value = optionInfo.value;
        option.textContent = optionInfo.label;
        select.append(option);
      }
      select.addEventListener('change', () => {
        if (!select || !isDiscordStatusMode(select.value)) return;
        select.disabled = true;
        void ipc
          .invoke('143:settings:set', 'discordStatusMode', select.value)
          .finally(() => {
            if (!disposed && select?.isConnected) select.disabled = false;
          });
      });

      row.append(label, select);
      const richPresenceSwitch = [...panel.querySelectorAll<HTMLElement>(
        '.ui143-settings-switch-row',
      )].find(
        (candidate) =>
          candidate
            .querySelector<HTMLElement>('.ui143-settings-switch-copy')
            ?.textContent?.trim() === 'Discord Rich Presence',
      );
      if (richPresenceSwitch) richPresenceSwitch.after(row);
      else panel.append(row);

      const note = document.createElement('p');
      note.className = 'ui143-settings-note';
      note.setAttribute('data-ui143-discord-status-note', '');
      note.textContent =
        'Discord desktop Rich Presence supports the Listening prefix. Custom no-prefix statuses are not available to desktop apps.';
      row.after(note);
    }

    try {
      const current = (await ipc.invoke('143:settings:get')) as {
        discordStatusMode?: unknown;
      };
      if (disposed || !select.isConnected) return;
      select.value = isDiscordStatusMode(current.discordStatusMode)
        ? current.discordStatusMode
        : 'listening-143';
    } catch {
      // Keep the default selection if Discord settings are temporarily unavailable.
    }
  };

  const schedule = () => {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => void enhance());
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  return () => {
    disposed = true;
    observer.disconnect();
    document.querySelectorAll(`[${STATUS_ROW_ATTRIBUTE}]`).forEach((row) => row.remove());
    document
      .querySelectorAll('[data-ui143-discord-status-note]')
      .forEach((note) => note.remove());
  };
};
