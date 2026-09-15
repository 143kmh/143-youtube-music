import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

import type {
  ArtistEntry,
  SearchArtistProfile,
  SearchResultItem,
  SearchResultKind,
  YouTubeMusicAdapter,
} from './youtube-music';

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

type BrowseSection = Readonly<{
  title: string;
  items: readonly SearchResultItem[];
  moreBrowseId: string;
}>;

export type ArtistCatalog = Readonly<{
  profile: SearchArtistProfile;
  topTracks: readonly SearchResultItem[];
  albums: readonly SearchResultItem[];
  releases: readonly SearchResultItem[];
  relatedArtists: readonly SearchResultItem[];
}>;

export type AlbumCatalog = Readonly<{
  browseId: string;
  title: string;
  artwork: string;
  subtitle: string;
  year: string;
  artists: readonly ArtistEntry[];
  tracks: readonly SearchResultItem[];
}>;

export type CatalogYouTubeMusicAdapter = YouTubeMusicAdapter & {
  getArtistCatalog: (browseId: string, fallbackName?: string) => Promise<ArtistCatalog>;
  getAlbumCatalog: (browseId: string, fallbackTitle?: string) => Promise<AlbumCatalog>;
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

const collectText = (root: unknown) => {
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const text = textFromValue(value);
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
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

const findTextByKeys = (root: unknown, keys: readonly string[]) => {
  let found = '';
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of keys) {
      const text = textFromValue(value[key]);
      if (text) {
        found = text;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

type ThumbnailCandidate = Readonly<{
  url: string;
  width: number;
  height: number;
}>;

const collectThumbnails = (root: unknown) => {
  const result: ThumbnailCandidate[] = [];
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

const bestThumbnail = (root: unknown) => {
  let best = '';
  let area = -1;
  for (const thumbnail of collectThumbnails(root)) {
    const nextArea = thumbnail.width * thumbnail.height;
    if (!best || nextArea >= area) {
      best = thumbnail.url;
      area = nextArea;
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
    if (ratio < 1.45) continue;
    const nextScore = thumbnail.width * thumbnail.height * Math.min(ratio, 4);
    if (nextScore > score) {
      best = thumbnail.url;
      score = nextScore;
    }
  }
  return best;
};

const bestSquareThumbnail = (root: unknown) => {
  let best = '';
  let score = -1;
  for (const thumbnail of collectThumbnails(root)) {
    if (!thumbnail.width || !thumbnail.height) continue;
    const ratio = thumbnail.width / thumbnail.height;
    if (ratio < 0.72 || ratio > 1.38) continue;
    const closeness = 1 - Math.min(1, Math.abs(1 - ratio));
    const nextScore = thumbnail.width * thumbnail.height * (1 + closeness * 2);
    if (nextScore > score) {
      best = thumbnail.url;
      score = nextScore;
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

const endpointVideoType = (endpoint: NavigationEndpoint | null) =>
  endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs
    ?.watchEndpointMusicConfig?.musicVideoType ?? '';

const deepEndpoint = (root: unknown): NavigationEndpoint | null => {
  let found: NavigationEndpoint | null = null;
  const visit = (value: unknown) => {
    if (found) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const endpoint = endpointFrom(value);
    if (endpoint) {
      found = endpoint;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const collectBrowseIds = (root: unknown) => {
  const result: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const endpoint = endpointFrom(value);
    const browseId = endpoint?.browseEndpoint?.browseId;
    if (browseId && !seen.has(browseId)) {
      seen.add(browseId);
      result.push(browseId);
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const flexRunGroups = (candidate: UnknownRecord) => {
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

const candidateRuns = (candidate: UnknownRecord) => {
  const result = [...readRuns(candidate.title)];
  for (const group of flexRunGroups(candidate)) result.push(...group);
  return result;
};

const searchItemFromCandidate = (candidate: UnknownRecord): SearchResultItem | null => {
  const titleRuns = readRuns(candidate.title);
  const flexGroups = flexRunGroups(candidate);
  const effectiveTitleRuns = titleRuns.length ? titleRuns : (flexGroups[0] ?? []);
  const title = textFromRuns(effectiveTitleRuns) || textFromRuns(candidateRuns(candidate));
  if (!title) return null;

  const explicitSubtitle = textFromRuns(readRuns(candidate.subtitle));
  const subtitleGroups = titleRuns.length ? flexGroups : flexGroups.slice(1);
  const subtitle =
    explicitSubtitle ||
    subtitleGroups
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');

  const runEndpoint = effectiveTitleRuns
    .map((run) => run.navigationEndpoint ?? null)
    .find(Boolean) ?? null;
  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    runEndpoint ??
    deepEndpoint(candidate);
  const playlistData = isRecord(candidate.playlistItemData)
    ? candidate.playlistItemData
    : null;
  const videoId =
    endpoint?.watchEndpoint?.videoId ??
    (typeof playlistData?.videoId === 'string' ? playlistData.videoId : undefined);
  const browseId = endpoint?.browseEndpoint?.browseId;
  const pageType = endpointPageType(endpoint);
  const videoType = endpointVideoType(endpoint);

  let kind: SearchResultKind | null = null;
  if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') kind = 'artist';
  else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') kind = 'album';
  else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') kind = 'playlist';
  else if (videoId) {
    if (/PODCAST|EPISODE/i.test(videoType)) kind = 'video';
    else kind = /OMV|UGC/i.test(videoType) ? 'video' : 'song';
  } else if (browseId?.startsWith('UC')) kind = 'artist';
  else if (browseId?.startsWith('VL')) kind = 'playlist';
  if (!kind) return null;

  return {
    kind,
    title,
    subtitle,
    artwork: bestThumbnail(candidate),
    ...(videoId ? { videoId } : {}),
    ...(browseId ? { browseId } : {}),
  };
};

const isEpisodeLike = (item: SearchResultItem) => {
  const value = `${item.title} ${item.subtitle}`;
  return (
    item.kind === 'video' ||
    /\b(?:podcast|episode|interview)\b/iu.test(value) ||
    /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
      value,
    )
  );
};

const uniqueItems = (items: readonly SearchResultItem[]) => {
  const result: SearchResultItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.videoId ?? item.browseId ?? `${item.title}\u0000${item.subtitle}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const directItems = (renderer: UnknownRecord) => {
  const items: SearchResultItem[] = [];
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
      const item = searchItemFromCandidate(candidate);
      if (item) items.push(item);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(renderer.contents);
  return uniqueItems(items);
};

const rendererTitle = (renderer: UnknownRecord) => {
  const header = isRecord(renderer.header) ? renderer.header : null;
  const basic = header && isRecord(header.musicCarouselShelfBasicHeaderRenderer)
    ? header.musicCarouselShelfBasicHeaderRenderer
    : null;
  return (
    textFromValue(renderer.title) ||
    textFromValue(basic?.title) ||
    textFromValue(header?.title)
  );
};

const rendererMoreBrowseId = (renderer: UnknownRecord) => {
  const source = {
    header: renderer.header,
    bottomEndpoint: renderer.bottomEndpoint,
    moreContentButton: renderer.moreContentButton,
  };
  return collectBrowseIds(source)[0] ?? '';
};

const collectSections = (root: unknown) => {
  const sections: BrowseSection[] = [];
  const rendererKeys = [
    'musicShelfRenderer',
    'musicCarouselShelfRenderer',
    'musicGridRenderer',
    'musicPlaylistShelfRenderer',
  ] as const;

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of rendererKeys) {
      const renderer = value[key];
      if (!isRecord(renderer)) continue;
      const items = directItems(renderer);
      if (items.length)
        sections.push({
          title: rendererTitle(renderer),
          items,
          moreBrowseId: rendererMoreBrowseId(renderer),
        });
      return;
    }
    Object.values(value).forEach(visit);
  };

  visit(root);
  return sections;
};

const collectAllItems = (root: unknown) => {
  const items: SearchResultItem[] = [];
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
      const item = searchItemFromCandidate(candidate);
      if (item) items.push(item);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return uniqueItems(items);
};

const artistFromRun = (run: TextRun): ArtistEntry | null => {
  const browse = run.navigationEndpoint?.browseEndpoint;
  const browseId = browse?.browseId;
  const name = run.text?.replaceAll(/\s+/g, ' ').trim();
  const pageType =
    browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
      ?.pageType;
  if (!name || !browseId) return null;
  if (pageType !== 'MUSIC_PAGE_TYPE_ARTIST' && !browseId.startsWith('UC')) return null;
  return { name, browseId };
};

const collectArtistRuns = (root: unknown) => {
  const result: ArtistEntry[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const run of readRuns(value)) {
      const artist = artistFromRun(run);
      if (!artist || seen.has(artist.browseId)) continue;
      seen.add(artist.browseId);
      result.push(artist);
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const yearFrom = (value: string) => value.match(/(?:19|20)\d{2}/u)?.[0] ?? '';

const releaseYear = (item: SearchResultItem) =>
  Number(yearFrom(`${item.subtitle} ${item.title}`)) || -1;

const rankReleases = (items: readonly SearchResultItem[]) =>
  uniqueItems(items)
    .map((item, index) => ({ item, index, year: releaseYear(item) }))
    .sort((left, right) => right.year - left.year || left.index - right.index)
    .map(({ item }) => item);

const artistProfile = (
  root: unknown,
  browseId: string,
  fallbackName: string,
): SearchArtistProfile => {
  const header =
    findRecordByKey(root, [
      'musicImmersiveHeaderRenderer',
      'musicVisualHeaderRenderer',
      'musicResponsiveHeaderRenderer',
    ]) ?? (isRecord(root) ? root : {});
  const texts = collectText(header);
  const title =
    textFromValue(header.title) || textFromValue(header.name) || fallbackName;
  const subscribers =
    findTextByKeys(header, [
      'subscriberCountWithSubscribeText',
      'subscriberCountText',
      'subscriberCount',
    ]) ||
    texts.find((text) => /subscriber|подписчик|підписник/iu.test(text)) ||
    '';
  const monthlyListeners =
    texts.find((text) => /monthly|listener|слушател|слухач/iu.test(text)) || '';
  const avatar = bestSquareThumbnail(header) || bestThumbnail(header);
  const banner = bestWideThumbnail(header) || bestThumbnail(header);
  return { title, browseId, avatar, banner, subscribers, monthlyListeners };
};

const sectionMatches = (section: BrowseSection, pattern: RegExp) =>
  pattern.test(normalize(section.title));

const songsFrom = (section: BrowseSection | undefined) =>
  uniqueItems(
    (section?.items ?? []).filter(
      (item) => item.kind === 'song' && !isEpisodeLike(item),
    ),
  );

const albumsFrom = (sections: readonly BrowseSection[]) =>
  rankReleases(
    sections.flatMap((section) =>
      section.items.filter(
        (item) => item.kind === 'album' && !isEpisodeLike(item),
      ),
    ),
  );

const relatedFrom = (
  sections: readonly BrowseSection[],
  browseId: string,
  artistName: string,
) =>
  uniqueItems(
    sections.flatMap((section) =>
      section.items.filter(
        (item) =>
          item.kind === 'artist' &&
          item.browseId !== browseId &&
          normalize(item.title) !== normalize(artistName),
      ),
    ),
  );

export const installBrowseCatalog = (
  engine: YouTubeMusicAdapter,
): CatalogYouTubeMusicAdapter => {
  const app = () => document.querySelector<MusicPlayerAppElement>('ytmusic-app');
  const browse = async (browseId: string) => {
    const musicApp = app();
    if (!musicApp?.networkManager?.fetch)
      throw new Error('YouTube Music is not ready');
    return musicApp.networkManager.fetch<unknown, { browseId: string }>('/browse', {
      browseId,
    });
  };

  const getArtistCatalog = async (
    browseId: string,
    fallbackName = '',
  ): Promise<ArtistCatalog> => {
    if (!browseId) throw new Error('Artist browse id is required');
    const response = await browse(browseId);
    const profile = artistProfile(response, browseId, fallbackName);
    const sections = collectSections(response);

    const topPattern =
      /top songs|top tracks|popular|best songs|лучшие треки|лучшие песни|популярн|топ трек|песн|композиц/iu;
    const albumPattern = /albums?|альбом/iu;
    const releasePattern = /singles?|releases?|сингл|релиз|реліз|выпуск|випуск/iu;
    const relatedPattern =
      /fans might also like|similar|related|you might also like|похож|схож|другие исполнители/iu;

    const topSection =
      sections.find(
        (section) =>
          sectionMatches(section, topPattern) &&
          section.items.some((item) => item.kind === 'song'),
      ) ?? sections.find((section) => section.items.some((item) => item.kind === 'song'));
    let topTracks = songsFrom(topSection);

    if (topTracks.length < 10 && topSection?.moreBrowseId && topSection.moreBrowseId !== browseId) {
      try {
        const more = collectAllItems(await browse(topSection.moreBrowseId));
        topTracks = uniqueItems([
          ...topTracks,
          ...more.filter((item) => item.kind === 'song' && !isEpisodeLike(item)),
        ]);
      } catch (error) {
        console.warn('[143 Music] Could not expand artist top tracks', error);
      }
    }

    if (topTracks.length < 10 && profile.title) {
      try {
        const fallback = await engine.searchCatalog(`${profile.title} songs`);
        const artistKey = normalize(profile.title);
        const extra = fallback.songs.filter(
          (item) =>
            item.kind === 'song' &&
            !isEpisodeLike(item) &&
            (!artistKey || normalize(item.subtitle).includes(artistKey)),
        );
        topTracks = uniqueItems([...topTracks, ...extra]);
      } catch (error) {
        console.warn('[143 Music] Could not fill artist top tracks', error);
      }
    }

    const albumSections = sections.filter((section) => sectionMatches(section, albumPattern));
    const releaseSections = sections.filter((section) => sectionMatches(section, releasePattern));
    let albums = albumsFrom(albumSections);
    let singlesAndReleases = albumsFrom(releaseSections);

    for (const [sectionGroup, apply] of [
      [albumSections, (items: SearchResultItem[]) => (albums = rankReleases([...albums, ...items]))],
      [
        releaseSections,
        (items: SearchResultItem[]) =>
          (singlesAndReleases = rankReleases([...singlesAndReleases, ...items])),
      ],
    ] as const) {
      for (const section of sectionGroup) {
        if (!section.moreBrowseId || section.moreBrowseId === browseId) continue;
        try {
          const items = collectAllItems(await browse(section.moreBrowseId)).filter(
            (item) => item.kind === 'album' && !isEpisodeLike(item),
          );
          apply(items);
        } catch (error) {
          console.warn('[143 Music] Could not expand artist releases', error);
        }
      }
    }

    const relatedSections = sections.filter((section) => sectionMatches(section, relatedPattern));
    const relatedArtists = relatedFrom(
      relatedSections.length ? relatedSections : sections,
      browseId,
      profile.title || fallbackName,
    );

    return {
      profile,
      topTracks: topTracks.slice(0, 10),
      albums,
      releases: rankReleases([...albums, ...singlesAndReleases]),
      relatedArtists,
    };
  };

  const getAlbumCatalog = async (
    browseId: string,
    fallbackTitle = '',
  ): Promise<AlbumCatalog> => {
    if (!browseId) throw new Error('Album browse id is required');
    const response = await browse(browseId);
    const header =
      findRecordByKey(response, [
        'musicDetailHeaderRenderer',
        'musicResponsiveHeaderRenderer',
        'musicVisualHeaderRenderer',
      ]) ?? (isRecord(response) ? response : {});
    const sections = collectSections(response);
    const explicitTrackSection = sections.find(
      (section) =>
        (!section.title ||
          /songs?|tracks?|песн|трек|композиц/iu.test(normalize(section.title))) &&
        section.items.some((item) => item.kind === 'song'),
    );
    const fallbackTrackSection = sections.find((section) =>
      section.items.some((item) => item.kind === 'song'),
    );
    const tracks = songsFrom(explicitTrackSection ?? fallbackTrackSection);
    const texts = collectText(header);
    const title = textFromValue(header.title) || fallbackTitle;
    const subtitle =
      textFromValue(header.subtitle) || textFromValue(header.secondSubtitle) || '';
    const year = texts.map(yearFrom).find(Boolean) ?? yearFrom(subtitle);
    let artists = collectArtistRuns(header);
    if (!artists.length) {
      const firstTrack = explicitTrackSection ?? fallbackTrackSection;
      if (firstTrack) {
        const matching = firstTrack.items.find((item) => item.kind === 'artist');
        if (matching?.browseId)
          artists = [{ name: matching.title, browseId: matching.browseId }];
      }
    }

    return {
      browseId,
      title,
      artwork: bestSquareThumbnail(header) || bestThumbnail(header),
      subtitle,
      year,
      artists,
      tracks,
    };
  };

  return Object.assign(engine, { getArtistCatalog, getAlbumCatalog });
};
