import { currentTime } from '@/features/synced-lyrics/renderer/renderer';
import { currentLyrics } from '@/features/synced-lyrics/renderer/store';
import { createFeature, createRenderer } from '@/utils';

import style from './style.css?inline';

const ROOT_ID = 'ui143-now-playing';

import { activeWordIndex, timedWordsForLine } from './timing';

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

      const lines = currentLyrics()?.data?.lines;
      if (!lines?.length) return;

      const rows = [
        ...scroll.querySelectorAll<HTMLElement>(
          '.ui143-now-playing-lyric[data-index]',
        ),
      ];
      if (rows.length !== lines.length) return;

      const trackKey = [
        lines.length,
        lines[0]?.timeInMs ?? 0,
        lines[0]?.text ?? '',
        lines.at(-1)?.timeInMs ?? 0,
        lines.at(-1)?.text ?? '',
      ].join(':');

      if (trackKey !== this.lastTrackKey) {
        this.lastTrackKey = trackKey;
        this.lastCurrentIndex = -1;
        rows.forEach((row, index) => {
          const words = timedWordsForLine(lines[index]);
          row.replaceChildren();
          if (!words.length) row.textContent = lines[index].text || '♪';
          // The base Now Playing feature also tries to scroll the current row.
          // Disable that per-row call so this feature is the only scroll owner.
          row.scrollIntoView = () => undefined;
          words.forEach(({ word }, wordIndex) => {
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
      const statuses = lines.map((line, index) => {
        if (line.timeInMs > now) return 'upcoming' as const;
        if (now - line.timeInMs >= line.duration) return 'previous' as const;
        currentIndex = index;
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
      scroll.scrollTo({
        top: Math.max(0, target),
        behavior: 'smooth',
      });
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
