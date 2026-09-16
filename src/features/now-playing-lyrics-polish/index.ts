import { currentTime } from '@/features/synced-lyrics/renderer/renderer';
import { currentLyrics } from '@/features/synced-lyrics/renderer/store';
import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

const ROOT_ID = 'ui143-now-playing';

type TimedWord = Readonly<{
  word: string;
  timeInMs: number;
}>;

const wordsForLine = (line: NonNullable<ReturnType<typeof currentLyrics>['data']>['lines'][number]) => {
  const exact = (line.words ?? []).filter(
    ({ word, timeInMs }) => word.trim().length > 0 && Number.isFinite(timeInMs),
  );
  if (exact.length > 0) return exact.map(({ word }) => word);
  return line.text.trim().split(/\s+/u).filter(Boolean);
};

const timedWordsForLine = (line: NonNullable<ReturnType<typeof currentLyrics>['data']>['lines'][number]) =>
  (line.words ?? []).filter(
    ({ word, timeInMs }): word is string & never =>
      word.trim().length > 0 && Number.isFinite(timeInMs),
  ) as unknown as TimedWord[];

const activeWordIndex = (
  line: NonNullable<ReturnType<typeof currentLyrics>['data']>['lines'][number],
  now: number,
  status: 'previous' | 'current' | 'upcoming',
) => {
  const values = wordsForLine(line);
  if (values.length === 0) return -1;
  if (status === 'previous') return values.length - 1;
  if (status !== 'current') return -1;

  const exact = timedWordsForLine(line);
  if (exact.length > 0) {
    let active = 0;
    for (let index = 0; index < exact.length; index++) {
      if (now < exact[index].timeInMs) break;
      active = index;
    }
    return Math.min(active, values.length - 1);
  }

  const finiteDuration =
    Number.isFinite(line.duration) && line.duration > 0
      ? line.duration
      : Math.max(1200, values.length * 420);
  const elapsed = Math.max(0, now - line.timeInMs);
  const progress = Math.min(0.999_999, elapsed / finiteDuration);
  const weights = values.map((word) => {
    const letters = word.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    return Math.max(1, letters);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const target = progress * totalWeight;

  let accumulated = 0;
  for (let index = 0; index < weights.length; index++) {
    accumulated += weights[index];
    if (target < accumulated) return index;
  }
  return values.length - 1;
};

const renderer = createRenderer<{
  timer: number | null;
  lastTrackKey: string;
  lastCurrentIndex: number;
}>({
  timer: null,
  lastTrackKey: '',
  lastCurrentIndex: -1,

  start() {
    const sync = () => {
      const root = document.getElementById(ROOT_ID);
      const pane = root?.querySelector<HTMLElement>('[data-pane="lyrics"]');
      const scroll = pane?.querySelector<HTMLElement>('.ui143-now-playing-lyrics');
      if (!root || root.hidden || !pane || pane.hidden || !scroll) return;

      const data = currentLyrics()?.data;
      const lines = data?.lines;
      if (!lines?.length) return;

      const rows = [
        ...scroll.querySelectorAll<HTMLElement>(
          '.ui143-now-playing-lyric[data-index]',
        ),
      ];
      if (rows.length !== lines.length) return;

      const trackKey = `${lines.length}:${lines[0]?.timeInMs ?? 0}:${lines.at(-1)?.timeInMs ?? 0}`;
      if (trackKey !== this.lastTrackKey) {
        this.lastTrackKey = trackKey;
        this.lastCurrentIndex = -1;
        rows.forEach((row, index) => {
          const line = lines[index];
          const words = wordsForLine(line);
          row.replaceChildren();
          words.forEach((word, wordIndex) => {
            const span = document.createElement('span');
            span.className = 'ui143-now-playing-word';
            span.dataset.wordIndex = String(wordIndex);
            span.textContent = `${word} `;
            row.append(span);
          });
        });
      }

      const now = currentTime();
      let currentIndex = -1;
      const statuses = lines.map((line) => {
        if (line.timeInMs >= now) return 'upcoming' as const;
        if (now - line.timeInMs >= line.duration) return 'previous' as const;
        currentIndex = lines.indexOf(line);
        return 'current' as const;
      });

      rows.forEach((row, index) => {
        const status = statuses[index];
        row.classList.toggle('is-current', status === 'current');
        row.classList.toggle('is-past', status === 'previous');
        row.classList.toggle('is-upcoming', status === 'upcoming');

        const active = activeWordIndex(lines[index], now, status);
        row
          .querySelectorAll<HTMLElement>('.ui143-now-playing-word')
          .forEach((word, wordIndex) => {
            word.classList.toggle('is-sung-word', wordIndex < active);
            word.classList.toggle('is-current-word', wordIndex === active);
          });
      });

      if (currentIndex < 0 || currentIndex === this.lastCurrentIndex) return;
      this.lastCurrentIndex = currentIndex;
      const current = rows[currentIndex];
      const target =
        current.offsetTop - (scroll.clientHeight - current.offsetHeight) / 2;
      scroll.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    };

    this.timer = window.setInterval(sync, 90);
    sync();
  },

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.lastTrackKey = '';
    this.lastCurrentIndex = -1;
  },
});

export default createFeature({
  name: () => '143 Now Playing Lyrics Polish',
  description: () =>
    'Keeps the 143 playback layout while matching synced-lyrics word timing and motion.',
  config: { enabled: true },
  stylesheets: [style],
  renderer,
});
