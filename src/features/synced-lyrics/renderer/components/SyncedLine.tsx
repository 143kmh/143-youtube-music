import { createEffect, For, Show, createSignal, createMemo } from 'solid-js';
import { type VirtualizerHandle } from 'virtua/solid';

import { type LineLyrics } from '../../types';

import { _ytAPI } from '..';
import { config, currentTime } from '../renderer';
import {
  canonicalize,
  convertChineseCharacter,
  romanize,
  simplifyUnicode,
} from '../utils';

interface SyncedLineProps {
  scroller: VirtualizerHandle;
  index: number;

  line: LineLyrics;
  status: 'upcoming' | 'current' | 'previous';
}

const EmptyLine = (props: SyncedLineProps) => {
  const states = createMemo(() => {
    const defaultText = config()?.defaultTextString ?? '';
    return Array.isArray(defaultText) ? defaultText : [defaultText];
  });

  const index = createMemo(() => {
    const progress = currentTime() - props.line.timeInMs;
    const total = props.line.duration;

    const percentage = Math.min(1, progress / total);
    return Math.max(0, Math.floor((states().length - 1) * percentage));
  });

  return (
    <div
      class={`synced-line ${props.status}`}
      onClick={() => {
        _ytAPI?.seekTo((props.line.timeInMs + 10) / 1000);
      }}
    >
      <div class="description ytmusic-description-shelf-renderer" dir="auto">
        <yt-formatted-string
          text={{
            runs: [
              {
                text: config()?.showTimeCodes ? `[${props.line.time}] ` : '',
              },
            ],
          }}
        />

        <div class="text-lyrics">
          <span>
            <span>
              <Show
                fallback={
                  <yt-formatted-string
                    text={{ runs: [{ text: states()[0] }] }}
                  />
                }
                when={states().length > 1}
              >
                <yt-formatted-string
                  text={{
                    runs: [
                      {
                        text: states().at(
                          props.status === 'current' ? index() : -1,
                        )!,
                      },
                    ],
                  }}
                />
              </Show>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export const SyncedLine = (props: SyncedLineProps) => {
  const text = createMemo(() => {
    let line = props.line.text;
    const convertChineseText = config()?.convertChineseCharacter;
    if (convertChineseText && convertChineseText !== 'disabled') {
      line = convertChineseCharacter(line, convertChineseText);
    }
    return line.trim();
  });

  const timedWords = createMemo(() =>
    (props.line.words ?? []).filter(
      ({ word, timeInMs }) => word.trim().length > 0 && Number.isFinite(timeInMs),
    ),
  );

  const words = createMemo(() => {
    const exact = timedWords();
    if (exact.length > 0) return exact.map(({ word }) => word);
    return text().split(/\s+/u).filter(Boolean);
  });

  // Enhanced LRC sometimes contains a real timestamp for every word. When it
  // does, use it exactly. Most providers expose only line timestamps, so fall
  // back to a length-weighted progression across the duration of the phrase.
  const activeWordIndex = createMemo(() => {
    const values = words();
    if (values.length === 0) return -1;
    if (props.status === 'previous') return values.length - 1;
    if (props.status !== 'current') return -1;

    const now = currentTime();
    const exact = timedWords();
    if (exact.length > 0) {
      let active = 0;
      for (let i = 0; i < exact.length; i++) {
        if (now < exact[i].timeInMs) break;
        active = i;
      }
      return Math.min(active, values.length - 1);
    }

    const finiteDuration =
      Number.isFinite(props.line.duration) && props.line.duration > 0
        ? props.line.duration
        : Math.max(1200, values.length * 420);
    const elapsed = Math.max(0, now - props.line.timeInMs);
    const progress = Math.min(0.999_999, elapsed / finiteDuration);
    const weights = values.map((word) => {
      const letters = word.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
      return Math.max(1, letters);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const target = progress * totalWeight;

    let accumulated = 0;
    for (let i = 0; i < weights.length; i++) {
      accumulated += weights[i];
      if (target < accumulated) return i;
    }
    return values.length - 1;
  });

  const [romanization, setRomanization] = createSignal('');
  createEffect(() => {
    const input = canonicalize(text());
    if (!config()?.romanization) return;

    romanize(input).then((result) => {
      setRomanization(canonicalize(result));
    });
  });

  return (
    <Show fallback={<EmptyLine {...props} />} when={text()}>
      <div
        class={`synced-line ${props.status}`}
        onClick={() => {
          _ytAPI?.seekTo((props.line.timeInMs + 10) / 1000);
        }}
      >
        <div class="description ytmusic-description-shelf-renderer" dir="auto">
          <yt-formatted-string
            text={{
              runs: [
                {
                  text: config()?.showTimeCodes ? `[${props.line.time}] ` : '',
                },
              ],
            }}
          />

          <div
            class="text-lyrics"
            ref={(div: HTMLDivElement) => {
              div.style.setProperty(
                '--lyrics-duration',
                `${
                  Number.isFinite(props.line.duration)
                    ? Math.max(0.8, props.line.duration / 1000)
                    : Math.max(1.2, words().length * 0.42)
                }s`,
                'important',
              );
            }}
            style={{ 'display': 'flex', 'flex-direction': 'column' }}
          >
            <span>
              <For each={words()}>
                {(word, index) => (
                  <span
                    class="lyrics-word"
                    classList={{
                      'is-sung-word': index() < activeWordIndex(),
                      'is-current-word': index() === activeWordIndex(),
                    }}
                    style={{
                      '--lyrics-word-index': `${index()}`,
                      'transition-delay': `${index() * 0.018}s`,
                    }}
                  >
                    <yt-formatted-string
                      text={{
                        runs: [{ text: `${word} ` }],
                      }}
                    />
                  </span>
                )}
              </For>
            </span>

            <Show
              when={
                config()?.romanization &&
                simplifyUnicode(text()) !== simplifyUnicode(romanization())
              }
            >
              <span class="romaji">
                <For each={romanization().split(' ')}>
                  {(word, index) => (
                    <span
                      style={{
                        'transition-delay': `${index() * 0.05}s`,
                        'animation-delay': `${index() * 0.05}s`,
                      }}
                    >
                      <yt-formatted-string
                        text={{
                          runs: [{ text: `${word} ` }],
                        }}
                      />
                    </span>
                  )}
                </For>
              </span>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
