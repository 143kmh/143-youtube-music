import { test, expect } from '@playwright/test';
import { LRCLib, selectLRCLibResult } from '../src/features/synced-lyrics/providers/LRCLib';
import { findLyrics, hasLyrics } from '../src/features/synced-lyrics/lyrics-search';
import { ProviderNames } from '../src/features/synced-lyrics/providers';
import { LRC } from '../src/features/synced-lyrics/parsers/lrc';
import { activeWordIndex } from '../src/features/now-playing-lyrics-polish/timing';

const info = { title: 'Northern Lights', artist: 'Fixture Artist', album: 'Album', songDuration: 180, videoId: 'fixture' };
const record = (changes = {}) => ({ trackName: info.title, artistName: info.artist, albumName: info.album, duration: 180, instrumental: false,
  plainLyrics: 'First line', syncedLyrics: '[00:10.00]First line\n[00:20.00]Second line', ...changes });

test('lyrics reject another title, version, artist and mismatched duration', () => {
  for (const changes of [{ trackName: 'Different song' }, { trackName: 'Northern Lights (Live)' }, { trackName: 'Northern Lights (Remix)' },
    { artistName: 'Someone Else' }, { duration: 183 }, { instrumental: true }]) {
    expect(selectLRCLibResult([record(changes)], info)).toBeNull();
  }
  expect(selectLRCLibResult([record({ duration: 181.5 })], info)?.title).toBe(info.title);
});

test('matching synced lyrics win over a slightly closer plain-only record', () => {
  const result = selectLRCLibResult([record({ syncedLyrics: null }), record({ duration: 181 })], info);
  expect(result?.lines?.some(line => line.text === 'First line')).toBe(true);
  expect(selectLRCLibResult([record({ syncedLyrics: null, plainLyrics: '' }), record()], info)?.lines?.length).toBe(3);
});

test('LRCLib requests exact metadata first and stops when synced lyrics are found', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async input => {
    urls.push(String(input));
    return new Response(JSON.stringify(record()), { status: 200 });
  }) as typeof fetch;
  try {
    expect(hasLyrics(await new LRCLib().search(info))).toBe(true);
    const url = new URL(urls[0]);
    expect(url.pathname).toBe('/api/get');
    expect(url.searchParams.get('duration')).toBe('180');
    expect(url.searchParams.get('album_name')).toBe('Album');
    expect(urls.length).toBe(1);
  } finally { globalThis.fetch = original; }
});

test('YT Music replaces missing, failed or plain-only LRCLib with timed lyrics', async () => {
  const timed = selectLRCLibResult([record()], info)!;
  for (const value of [null, { title: info.title, artists: [info.artist], lyrics: 'Plain' }, new Error('Unavailable')]) {
    const result = await findLyrics(info, {
      LRCLib: { name: 'LRCLib', baseUrl: '', search: async () => { if (value instanceof Error) throw value; return value; } },
      YTMusic: { name: 'YTMusic', baseUrl: '', search: async () => timed },
    });
    expect(result.provider).toBe(ProviderNames.YTMusic);
    expect(result.result.data).toBe(timed);
  }
});

test('plain lyrics remain available when fallback fails; no lyrics remain unavailable', async () => {
  const plain = { title: info.title, artists: [info.artist], lyrics: 'Plain' };
  for (const value of [plain, null]) {
    const result = await findLyrics(info, {
      LRCLib: { name: 'LRCLib', baseUrl: '', search: async () => value },
      YTMusic: { name: 'YTMusic', baseUrl: '', search: async () => { throw new Error('offline'); } },
    });
    expect(hasLyrics(result.result.data)).toBe(Boolean(value));
  }
});

test('line-only lyrics do not invent word timing; exact words wait for their timestamp', () => {
  const line = { time: '', text: 'One two', timeInMs: 1000, duration: 4000, status: 'current' as const };
  expect(activeWordIndex(line, 3000, 'current')).toBe(-1);
  const exact = { ...line, words: [{ word: 'One', timeInMs: 1500 }, { word: 'two', timeInMs: 2500 }] };
  expect(activeWordIndex(exact, 1000, 'current')).toBe(-1);
  expect(activeWordIndex(exact, 1500, 'current')).toBe(0);
  expect(activeWordIndex(exact, 2500, 'current')).toBe(1);
  expect(activeWordIndex(exact, 1100, 'current')).toBe(-1);
});

test('LRC handles whole seconds, fractional precision, malformed offset and repeated word-timed lines', () => {
  const parsed = LRC.parse('[offset:bad]\n[00:01]One\n[00:02.1234]Two\n[00:03.00][00:06.00]<00:03.20>Again\n[00:09.00]End');
  expect(parsed.lines.find(line => line.text === 'One')?.timeInMs).toBe(1000);
  expect(parsed.lines.find(line => line.text === 'Two')?.timeInMs).toBe(2123);
  expect(parsed.lines.filter(line => line.text === 'Again').map(line => line.words[0].timeInMs)).toEqual([3200, 6200]);
});
