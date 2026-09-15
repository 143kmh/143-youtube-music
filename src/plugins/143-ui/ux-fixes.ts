import { installCatalogCache } from './catalog-cache';
import { installDomPolish } from './dom-polish';
import { installPlaylistIsolation } from './playlist-isolation';
import { installPlaylistSuggestions } from './playlist-suggestions';
import { installShelfInput } from './shelf-input';

import type { PlaybackContextAdapter } from './playback-context';

export const installUxFixes = (engine: PlaybackContextAdapter) => {
  const cleanup = [
    installCatalogCache(engine),
    installPlaylistIsolation(),
    installShelfInput(),
    installDomPolish(),
    installPlaylistSuggestions(engine),
  ];
  return () => {
    for (const dispose of cleanup.reverse()) dispose();
  };
};
