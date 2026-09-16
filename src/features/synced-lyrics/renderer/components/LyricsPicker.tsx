import { createMemo, runWithOwner, type Setter } from 'solid-js';

import { ProviderNames } from '../../providers';
import { reactiveOwner } from '../reactive-root';
import { lyricsStore, setLyricsStore } from '../store';

export const providerIdx = runWithOwner(reactiveOwner, () => createMemo(() => 0))!;

export const LyricsPicker = (props: {
  setStickRef: Setter<HTMLElement | null>;
}) => {
  if (lyricsStore.provider !== ProviderNames.LRCLib)
    setLyricsStore('provider', ProviderNames.LRCLib);

  return (
    <div class="lyrics-picker" ref={props.setStickRef}>
      <div class="lyrics-picker-content">
        <div class="lyrics-picker-content-label">
          <div class="lyrics-picker-item" tabindex="-1">
            <yt-formatted-string
              class="description ytmusic-description-shelf-renderer"
              text={{ runs: [{ text: ProviderNames.LRCLib }] }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
