import { jaroWinkler } from '@skyra/jaro-winkler';
import { LRC } from '../parsers/lrc';
import type { LyricProvider, LyricResult, SearchSongInfo } from '../types';

type RecordLyrics = {
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/\s*[-–]\s*topic$/u, '')
  .replace(/\((?:official\s+)?(?:audio|video|lyrics?)\)/gu, '')
  .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim();
const versions = (value: string) =>
  [...normalize(value).matchAll(/\b(live|remix|acoustic|instrumental|karaoke|sped up|slowed|nightcore|radio edit)\b/gu)]
    .map(match => match[0]).sort().join('|');

export const selectLRCLibResult = (records: unknown, info: SearchSongInfo): LyricResult | null => {
  if (!Array.isArray(records)) return null;
  const titles = [info.title, info.alternativeTitle].filter((title): title is string => Boolean(title));
  const artists = info.artist.split(/\s*(?:&|,| feat\.? | ft\.? )\s*/iu).map(normalize).filter(Boolean);
  const candidates = records.filter((value): value is RecordLyrics => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<RecordLyrics>;
    if (!item || typeof item.trackName !== 'string' || typeof item.artistName !== 'string' || item.instrumental) return false;
    if (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || (info.songDuration > 0 && Math.abs(item.duration - info.songDuration) > 2)) return false;
    const name = item.trackName;
    if (!titles.some(title => versions(title) === versions(name) && jaroWinkler(normalize(title), normalize(name)) >= 0.94)) return false;
    return item.artistName.split(/\s*(?:&|,| feat\.? | ft\.? )\s*/iu)
      .some((artist: string) => artists.some(expected => jaroWinkler(expected, normalize(artist)) >= 0.94));
  }).map(item => {
    const lines = typeof item.syncedLyrics === 'string' ? LRC.parse(item.syncedLyrics).lines : [];
    const synced = lines.some(line => line.text.trim()) && lines.every(line => Number.isFinite(line.timeInMs) && line.timeInMs >= 0);
    return { item, lines: synced ? lines : [], plain: typeof item.plainLyrics === 'string' ? item.plainLyrics.trim() : '' };
  }).filter(result => result.lines.length || result.plain);
  candidates.sort((a, b) => Number(Boolean(b.lines.length)) - Number(Boolean(a.lines.length)) ||
    Number(normalize(b.item.albumName ?? '') === normalize(info.album ?? '')) - Number(normalize(a.item.albumName ?? '') === normalize(info.album ?? '')) ||
    Math.abs(a.item.duration - info.songDuration) - Math.abs(b.item.duration - info.songDuration));
  const best = candidates[0];
  if (!best) return null;
  return {
    title: best.item.trackName,
    artists: best.item.artistName.split(/[&,]/u),
    lines: best.lines.length ? best.lines.map(line => ({ ...line, status: 'upcoming' as const })) : undefined,
    lyrics: best.plain || undefined,
  };
};

export class LRCLib implements LyricProvider {
  name = 'LRCLib';
  baseUrl = 'https://lrclib.net';

  async search(info: SearchSongInfo): Promise<LyricResult | null> {
    const query = new URLSearchParams({ artist_name: info.artist, track_name: info.title });
    if (info.album) query.set('album_name', info.album);
    if (info.songDuration > 0 && info.songDuration <= 3600) query.set('duration', String(info.songDuration));
    const request = async (endpoint: string, params: URLSearchParams) => {
      const response = await fetch(`${this.baseUrl}/api/${endpoint}?${params}`, { signal: AbortSignal.timeout(7000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`LRCLib HTTP ${response.status}`);
      return response.json();
    };
    const exact = await request('get', query);
    const preferred = selectLRCLibResult(exact ? [exact] : [], info);
    if (preferred?.lines?.length) return preferred;
    await new Promise(resolve => setTimeout(resolve, 250));
    query.delete('duration');
    query.delete('album_name');
    const found = selectLRCLibResult(await request('search', query), info);
    if (found?.lines?.length || preferred || found) return found?.lines?.length ? found : preferred ?? found;
    if (!info.alternativeTitle || info.alternativeTitle === info.title) return null;
    await new Promise(resolve => setTimeout(resolve, 250));
    query.set('track_name', info.alternativeTitle);
    return selectLRCLibResult(await request('search', query), info);
  }
}
