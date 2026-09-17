import { createMemo, runWithOwner, type Setter } from 'solid-js';

import { reactiveOwner } from '../reactive-root';
import { lyricsStore } from '../store';

export const providerIdx = runWithOwner(reactiveOwner, () => createMemo(() => 0))!;

export const LyricsPicker = (props: {
  setStickRef: Setter<HTMLElement | null>;
}) => {
  return (
    <div class="lyrics-picker" ref={props.setStickRef}>
      <div class="lyrics-picker-content">
        <div class="lyrics-picker-content-label">
          <div class="lyrics-picker-item" tabindex="-1">
            <yt-formatted-string
              class="description ytmusic-description-shelf-renderer"
              text={{ runs: [{ text: lyricsStore.provider }] }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
