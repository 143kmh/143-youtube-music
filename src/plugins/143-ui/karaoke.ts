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

type EmbeddedLyricsRenderer = {
  observerCallback: MutationCallback;
  observer?: MutationObserver;
  videoDataChange: () => Promise<void>;
  updateTimestampInterval?: NodeJS.Timeout | string | number;
  start: (ctx: RendererContext<SyncedLyricsPluginConfig>) => Promise<void> | void;
  stop: () => Promise<void> | void;
  onPlayerApiReady: (api: MusicPlayer) => Promise<void> | void;
};

// createRenderer's public type is a union because plugins may also use a
// one-function lifecycle. The synced-lyrics renderer is known to use the object
// lifecycle above, so narrow it once here instead of leaking casts everywhere.
const lyricsRenderer = syncedLyricsRenderer as unknown as EmbeddedLyricsRenderer;

let styleSheet: CSSStyleSheet | null = null;
let started = false;
let methodsBound = false;

const bindRendererMethods = () => {
  if (methodsBound) return;
  methodsBound = true;

  lyricsRenderer.observerCallback =
    lyricsRenderer.observerCallback.bind(lyricsRenderer);
  lyricsRenderer.videoDataChange = lyricsRenderer.videoDataChange.bind(lyricsRenderer);
  lyricsRenderer.onPlayerApiReady =
    lyricsRenderer.onPlayerApiReady.bind(lyricsRenderer);
  lyricsRenderer.start = lyricsRenderer.start.bind(lyricsRenderer);
  lyricsRenderer.stop = lyricsRenderer.stop.bind(lyricsRenderer);
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

  await lyricsRenderer.start(karaokeContext(ctx));
  // YT Music itself is often plain-text only. LRCLib is the best default for
  // timed lines, while the embedded picker still lets the user change source.
  setLyricsStore('provider', ProviderNames.LRCLib);
};

export const attachKaraokePlayer = async (api: MusicPlayer) => {
  if (!started) return;
  await lyricsRenderer.onPlayerApiReady(api);
};

export const stopKaraoke = () => {
  lyricsRenderer.observer?.disconnect();
  if (lyricsRenderer.updateTimestampInterval) {
    clearInterval(
      lyricsRenderer.updateTimestampInterval as ReturnType<typeof setInterval>,
    );
    lyricsRenderer.updateTimestampInterval = undefined;
  }
  void lyricsRenderer.stop();

  if (styleSheet) {
    void styleSheet.replace('');
    styleSheet = null;
  }
  started = false;
};
