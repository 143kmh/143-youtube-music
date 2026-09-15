import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

import type { SearchResultItem } from './youtube-music';
import type { CatalogYouTubeMusicAdapter } from './youtube-music-catalog';

type UnknownRecord = Record<string, unknown>;

type NavigationEndpoint = {
  watchEndpoint?: {
    videoId?: string;
    watchEndpointMusicSupportedConfigs?: {
      watchEndpointMusicConfig?: {
        musicVideoType?: string;
      };
    };
  };
  browseEndpoint?: { browseId?: string };
};

type TextRun = {
  text?: string;
  navigationEndpoint?: NavigationEndpoint;
};

export type PlaylistCatalog = Readonly<{
  browseId: string;
  title: string;
  artwork: string;
  subtitle: string;
  tracks: readonly SearchResultItem[];
}>;

export type PlaylistCatalogAdapter = CatalogYouTubeMusicAdapter & {
  getPlaylistCatalog: (
    browseId: string,
    fallbackTitle?: string,
  ) => Promise<PlaylistCatalog>;
  getAutoplayItems: (videoId: string) => Promise<readonly SearchResultItem[]>;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRuns = (value: unknown): TextRun[] => {
  if (!isRecord(value) || !Array.isArray(value.runs)) return [];
  return value.runs.filter(isRecord) as TextRun[];
};

const textFromRuns = (runs: readonly TextRun[]) =>
  runs
    .map((run) => run.text ?? '')
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim();

const textFromValue = (value: unknown): string => {
  if (typeof value === 'string') return value.replaceAll(/\s+/g, ' ').trim();
  if (!isRecord(value)) return '';
  if (typeof value.simpleText === 'string')
    return value.simpleText.replaceAll(/\s+/g, ' ').trim();
  return textFromRuns(readRuns(value));
};

const findRecordByKey = (root: unknown, keys: readonly string[]) => {
  let found: UnknownRecord | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of keys) {
      if (isRecord(value[key])) {
        found = value[key] as UnknownRecord;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

type Thumbnail = Readonly<{
  url: string;
  width: number;
  height: number;
}>;

const collectThumbnails = (root: unknown) => {
  const result: Thumbnail[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (Array.isArray(value.thumbnails)) {
      for (const thumbnail of value.thumbnails) {
        if (!isRecord(thumbnail) || typeof thumbnail.url !== 'string') continue;
        result.push({
          url: thumbnail.url,
          width: typeof thumbnail.width === 'number' ? thumbnail.width : 0,
          height: typeof thumbnail.height === 'number' ? thumbnail.height : 0,
        });
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const bestSquareThumbnail = (root: unknown) => {
  let best = '';
  let score = -1;
  for (const thumbnail of collectThumbnails(root)) {
    if (!thumbnail.width || !thumbnail.height) continue;
    const ratio = thumbnail.width / thumbnail.height;
    if (ratio < 0.68 || ratio > 1.46) continue;
    const area = thumbnail.width * thumbnail.height;
    const nextScore = area / (1 + Math.abs(1 - ratio) * 3);
    if (nextScore > score) {
      score = nextScore;
      best = thumbnail.url;
    }
  }
  return best || collectThumbnails(root).at(-1)?.url || '';
};

const endpointFrom = (value: unknown): NavigationEndpoint | null => {
  if (!isRecord(value)) return null;
  if (isRecord(value.watchEndpoint) || isRecord(value.browseEndpoint))
    return value as NavigationEndpoint;
  return null;
};

const deepEndpoint = (root: unknown): NavigationEndpoint | null => {
  let found: NavigationEndpoint | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const direct = endpointFrom(value);
    if (direct) {
      found = direct;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const flexGroups = (candidate: UnknownRecord) => {
  const groups: TextRun[][] = [];
  if (!Array.isArray(candidate.flexColumns)) return groups;
  for (const column of candidate.flexColumns) {
    if (!isRecord(column)) continue;
    const renderer = column.musicResponsiveListItemFlexColumnRenderer;
    if (!isRecord(renderer)) continue;
    const runs = readRuns(renderer.text);
    if (runs.length) groups.push(runs);
  }
  return groups;
};

const isEpisodeLike = (title: string, subtitle: string, videoType: string) => {
  const text = `${title} ${subtitle}`;
  return (
    /PODCAST|EPISODE/iu.test(videoType) ||
    /\b(?:podcast|episode|interview)\b/iu.test(text) ||
    /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
      text,
    )
  );
};

const trackFromCandidate = (candidate: UnknownRecord): SearchResultItem | null => {
  const titleRuns = readRuns(candidate.title);
  const groups = flexGroups(candidate);
  const effectiveTitleRuns = titleRuns.length ? titleRuns : (groups[0] ?? []);
  const title = textFromRuns(effectiveTitleRuns);
  if (!title) return null;

  const subtitle =
    textFromValue(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');
  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    effectiveTitleRuns.map((run) => run.navigationEndpoint ?? null).find(Boolean) ??
    deepEndpoint(candidate);
  const playlistData = isRecord(candidate.playlistItemData)
    ? candidate.playlistItemData
    : null;
  const directVideoId =
    typeof candidate.videoId === 'string' ? candidate.videoId : undefined;
  const videoId =
    directVideoId ??
    endpoint?.watchEndpoint?.videoId ??
    (typeof playlistData?.videoId === 'string' ? playlistData.videoId : undefined);
  if (!videoId) return null;
  const videoType =
    endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
      ?.musicVideoType ??
    (typeof candidate.videoType === 'string' ? candidate.videoType : '');
  if (isEpisodeLike(title, subtitle, videoType)) return null;

  return {
    kind: 'song',
    title,
    subtitle,
    artwork: bestSquareThumbnail(candidate),
    videoId,
  };
};

const collectTracks = (root: unknown) => {
  const tracks: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of [
      'musicResponsiveListItemRenderer',
      'musicTwoRowItemRenderer',
      'musicMultiRowListItemRenderer',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const track = trackFromCandidate(candidate);
      if (track?.videoId && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        tracks.push(track);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return tracks;
};

const watchTrackFromCandidate = (
  candidate: UnknownRecord,
): SearchResultItem | null => {
  const videoId = typeof candidate.videoId === 'string' ? candidate.videoId : '';
  const title = textFromValue(candidate.title);
  if (!videoId || !title) return null;

  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ?? deepEndpoint(candidate);
  const videoType =
    endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
      ?.musicVideoType ??
    (typeof candidate.videoType === 'string' ? candidate.videoType : '');
  if (/PODCAST|EPISODE|OMV|UGC/iu.test(videoType)) return null;

  const byline =
    textFromValue(candidate.longBylineText) ||
    textFromValue(candidate.shortBylineText) ||
    textFromValue(candidate.subtitle);
  const length = textFromValue(candidate.lengthText);
  const subtitle = [byline, length]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' • ');
  if (isEpisodeLike(title, subtitle, videoType)) return null;

  return {
    kind: 'song',
    title,
    subtitle,
    artwork: bestSquareThumbnail(candidate.thumbnail ?? candidate),
    videoId,
  };
};

const collectAutoplayTracks = (root: unknown) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const candidate = value.playlistPanelVideoRenderer;
    if (isRecord(candidate)) {
      const track = watchTrackFromCandidate(candidate);
      if (track?.videoId && !seen.has(track.videoId)) {
        seen.add(track.videoId);
        result.push(track);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

export const installPlaylistCatalog = (
  engine: CatalogYouTubeMusicAdapter,
): PlaylistCatalogAdapter => {
  const app = () => document.querySelector<MusicPlayerAppElement>('ytmusic-app');
  const requireApp = () => {
    const musicApp = app();
    if (!musicApp?.networkManager?.fetch)
      throw new Error('YouTube Music is not ready');
    return musicApp;
  };

  const getPlaylistCatalog = async (
    browseId: string,
    fallbackTitle = '',
  ): Promise<PlaylistCatalog> => {
    if (!browseId) throw new Error('Playlist browse id is required');

    const response = await requireApp().networkManager.fetch<
      unknown,
      { browseId: string }
    >('/browse', { browseId });
    const outerHeader =
      findRecordByKey(response, [
        'musicEditablePlaylistDetailHeaderRenderer',
        'musicDetailHeaderRenderer',
        'musicResponsiveHeaderRenderer',
      ]) ?? (isRecord(response) ? response : {});
    const header =
      findRecordByKey(outerHeader, [
        'musicDetailHeaderRenderer',
        'musicResponsiveHeaderRenderer',
      ]) ?? outerHeader;
    const title = textFromValue(header.title) || fallbackTitle;
    const subtitle =
      textFromValue(header.subtitle) ||
      textFromValue(header.secondSubtitle) ||
      textFromValue(header.description) ||
      '';

    return {
      browseId,
      title,
      artwork: bestSquareThumbnail(header),
      subtitle,
      tracks: collectTracks(response),
    };
  };

  const getAutoplayItems = async (videoId: string) => {
    if (!videoId) return [];
    const response = await requireApp().networkManager.fetch<
      unknown,
      {
        enablePersistentPlaylistPanel: boolean;
        isAudioOnly: boolean;
        tunerSettingValue: string;
        videoId: string;
        playlistId: string;
        watchEndpointMusicSupportedConfigs: {
          watchEndpointMusicConfig: {
            hasPersistentPlaylistPanel: boolean;
            musicVideoType: string;
          };
        };
      }
    >('/next', {
      enablePersistentPlaylistPanel: true,
      isAudioOnly: true,
      tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
      videoId,
      playlistId: `RDAMVM${videoId}`,
      watchEndpointMusicSupportedConfigs: {
        watchEndpointMusicConfig: {
          hasPersistentPlaylistPanel: true,
          musicVideoType: 'MUSIC_VIDEO_TYPE_ATV',
        },
      },
    });
    return collectAutoplayTracks(response).filter(
      (item) => item.videoId && item.videoId !== videoId,
    );
  };

  const addToPlaylist = async (playlistId: string, videoId: string) => {
    if (!playlistId || !videoId)
      throw new Error('A playlist and track are required');
    const normalizedPlaylistId = playlistId.startsWith('VL')
      ? playlistId.slice(2)
      : playlistId;
    const response = await requireApp().networkManager.fetch<
      unknown,
      {
        playlistId: string;
        actions: {
          action: string;
          addedVideoId: string;
          dedupeOption: string;
        }[];
      }
    >('/browse/edit_playlist', {
      playlistId: normalizedPlaylistId,
      actions: [
        {
          action: 'ACTION_ADD_VIDEO',
          addedVideoId: videoId,
          dedupeOption: 'DEDUPE_OPTION_SKIP',
        },
      ],
    });

    if (!isRecord(response)) return;
    const status = typeof response.status === 'string' ? response.status : '';
    if (response.error || (status && !status.includes('SUCCEEDED')))
      throw new Error(`Playlist edit failed${status ? `: ${status}` : ''}`);
  };

  return Object.assign(engine, {
    getPlaylistCatalog,
    getAutoplayItems,
    addToPlaylist,
  });
};
