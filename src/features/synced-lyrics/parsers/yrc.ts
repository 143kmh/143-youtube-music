import type { LineLyrics, LineWordTiming } from '../types';

const lineRegex = /^\[(?<start>[^,\]]+),(?<duration>\d+)\](?<body>.*)$/u;
const wordRegex = /\((?<start>\d+),(?<duration>\d+),-?\d+\)(?<word>.*?)(?=\(\d+,\d+,-?\d+\)|$)/gu;

const parseLineStart = (value: string) => {
  if (/^\d+$/u.test(value)) return Number(value);
  const match = value.match(
    /^(?<minutes>\d+):(?<seconds>\d{1,2})(?:\.(?<fraction>\d+))?$/u,
  )?.groups;
  if (!match) return Number.NaN;
  const milliseconds = (match.fraction ?? '0').slice(0, 3).padEnd(3, '0');
  return (
    Number(match.minutes) * 60_000 +
    Number(match.seconds) * 1000 +
    Number(milliseconds)
  );
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

type ParsedWord = LineWordTiming & { duration: number; rawStart: number };

type RawWord = {
  rawStart: number;
  duration: number;
  word: string;
};

const parseWords = (body: string, lineStart: number, lineDuration: number) => {
  const raw = Array.from(body.matchAll(wordRegex), ({ groups }): RawWord => ({
    rawStart: Number(groups?.start),
    duration: Number(groups?.duration),
    word: groups?.word ?? '',
  })).filter(
    ({ rawStart, duration, word }) =>
      Number.isFinite(rawStart) &&
      rawStart >= 0 &&
      Number.isFinite(duration) &&
      duration >= 0 &&
      word.length > 0,
  );

  if (!raw.length) return [];

  // NetEase has shipped both absolute and line-relative YRC word starts.
  // Relative values stay close to the line duration while absolute values are
  // near the line start itself, so handle both formats without guessing per word.
  const largestRawStart = Math.max(...raw.map(({ rawStart }) => rawStart));
  const firstRawStart = raw[0].rawStart;
  const relativeLimit = Math.max(lineDuration + 2000, 5000);
  const relative =
    lineStart > 1000 &&
    firstRawStart < Math.max(1000, lineStart - 1000) &&
    largestRawStart <= relativeLimit;

  const parsed: ParsedWord[] = [];
  for (const { rawStart, duration, word: rawWord } of raw) {
    const leading = rawWord.match(/^\s+/u)?.[0] ?? '';
    const trailing = rawWord.match(/\s+$/u)?.[0] ?? '';
    const word = rawWord.trim();

    if (leading && parsed.length) {
      const previous = parsed.at(-1)!;
      previous.suffix = `${previous.suffix ?? ''}${leading}`;
    }
    if (!word) {
      if (parsed.length && !leading) {
        const previous = parsed.at(-1)!;
        previous.suffix = `${previous.suffix ?? ''}${rawWord}`;
      }
      continue;
    }

    parsed.push({
      rawStart,
      duration,
      word,
      suffix: trailing,
      timeInMs: rawStart + (relative ? lineStart : 0),
    });
  }

  return parsed;
};

export const YRC = {
  parse(text: string): LineLyrics[] {
    const lines: LineLyrics[] = [];

    for (const rawLine of text.split(/\r?\n/u)) {
      const groups = rawLine.trim().match(lineRegex)?.groups;
      if (!groups) continue;

      const timeInMs = parseLineStart(groups.start);
      const declaredDuration = Number(groups.duration);
      if (!Number.isFinite(timeInMs) || timeInMs < 0) continue;

      const parsedWords = parseWords(
        groups.body,
        timeInMs,
        Number.isFinite(declaredDuration) ? declaredDuration : 0,
      );
      if (!parsedWords.length) continue;

      const textValue = parsedWords
        .map(({ word, suffix }) => `${word}${suffix ?? ''}`)
        .join('')
        .trim();
      if (!textValue) continue;

      const inferredDuration = Math.max(
        0,
        Math.max(
          ...parsedWords.map(
            ({ timeInMs: wordStart, duration }) => wordStart + duration,
          ),
        ) - timeInMs,
      );

      lines.push({
        time: timeString(timeInMs),
        timeInMs,
        duration:
          Number.isFinite(declaredDuration) && declaredDuration > 0
            ? declaredDuration
            : inferredDuration,
        text: textValue,
        words: parsedWords.map(({ timeInMs: wordStart, word, suffix }) => ({
          timeInMs: wordStart,
          word,
          suffix,
        })),
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
  },
};
