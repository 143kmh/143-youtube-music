interface LRCTag {
  tag: string;
  value: string;
}

interface LRCLine {
  time: string;
  timeInMs: number;
  duration: number;
  text: string;
  words: { timeInMs: number; word: string }[];
}

interface LRC {
  tags: LRCTag[];
  lines: LRCLine[];
}

const tagRegex = /^\[(?<tag>\w+):\s*(?<value>.+?)\s*\]$/;
// prettier-ignore
const timestampRegex = /^\[(?<minutes>\d+):(?<seconds>\d+)\.(?<centiseconds>\d+)\]/m;

// Enhanced-LRC can timestamp each word with <mm:ss.xx>. Capture everything
// until the next word timestamp instead of using \w+, so Cyrillic and other
// scripts (plus punctuation) are preserved too.
// prettier-ignore
const wordRegex = /<(?<minutes>\d+):(?<seconds>\d+)\.(?<centiseconds>\d+)>\s*(?<word>[^<]+)/gu;

export const LRC = {
  parse: (text: string): LRC => {
    const lrc: LRC = {
      tags: [],
      lines: [],
    };

    let offset = 0;

    for (let line of text.split('\n')) {
      line = line.trim();
      if (!line.startsWith('[')) continue;

      const timestamps = [];
      let match: Record<string, string> | undefined;
      while ((match = line.match(timestampRegex)?.groups)) {
        const { minutes, seconds, centiseconds } = match;
        const milliseconds = match.centiseconds.padEnd(3, '0');
        const timeInMs =
          ((parseInt(minutes) * 60) * 1000) +
          (parseInt(seconds) * 1000) +
          parseInt(milliseconds);

        timestamps.push({
          time: `${minutes}:${seconds}:${centiseconds}`,
          timeInMs,
        });

        line = line.replace(timestampRegex, '');
      }

      if (!timestamps.length) {
        const tag = line.match(tagRegex)?.groups;
        if (tag) {
          if (tag.tag === 'offset') {
            offset = parseInt(tag.value);
            continue;
          }

          lrc.tags.push({
            tag: tag.tag,
            value: tag.value,
          });
        }
        continue;
      }

      let text = line.trim();
      const words = Array.from(text.matchAll(wordRegex), ({ groups }) => {
        const { minutes, seconds, centiseconds, word } = groups!;
        const milliseconds = centiseconds.padEnd(3, '0');
        const timeInMs =
          ((parseInt(minutes) * 60) * 1000) +
          (parseInt(seconds) * 1000) +
          parseInt(milliseconds);

        return { timeInMs, word: word.trim() };
      }).filter(({ word }) => word.length > 0);

      if (words.length) {
        text = words.map(({ word }) => word).join(' ');
      }

      for (const { time, timeInMs } of timestamps) {
        lrc.lines.push({
          time,
          timeInMs,
          text,
          words,
          duration: Infinity,
        });
      }
    }

    lrc.lines.sort(({ timeInMs: timeA }, { timeInMs: timeB }) => timeA - timeB);

    // Apply the offset consistently to both line and enhanced word timestamps
    // before durations are calculated.
    for (const line of lrc.lines) {
      line.timeInMs += offset;
      line.words = line.words.map((word) => ({
        ...word,
        timeInMs: word.timeInMs + offset,
      }));
    }

    for (let i = 0; i < lrc.lines.length; i++) {
      const current = lrc.lines[i];
      const next = lrc.lines[i + 1];
      if (next) current.duration = next.timeInMs - current.timeInMs;
    }

    const first = lrc.lines.at(0);
    if (first && first.timeInMs > 300) {
      lrc.lines.unshift({
        time: '00:00:00',
        timeInMs: 0,
        duration: first.timeInMs,
        text: '',
        words: [],
      });
    }

    return lrc;
  },
};
