import { ProviderNames } from '../synced-lyrics/providers';
import { renderer as syncedLyricsRenderer } from '../synced-lyrics/renderer';
import { setLyricsStore } from '../synced-lyrics/renderer/store';
import syncedLyricsStyle from '../synced-lyrics/style.css?inline';

import type { SyncedLyricsPluginConfig } from '../synced-lyrics/types';
import type { RendererContext } from '@/types/contexts';
import type { MusicPlayer } from '@/types/music-player';
import type { PluginConfig } from '@/types/plugins';

const config: SyncedLyricsPluginConfig = {
  enabled: true,
  preferredProvider: ProviderNames.LRCLib,
  preciseTiming: true,
  showTimeCodes: false,
  defaultTextString: '♪',
  showLyricsEvenIfInexact: true,
  lineEffect: 'fancy',
  romanization: true,
  convertChineseCharacter: 'disabled',
};

let styleSheet: CSSStyleSheet | null = null;
let started = false;
let methodsBound = false;

const bindRendererMethods = () => {
  if (methodsBound) return;
  methodsBound = true;

  for (const [key, value] of Object.entries(syncedLyricsRenderer)) {
    if (typeof value !== 'function') continue;
    Object.assign(syncedLyricsRenderer, {
      [key]: value.bind(syncedLyricsRenderer),
    });
  }
};

const karaokeContext = (
  ctx: RendererContext<PluginConfig>,
): RendererContext<SyncedLyricsPluginConfig> => ({
  getConfig: async () => config,
  setConfig: async () => {},
  ipc: ctx.ipc,
});

export const startKaraoke = async (ctx: RendererContext<PluginConfig>) => {
  if (started) return;
  started = true;
  bindRendererMethods();

  styleSheet = new CSSStyleSheet();
  await styleSheet.replace(syncedLyricsStyle);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

  await syncedLyricsRenderer.start(karaokeContext(ctx));
  // YT Music itself is often plain-text only. LRCLib is the best default for
  // timed lines, while the embedded picker still lets the user change source.
  setLyricsStore('provider', ProviderNames.LRCLib);
};

export const attachKaraokePlayer = async (api: MusicPlayer) => {
  if (!started) return;
  await syncedLyricsRenderer.onPlayerApiReady(api);
};

export const stopKaraoke = () => {
  syncedLyricsRenderer.observer?.disconnect();
  if (syncedLyricsRenderer.updateTimestampInterval) {
    clearInterval(syncedLyricsRenderer.updateTimestampInterval);
    syncedLyricsRenderer.updateTimestampInterval = undefined;
  }
  syncedLyricsRenderer.stop();

  if (styleSheet) {
    void styleSheet.replace('');
    styleSheet = null;
  }
  started = false;
};
