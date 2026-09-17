import { jaroWinkler } from '@skyra/jaro-winkler';

import { YRC } from '../parsers/yrc';
import { netFetch } from '../renderer';

import type { LyricProvider, LyricResult, SearchSongInfo } from '../types';

type JsonObject = Record<string, unknown>;

type NetEaseCandidate = {
  id: string;
  title: string;
  artists: string[];
  album: string;
  durationSeconds: number;
  score: number;
};

const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*[-–]\s*topic$/u, '')
    .replace(/\((?:official\s+)?(?:audio|video|lyrics?)\)/gu, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const versions = (value: string) =>
  [
    ...normalize(value).matchAll(
      /\b(live|remix|acoustic|instrumental|karaoke|sped up|slowed|nightcore|radio edit)\b/gu,
    ),
  ]
    .map((match) => match[0])
    .sort()
    .join('|');

const splitArtists = (value: string) =>
  value
    .split(/\s*(?:&|,|feat\.?|ft\.?)\s*/iu)
    .map(normalize)
    .filter(Boolean);

const similarity = (left: string, right: string) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  return jaroWinkler(a, b);
};

const artistNames = (song: JsonObject) => {
  const raw = Array.isArray(song.artists)
    ? song.artists
    : Array.isArray(song.ar)
      ? song.ar
      : [];
  return raw
    .map((artist) => text(asObject(artist)?.name))
    .map((artist) => artist.trim())
    .filter(Boolean);
};

const albumName = (song: JsonObject) =>
  text(asObject(song.album)?.name || asObject(song.al)?.name).trim();

const durationSeconds = (song: JsonObject) => {
  const milliseconds = Number.isFinite(finiteNumber(song.duration))
    ? finiteNumber(song.duration)
    : finiteNumber(song.dt);
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : Number.NaN;
};

const songId = (song: JsonObject) => {
  if (typeof song.id === 'number' && Number.isFinite(song.id))
    return String(song.id);
  if (typeof song.id === 'string' && /^\d+$/u.test(song.id)) return song.id;
  return '';
};

const searchSongs = (payload: unknown) => {
  const root = asObject(payload);
  const result = asObject(root?.result);
  return Array.isArray(result?.songs) ? result.songs : [];
};

const lyricsText = (payload: unknown, key: 'yrc' | 'klyric') => {
  const root = asObject(payload);
  return text(asObject(root?.[key])?.lyric);
};

const parseJson = (body: string) => {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
};

const requestJson = async (url: string) => {
  const [status, body] = await netFetch(url, {
    headers: {
      Referer: 'https://music.163.com/',
      Accept: 'application/json, text/plain, */*',
    },
  });
  if (status < 200 || status >= 300) return null;
  return parseJson(body);
};

const rankCandidates = (songs: unknown[], info: SearchSongInfo) => {
  const expectedTitles = [info.title, info.alternativeTitle].filter(
    (title): title is string => Boolean(title?.trim()),
  );
  const expectedArtists = splitArtists(info.artist);
  const expectedAlbum = normalize(info.album ?? '');

  return songs
    .map((value): NetEaseCandidate | null => {
      const song = asObject(value);
      if (!song) return null;

      const id = songId(song);
      const title = text(song.name).trim();
      const artists = artistNames(song);
      const album = albumName(song);
      const duration = durationSeconds(song);
      if (!id || !title || !artists.length || !Number.isFinite(duration))
        return null;

      const titleScore = Math.max(
        0,
        ...expectedTitles.map((expected) => similarity(expected, title)),
      );
      const artistScore = Math.max(
        0,
        ...artists.flatMap((artist) =>
          expectedArtists.map((expected) =>
            jaroWinkler(expected, normalize(artist)),
          ),
        ),
      );
      const versionMatches = expectedTitles.some(
        (expected) => versions(expected) === versions(title),
      );
      const durationDifference =
        info.songDuration > 0 ? Math.abs(duration - info.songDuration) : 0;

      if (
        titleScore < 0.93 ||
        artistScore < 0.9 ||
        !versionMatches ||
        (info.songDuration > 0 && durationDifference > 3.5)
      )
        return null;

      const albumBonus =
        expectedAlbum && normalize(album) === expectedAlbum ? 0.08 : 0;
      const durationBonus =
        info.songDuration > 0
          ? Math.max(0, 0.05 - durationDifference * 0.01)
          : 0;

      return {
        id,
        title,
        artists,
        album,
        durationSeconds: duration,
        score:
          titleScore * 0.55 +
          artistScore * 0.37 +
          albumBonus +
          durationBonus,
      };
    })
    .filter((candidate): candidate is NetEaseCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score);
};

const wordTimedResult = (
  candidate: NetEaseCandidate,
  payload: unknown,
): LyricResult | null => {
  for (const raw of [lyricsText(payload, 'yrc'), lyricsText(payload, 'klyric')]) {
    if (!raw) continue;
    const lines = YRC.parse(raw);
    const timedWordCount = lines.reduce(
      (sum, line) => sum + (line.words?.length ?? 0),
      0,
    );
    if (!timedWordCount) continue;
    return {
      title: candidate.title,
      artists: candidate.artists,
      lines,
    };
  }
  return null;
};

export class NetEase implements LyricProvider {
  name = 'NetEase';
  baseUrl = 'https://music.163.com';

  async search(info: SearchSongInfo): Promise<LyricResult | null> {
    const titles = [info.title, info.alternativeTitle]
      .filter((title): title is string => Boolean(title?.trim()))
      .filter((title, index, values) => values.indexOf(title) === index);
    const seen = new Set<string>();
    const candidates: NetEaseCandidate[] = [];

    for (const title of titles) {
      const params = new URLSearchParams({
        s: `${title} ${info.artist}`,
        type: '1',
        limit: '10',
        offset: '0',
      });
      const urls = [
        `${this.baseUrl}/api/search/get/web?${params}`,
        `${this.baseUrl}/api/cloudsearch/pc?${params}`,
      ];

      for (const url of urls) {
        const payload = await requestJson(url);
        const ranked = rankCandidates(searchSongs(payload), info);
        for (const candidate of ranked) {
          if (seen.has(candidate.id)) continue;
          seen.add(candidate.id);
          candidates.push(candidate);
        }
        if (ranked.length > 0) break;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates.slice(0, 3)) {
      const params = new URLSearchParams({
        id: candidate.id,
        lv: '1',
        kv: '1',
        tv: '1',
        yv: '1',
        rv: '1',
      });
      const payload = await requestJson(
        `${this.baseUrl}/api/song/lyric?${params}`,
      );
      const result = wordTimedResult(candidate, payload);
      if (result) return result;
    }

    return null;
  }
}
