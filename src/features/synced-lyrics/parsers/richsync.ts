import type { LineLyrics, LineWordTiming } from '../types';

type RichsyncChunk = {
  c?: unknown;
  o?: unknown;
};

type RichsyncEntry = {
  ts?: unknown;
  te?: unknown;
  x?: unknown;
  l?: unknown;
};

const timeString = (timeInMs: number) => {
  const safe = Math.max(0, Math.floor(timeInMs));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const milliseconds = safe % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

const number = (value: unknown) => {
  const converted = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(converted) ? converted : Number.NaN;
};

const chunksFor = (value: unknown): RichsyncChunk[] =>
  Array.isArray(value)
    ? value.filter(
        (chunk): chunk is RichsyncChunk =>
          chunk !== null && typeof chunk === 'object',
      )
    : [];

const timedWords = (entry: RichsyncEntry, lineSeconds: number) => {
  const words: LineWordTiming[] = [];

  for (const chunk of chunksFor(entry.l)) {
    const rawWord = typeof chunk.c === 'string' ? chunk.c : '';
    if (!rawWord) continue;

    const leading = rawWord.match(/^\s+/u)?.[0] ?? '';
    const trailing = rawWord.match(/\s+$/u)?.[0] ?? '';
    const word = rawWord.trim();

    if (leading && words.length) {
      const previous = words.at(-1)!;
      previous.suffix = `${previous.suffix ?? ''}${leading}`;
    }
    if (!word) {
      if (words.length && !leading) {
        const previous = words.at(-1)!;
        previous.suffix = `${previous.suffix ?? ''}${rawWord}`;
      }
      continue;
    }

    const offset = number(chunk.o);
    if (!Number.isFinite(offset)) continue;
    words.push({
      timeInMs: Math.round((lineSeconds + offset) * 1000),
      word,
      suffix: trailing,
    });
  }

  return words;
};

export const parseRichsync = (body: string): LineLyrics[] => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(decoded)) return [];

  const lines: LineLyrics[] = [];
  for (const value of decoded) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as RichsyncEntry;
    const startSeconds = number(entry.ts);
    if (!Number.isFinite(startSeconds) || startSeconds < 0) continue;

    const words = timedWords(entry, startSeconds);
    if (!words.length) continue;

    const endSeconds = number(entry.te);
    const timeInMs = Math.round(startSeconds * 1000);
    const suppliedText = typeof entry.x === 'string' ? entry.x.trim() : '';
    const reconstructed = words
      .map(({ word, suffix }) => `${word}${suffix ?? ''}`)
      .join('')
      .trim();
    const text = suppliedText || reconstructed;
    if (!text) continue;

    lines.push({
      time: timeString(timeInMs),
      timeInMs,
      duration:
        Number.isFinite(endSeconds) && endSeconds > startSeconds
          ? Math.round((endSeconds - startSeconds) * 1000)
          : 0,
      text,
      words,
      status: 'upcoming',
    });
  }

  lines.sort((a, b) => a.timeInMs - b.timeInMs);
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    if (current.duration <= 0 && next)
      current.duration = Math.max(0, next.timeInMs - current.timeInMs);
  }

  const first = lines[0];
  if (first && first.timeInMs > 300) {
    lines.unshift({
      time: '00:00.000',
      timeInMs: 0,
      duration: first.timeInMs,
      text: '',
      words: [],
      status: 'upcoming',
    });
  }

  return lines;
};
