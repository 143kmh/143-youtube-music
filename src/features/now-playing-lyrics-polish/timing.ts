import type { LineLyrics, LineLyricsStatus } from '../synced-lyrics/types';

export const timedWordsForLine = (line: LineLyrics) => {
  const words = line.words ?? [];
  // Only use complete, ordered provider timestamps belonging to this line.
  if (!words.length || words.some((word, index) => !word.word.trim() ||
    !Number.isFinite(word.timeInMs) || word.timeInMs < line.timeInMs ||
    word.timeInMs >= line.timeInMs + line.duration ||
    (index > 0 && word.timeInMs < words[index - 1].timeInMs))) return [];
  return words;
};

export const activeWordIndex = (line: LineLyrics, now: number, status: LineLyricsStatus) => {
  const words = timedWordsForLine(line);
  if (status === 'previous') return words.length - 1;
  if (status !== 'current') return -1;
  let active = -1;
  for (let index = 0; index < words.length && words[index].timeInMs <= now; index++) active = index;
  return active;
};
