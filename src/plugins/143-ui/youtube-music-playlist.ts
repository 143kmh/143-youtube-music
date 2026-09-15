import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
} from './youtube-music';
import type {
  ArtistCatalog,
  CatalogYouTubeMusicAdapter,
} from './youtube-music-catalog';

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
  browseEndpoint?: {
    browseId?: string;
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: {
        pageType?: string;
      };
    };
  };
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

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

const strictSquareThumbnail = (root: unknown) => {
  let best = '';
  let score = -1;
  for (const thumbnail of collectThumbnails(root)) {
    if (!thumbnail.width || !thumbnail.height) continue;
    const ratio = thumbnail.width / thumbnail.height;
    if (ratio < 0.78 || ratio > 1.28) continue;
    const area = thumbnail.width * thumbnail.height;
    const nextScore = area / (1 + Math.abs(1 - ratio) * 4);
    if (nextScore > score) {
      score = nextScore;
      best = thumbnail.url;
    }
  }
  return best;
};

const bestWideThumbnail = (root: unknown) => {
  let best = '';
  let score = -1;
  for (const thumbnail of collectThumbnails(root)) {
    if (!thumbnail.width || !thumbnail.height) continue;
    const ratio = thumbnail.width / thumbnail.height;
    if (ratio < 1.55) continue;
    const nextScore = thumbnail.width * thumbnail.height * Math.min(ratio, 4);
    if (nextScore > score) {
      score = nextScore;
      best = thumbnail.url;
    }
  }
  return best;
};

const endpointFrom = (value: unknown): NavigationEndpoint | null => {
  if (!isRecord(value)) return null;
  if (isRecord(value.watchEndpoint) || isRecord(value.browseEndpoint))
    return value as NavigationEndpoint;
  return null;
};

const endpointPageType = (endpoint: NavigationEndpoint | null) =>
  endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
    ?.browseEndpointContextMusicConfig?.pageType ?? '';

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

const releaseFromCandidate = (candidate: UnknownRecord): SearchResultItem | null => {
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
  const browseId = endpoint?.browseEndpoint?.browseId;
  const pageType = endpointPageType(endpoint);
  if (!browseId || (pageType !== 'MUSIC_PAGE_TYPE_ALBUM' && !browseId.startsWith('MPRE')))
    return null;
  return {
    kind: 'album',
    title,
    subtitle,
    artwork: bestSquareThumbnail(candidate),
    browseId,
  };
};

const rendererTitle = (renderer: UnknownRecord) => {
  const header = isRecord(renderer.header) ? renderer.header : null;
  const basic =
    header && isRecord(header.musicCarouselShelfBasicHeaderRenderer)
      ? header.musicCarouselShelfBasicHeaderRenderer
      : null;
  return (
    textFromValue(renderer.title) ||
    textFromValue(basic?.title) ||
    textFromValue(header?.title)
  );
};

const collectReleaseCards = (root: unknown) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of [
      'musicTwoRowItemRenderer',
      'musicResponsiveListItemRenderer',
      'musicMultiRowListItemRenderer',
    ]) {
      const candidate = value[key];
      if (!isRecord(candidate)) continue;
      const release = releaseFromCandidate(candidate);
      if (release?.browseId && !seen.has(release.browseId)) {
        seen.add(release.browseId);
        result.push(release);
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const isExplicitSingleOrEp = (item: SearchResultItem) => {
  const subtitle = normalize(item.subtitle);
  return /(?:^|\s)(?:single|сингл|ep|e p|мини альбом)(?:\s|$)/iu.test(subtitle);
};

const collectStrictAlbumShelf = (root: unknown) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of [
      'musicCarouselShelfRenderer',
      'musicGridRenderer',
      'musicShelfRenderer',
    ]) {
      const renderer = value[key];
      if (!isRecord(renderer)) continue;
      const title = normalize(rendererTitle(renderer));
      if (/^(?:album|albums|альбом|альбомы|альбоми)$/u.test(title)) {
        for (const item of collectReleaseCards(renderer.contents)) {
          if (!item.browseId || seen.has(item.browseId) || isExplicitSingleOrEp(item))
            continue;
          seen.add(item.browseId);
          result.push(item);
        }
      }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const mergeAlbums = (
  left: readonly SearchResultItem[],
  right: readonly SearchResultItem[],
) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  for (const item of [...left, ...right]) {
    if (item.kind !== 'album' || isExplicitSingleOrEp(item)) continue;
    const key = item.browseId ?? `${normalize(item.title)}\u0000${normalize(item.subtitle)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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
  const rawGetArtistCatalog = engine.getArtistCatalog.bind(engine);
  const rawSearchCatalog = engine.searchCatalog.bind(engine);
  const profileCache = new Map<string, Promise<SearchArtistProfile>>();

  const browse = (browseId: string) =>
    requireApp().networkManager.fetch<unknown, { browseId: string }>('/browse', {
      browseId,
    });

  const canonicalProfile = (
    browseId: string,
    fallback: SearchArtistProfile,
    response?: unknown,
  ) => {
    const cached = profileCache.get(browseId);
    if (cached) return cached;

    const request = (async () => {
      const raw = response ?? (await browse(browseId));
      const header =
        findRecordByKey(raw, [
          'musicImmersiveHeaderRenderer',
          'musicVisualHeaderRenderer',
          'musicResponsiveHeaderRenderer',
        ]) ?? (isRecord(raw) ? raw : {});

      let searchAvatar = '';
      const title = fallback.title.trim();
      if (title) {
        try {
          const search = await rawSearchCatalog(title);
          const candidates = [
            ...(search.topResult?.kind === 'artist' ? [search.topResult] : []),
            ...search.artists,
          ];
          const exact =
            candidates.find((item) => item.browseId === browseId) ??
            candidates.find((item) => normalize(item.title) === normalize(title));
          searchAvatar = exact?.artwork ?? '';
        } catch {
          // Browse data below is still enough to render a stable profile.
        }
      }

      const directAvatar =
        strictSquareThumbnail(header.thumbnail) ||
        strictSquareThumbnail(header.avatar) ||
        strictSquareThumbnail(header.straplineThumbnail);
      const banner =
        bestWideThumbnail(header.backgroundImage) ||
        bestWideThumbnail(header.backgroundThumbnail) ||
        bestWideThumbnail(header.banner) ||
        bestWideThumbnail(header.thumbnail) ||
        bestWideThumbnail(header) ||
        fallback.banner;

      return {
        ...fallback,
        browseId,
        avatar: searchAvatar || directAvatar || fallback.avatar,
        banner: banner || fallback.banner || searchAvatar || directAvatar,
      };
    })();

    profileCache.set(browseId, request);
    return request;
  };

  const getArtistCatalog = async (
    browseId: string,
    fallbackName = '',
  ): Promise<ArtistCatalog> => {
    const [catalog, response] = await Promise.all([
      rawGetArtistCatalog(browseId, fallbackName),
      browse(browseId),
    ]);
    const profile = await canonicalProfile(browseId, catalog.profile, response);
    const shelfAlbums = collectStrictAlbumShelf(response);
    return {
      ...catalog,
      profile,
      albums: mergeAlbums(catalog.albums, shelfAlbums),
    };
  };

  const searchCatalog = async (query: string): Promise<SearchCatalog> => {
    const catalog = await rawSearchCatalog(query);
    const featured = catalog.featuredArtist;
    if (!featured?.browseId) return catalog;
    try {
      return {
        ...catalog,
        featuredArtist: await canonicalProfile(featured.browseId, featured),
      };
    } catch (error) {
      console.warn('[143 Music] Could not stabilize artist profile artwork', error);
      return catalog;
    }
  };

  const getPlaylistCatalog = async (
    browseId: string,
    fallbackTitle = '',
  ): Promise<PlaylistCatalog> => {
    if (!browseId) throw new Error('Playlist browse id is required');

    const response = await browse(browseId);
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
    searchCatalog,
    getArtistCatalog,
    getPlaylistCatalog,
    getAutoplayItems,
    addToPlaylist,
  });
};
