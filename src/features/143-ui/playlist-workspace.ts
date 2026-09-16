import workspaceStyle from './playlist-workspace.css?inline';
import { validatePlaylistEdit } from './native-player';

import type { PlaybackContextAdapter } from './playback-context';
import type { ArtistEntry, PlaylistEntry, SearchResultItem } from './youtube-music';
import type { MusicPlayerAppElement } from '@/types/music-player-app-element';

type UnknownRecord = Record<string, unknown>;

type NavigationEndpoint = {
  watchEndpoint?: { videoId?: string };
  browseEndpoint?: {
    browseId?: string;
    browseEndpointContextSupportedConfigs?: {
      browseEndpointContextMusicConfig?: { pageType?: string };
    };
  };
};

type TextRun = {
  text?: string;
  navigationEndpoint?: NavigationEndpoint;
};

type AlbumRef = { title: string; browseId: string };

type RichTrack = {
  item: SearchResultItem;
  artists: ArtistEntry[];
  album: AlbumRef | null;
  setVideoId: string;
  dateAddedText: string;
  dateAdded: number;
  originalIndex: number;
};

type ActivePlaylist = {
  title: string;
  subtitle: string;
  artwork: string;
  browseId: string;
  playlistId: string;
  tracks: RichTrack[];
  continuation: string;
  sourceCard: HTMLElement | null;
};

type SortOrder = 'newest' | 'oldest';

const ROOT_ID = 'ui143-playlist-workspace';
const MENU_ID = 'ui143-track-context-menu';
const PICKER_ID = 'ui143-track-playlist-picker';
const UPLOAD_URL =
  'https://music.youtube.com/playlist_image_upload/playlist_custom_thumbnail';

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRuns = (value: unknown): TextRun[] =>
  isRecord(value) && Array.isArray(value.runs)
    ? (value.runs.filter(isRecord) as TextRun[])
    : [];

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

const fixedTexts = (candidate: UnknownRecord) => {
  const result: string[] = [];
  if (!Array.isArray(candidate.fixedColumns)) return result;
  for (const column of candidate.fixedColumns) {
    if (!isRecord(column)) continue;
    const renderer = column.musicResponsiveListItemFixedColumnRenderer;
    if (!isRecord(renderer)) continue;
    const value = textFromValue(renderer.text);
    if (value) result.push(value);
  }
  return result;
};

const collectThumbnails = (root: unknown) => {
  const result: { url: string; width: number; height: number }[] = [];
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
  let score = -1;
  for (const thumbnail of collectThumbnails(root)) {
    const ratio = thumbnail.height ? thumbnail.width / thumbnail.height : 1;
    const squarePenalty = Math.abs(1 - ratio) * 2;
    const next = Math.max(1, thumbnail.width * thumbnail.height) / (1 + squarePenalty);
    if (next >= score) {
      score = next;
      best = thumbnail.url;
    }
  }
  return best;
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
        found = value[key];
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return found;
};

const continuationToken = (root: unknown) => {
  let token = '';
  const visit = (value: unknown) => {
    if (token) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const item = isRecord(value.continuationItemRenderer)
      ? value.continuationItemRenderer
      : null;
    const endpoint = item && isRecord(item.continuationEndpoint)
      ? item.continuationEndpoint
      : null;
    const command = endpoint && isRecord(endpoint.continuationCommand)
      ? endpoint.continuationCommand
      : null;
    if (typeof command?.token === 'string' && command.token) {
      token = command.token;
      return;
    }
    for (const key of ['nextContinuationData', 'reloadContinuationData']) {
      const data = isRecord(value[key]) ? value[key] : null;
      if (typeof data?.continuation === 'string' && data.continuation) {
        token = data.continuation;
        return;
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return token;
};

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEpisodeLike = (title: string, subtitle: string) =>
  /\b(?:podcast|episode|interview)\b/iu.test(`${title} ${subtitle}`) ||
  /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
    `${title} ${subtitle}`,
  );

const monthIndex = (value: string) => {
  const key = normalize(value).replaceAll(' ', '');
  const months: Record<string, number> = {
    jan: 0, january: 0, янв: 0, января: 0, січ: 0, січня: 0,
    feb: 1, february: 1, фев: 1, февраля: 1, лют: 1, лютого: 1,
    mar: 2, march: 2, мар: 2, марта: 2, бер: 2, березня: 2,
    apr: 3, april: 3, апр: 3, апреля: 3, квіт: 3, квітня: 3,
    may: 4, мая: 4, трав: 4, травня: 4,
    jun: 5, june: 5, июн: 5, июня: 5, черв: 5, червня: 5,
    jul: 6, july: 6, июл: 6, июля: 6, лип: 6, липня: 6,
    aug: 7, august: 7, авг: 7, августа: 7, серп: 7, серпня: 7,
    sep: 8, sept: 8, september: 8, сен: 8, сентября: 8, вер: 8, вересня: 8,
    oct: 9, october: 9, окт: 9, октября: 9, жовт: 9, жовтня: 9,
    nov: 10, november: 10, ноя: 10, ноября: 10, лист: 10, листопада: 10,
    dec: 11, december: 11, дек: 11, декабря: 11, груд: 11, грудня: 11,
  };
  return months[key] ?? -1;
};

const parseDateAdded = (raw: string) => {
  const cleaned = raw
    .replace(/^(?:added|добавлено|додано)\s*:?[ ]*/iu, '')
    .trim();
  if (!cleaned) return 0;
  const now = Date.now();
  if (/^(?:today|сегодня|сьогодні)$/iu.test(cleaned)) return now;
  if (/^(?:yesterday|вчера|вчора)$/iu.test(cleaned)) return now - 86_400_000;

  const relative = cleaned.match(
    /(\d+)\s*(minute|hour|day|week|month|year|минут|час|дн|день|дня|недел|неділ|месяц|місяц|год|лет|рік|рок)\p{L}*\s*(?:ago|назад)?/iu,
  );
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2]?.toLocaleLowerCase() ?? '';
    const days = /minute|минут/u.test(unit)
      ? amount / 1440
      : /hour|час/u.test(unit)
        ? amount / 24
        : /week|недел|неділ/u.test(unit)
          ? amount * 7
          : /month|месяц|місяц/u.test(unit)
            ? amount * 30.44
            : /year|год|лет|рік|рок/u.test(unit)
              ? amount * 365.25
              : amount;
    return now - days * 86_400_000;
  }

  const numeric = cleaned.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/u);
  if (numeric) {
    const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return new Date(year, Number(numeric[2]) - 1, Number(numeric[1])).getTime();
  }

  const named = cleaned.match(/\b(\d{1,2})\s+([\p{L}.]+)\s+(\d{4})\b/iu);
  if (named) {
    const month = monthIndex(named[2] ?? '');
    if (month >= 0) return new Date(Number(named[3]), month, Number(named[1])).getTime();
  }

  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateTextFromCandidate = (candidate: UnknownRecord) => {
  const candidates = [
    ...fixedTexts(candidate),
    textFromValue(candidate.subtitle),
    textFromValue(candidate.secondarySubtitle),
  ].filter(Boolean);
  return (
    candidates.find((value) =>
      /(?:added|добавлено|додано|today|yesterday|сегодня|вчера|сьогодні|вчора|\b\d+\s*(?:day|week|month|year|дн|недел|неділ|месяц|місяц|год|лет|рік|рок)|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{1,2}\s+[\p{L}.]+\s+\d{4}\b)/iu.test(
        value,
      ),
    ) ?? ''
  );
};

const trackFromCandidate = (
  candidate: UnknownRecord,
  originalIndex: number,
): RichTrack | null => {
  const titleRuns = readRuns(candidate.title);
  const groups = flexGroups(candidate);
  const titleGroup = titleRuns.length ? titleRuns : (groups[0] ?? []);
  const title = textFromRuns(titleGroup) || textFromValue(candidate.title);
  if (!title) return null;
  const subtitle =
    textFromValue(candidate.subtitle) ||
    (titleRuns.length ? groups : groups.slice(1))
      .map(textFromRuns)
      .filter(Boolean)
      .join(' • ');
  if (isEpisodeLike(title, subtitle)) return null;

  const endpoint =
    endpointFrom(candidate.navigationEndpoint) ??
    endpointFrom(candidate.onTap) ??
    titleGroup.map((run) => run.navigationEndpoint ?? null).find(Boolean) ??
    deepEndpoint(candidate);
  const playlistData = isRecord(candidate.playlistItemData)
    ? candidate.playlistItemData
    : null;
  const videoId =
    (typeof candidate.videoId === 'string' ? candidate.videoId : '') ||
    endpoint?.watchEndpoint?.videoId ||
    (typeof playlistData?.videoId === 'string' ? playlistData.videoId : '');
  if (!videoId) return null;

  const runs = [...titleGroup, ...groups.flat()];
  const artists: ArtistEntry[] = [];
  const seenArtists = new Set<string>();
  let album: AlbumRef | null = null;
  for (const run of runs) {
    const browse = run.navigationEndpoint?.browseEndpoint;
    const browseId = browse?.browseId ?? '';
    const text = run.text?.trim() ?? '';
    const pageType =
      browse?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
        ?.pageType ?? '';
    if (
      text &&
      browseId &&
      (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId.startsWith('UC')) &&
      !seenArtists.has(browseId)
    ) {
      seenArtists.add(browseId);
      artists.push({ name: text, browseId });
    }
    if (
      !album &&
      text &&
      browseId &&
      (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId.startsWith('MPRE'))
    )
      album = { title: text, browseId };
  }

  const setVideoId =
    (typeof playlistData?.playlistSetVideoId === 'string'
      ? playlistData.playlistSetVideoId
      : '') ||
    (typeof playlistData?.setVideoId === 'string' ? playlistData.setVideoId : '');
  const dateAddedText = dateTextFromCandidate(candidate);

  return {
    item: {
      kind: 'song',
      title,
      subtitle,
      artwork: bestThumbnail(candidate),
      videoId,
    },
    artists,
    album,
    setVideoId,
    dateAddedText,
    dateAdded: parseDateAdded(dateAddedText),
    originalIndex,
  };
};

const collectTracks = (root: unknown, startIndex = 0) => {
  const result: RichTrack[] = [];
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
      const track = trackFromCandidate(candidate, startIndex + result.length);
      if (track) result.push(track);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return result;
};

const playlistIdFrom = (browseId: string) => browseId.trim().replace(/^VL/u, '');

const genericTrackFromRow = (row: HTMLElement): SearchResultItem | null => {
  const videoId = row.dataset.videoId ?? '';
  if (!videoId) return null;
  const title =
    row.dataset.trackTitle ||
    row.querySelector<HTMLElement>(
      '.ui143-playlist-track-title, .ui143-library-song-copy strong, .ui143-search-song-copy strong, .ui143-album-track-copy strong, .ui143-artist-track-copy strong, strong',
    )?.textContent?.trim() ||
    'Track';
  const subtitle =
    row.dataset.trackSubtitle ||
    row.querySelector<HTMLElement>(
      '.ui143-library-song-copy span, .ui143-search-song-copy .ui143-search-result-subtitle, .ui143-album-track-copy span, .ui143-artist-track-copy span',
    )?.textContent?.trim() ||
    '';
  const artwork = row.querySelector<HTMLImageElement>('img')?.src ?? '';
  return { kind: 'song', title, subtitle, artwork, videoId };
};

export const mountPlaylistWorkspace = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();
  const sheet = new CSSStyleSheet();
  void sheet.replace(workspaceStyle);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  const content = document.createElement('div');
  content.className = 'ui143-playlist-workspace-content';
  root.append(content);
  document.body.append(root);

  let disposed = false;
  let request = 0;
  let active: ActivePlaylist | null = null;
  let filter = '';
  let sort: SortOrder = 'newest';
  let currentTrackId = engine.getState().track.id;
  let restoreLibrary = false;
  let toastTimer: number | undefined;

  const app = () => document.querySelector<MusicPlayerAppElement>('ytmusic-app');
  const requireApp = () => {
    const musicApp = app();
    if (!musicApp?.networkManager?.fetch)
      throw new Error('YouTube Music is not ready');
    return musicApp;
  };

  const browse = (browseId: string) =>
    requireApp().networkManager.fetch<unknown, { browseId: string }>('/browse', {
      browseId,
    });
  const continuation = (token: string) =>
    requireApp().networkManager.fetch<unknown, { continuation: string }>('/browse', {
      continuation: token,
    });

  const showToast = (message: string, error = false) => {
    document.querySelector('.ui143-workspace-toast')?.remove();
    window.clearTimeout(toastTimer);
    const toast = document.createElement('div');
    toast.className = `ui143-workspace-toast${error ? ' is-error' : ''}`;
    toast.textContent = message;
    document.body.append(toast);
    toastTimer = window.setTimeout(() => toast.remove(), 2200);
  };

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    if (visible) syncNowPlaying();
    document.documentElement.classList.toggle('ui143-playlist-workspace-open', visible);
  };

  const syncNowPlaying = () => {
    if (root.hidden) return;
    for (const row of root.querySelectorAll<HTMLElement>('[data-video-id]')) {
      const selected = Boolean(
        currentTrackId && row.dataset.videoId === currentTrackId,
      );
      if (row.classList.contains('is-now-playing') !== selected) row.classList.toggle('is-now-playing', selected);
      if (selected) {
        if (row.getAttribute('aria-current') !== 'true') row.setAttribute('aria-current', 'true');
      } else if (row.hasAttribute('aria-current')) row.removeAttribute('aria-current');
    }
  };

  const unsubscribe = engine.subscribe((state) => {
    if (currentTrackId === state.track.id) return;
    currentTrackId = state.track.id;
    syncNowPlaying();
  });

  const closeFloating = () => {
    document.getElementById(MENU_ID)?.remove();
    document.getElementById(PICKER_ID)?.remove();
  };

  const hideLibrary = () => {
    const library = document.getElementById('ui143-library-page');
    if (library && !library.hidden) {
      restoreLibrary = true;
      library.hidden = true;
      document.documentElement.classList.remove('ui143-library-open');
    }
  };

  const restoreLibraryPage = () => {
    if (!restoreLibrary) return;
    const library = document.getElementById('ui143-library-page');
    if (library) {
      library.hidden = false;
      document.documentElement.classList.add('ui143-library-open');
    }
    restoreLibrary = false;
  };

  const clearActiveNav = () => {
    document
      .querySelectorAll<HTMLElement>('.ui143-nav-item[data-key]')
      .forEach((item) => item.classList.remove('is-active'));
  };

  const close = (restore = false) => {
    ++request;
    closeFloating();
    active = null;
    filter = '';
    setVisible(false);
    if (restore) restoreLibraryPage();
    else restoreLibrary = false;
  };

  const message = (title: string, detail = '') => {
    content.replaceChildren();
    const state = document.createElement('div');
    state.className = 'ui143-playlist-workspace-message';
    const heading = document.createElement('strong');
    heading.textContent = title;
    state.append(heading);
    if (detail) {
      const copy = document.createElement('span');
      copy.textContent = detail;
      state.append(copy);
    }
    content.append(state);
  };

  const sortedTracks = () => {
    if (!active) return [];
    const query = normalize(filter);
    const matches = active.tracks.filter((track) => {
      if (!query) return true;
      const artistText = track.artists.map((artist) => artist.name).join(' ');
      const albumText = track.album?.title ?? 'single';
      return normalize(`${track.item.title} ${artistText} ${albumText}`).includes(query);
    });
    const hasDates = matches.some((track) => track.dateAdded > 0);
    if (!hasDates) return [...matches].sort((a, b) => a.originalIndex - b.originalIndex);
    return [...matches].sort((a, b) => {
      if (!a.dateAdded && !b.dateAdded) return a.originalIndex - b.originalIndex;
      if (!a.dateAdded) return 1;
      if (!b.dateAdded) return -1;
      return sort === 'newest'
        ? b.dateAdded - a.dateAdded || a.originalIndex - b.originalIndex
        : a.dateAdded - b.dateAdded || a.originalIndex - b.originalIndex;
    });
  };

  const editPlaylist = async (actions: readonly UnknownRecord[]) => {
    if (!active) throw new Error('No playlist is open');
    const response = await requireApp().networkManager.fetch('/browse/edit_playlist', {
      playlistId: active.playlistId,
      actions,
    });
    validatePlaylistEdit(response);
  };

  const renamePlaylist = async (name: string) => {
    if (!active) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === active.title) return;
    await editPlaylist([
      { action: 'ACTION_SET_PLAYLIST_NAME', playlistName: trimmed },
    ]);
    active.title = trimmed;
    const sourceTitle = active.sourceCard?.querySelector<HTMLElement>('strong');
    if (sourceTitle) sourceTitle.textContent = trimmed;
    showToast('Playlist renamed');
    render();
  };

  const uploadArtwork = async (file: File) => {
    if (!active) return;
    if (!['image/jpeg', 'image/png'].includes(file.type))
      throw new Error('Playlist cover must be JPEG or PNG.');
    if (file.size > 2 * 1024 * 1024)
      throw new Error('Playlist cover must be 2 MB or smaller.');

    const start = await window.fetch(UPLOAD_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': file.type,
      },
    });
    if (!start.ok)
      throw new Error(`YouTube Music rejected cover upload (${start.status}).`);
    const uploadUrl = start.headers.get('x-goog-upload-url');
    const uploadId = start.headers.get('x-guploader-uploadid');
    const target =
      uploadUrl ||
      (uploadId
        ? `${UPLOAD_URL}?upload_id=${encodeURIComponent(uploadId)}&upload_protocol=resumable`
        : '');
    if (!target) throw new Error('YouTube Music did not return an upload session.');

    const uploaded = await window.fetch(target, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': file.type,
        'X-Goog-Upload-Command': 'upload, finalize',
        'X-Goog-Upload-Offset': '0',
      },
      body: file,
    });
    if (!uploaded.ok)
      throw new Error(`YouTube Music rejected the image (${uploaded.status}).`);
    const payload = (await uploaded.json()) as { encryptedBlobId?: string };
    if (!payload.encryptedBlobId)
      throw new Error('YouTube Music did not return an encrypted cover id.');

    await editPlaylist([
      {
        action: 'ACTION_SET_CUSTOM_THUMBNAIL',
        addedCustomThumbnail: {
          imageKey: {
            name: 'studio_square_thumbnail',
            type: 'PLAYLIST_IMAGE_TYPE_CUSTOM_THUMBNAIL',
          },
          playlistScottyEncryptedBlobId: payload.encryptedBlobId,
        },
      },
    ]);

    const local = URL.createObjectURL(file);
    active.artwork = local;
    const sourceImage = active.sourceCard?.querySelector<HTMLImageElement>('img');
    if (sourceImage) sourceImage.src = local;
    showToast('Playlist cover updated');
    render();
  };

  const removeTrack = async (videoId: string, setVideoId = '') => {
    if (!active || !videoId) return;
    const action: UnknownRecord = {
      action: 'ACTION_REMOVE_VIDEO',
      removedVideoId: videoId,
    };
    if (setVideoId) action.setVideoId = setVideoId;
    await editPlaylist([action]);
    const occurrence = active.tracks.findIndex((track) =>
      setVideoId
        ? track.setVideoId === setVideoId
        : track.item.videoId === videoId,
    );
    if (occurrence >= 0) active.tracks.splice(occurrence, 1);
    active.tracks.forEach((track, index) => {
      track.originalIndex = index;
    });
    showToast('Removed from playlist');
    render();
  };

  const openBrowse = (kind: 'artist' | 'album', title: string, browseId: string) => {
    if (!browseId) return;
    close(false);
    clearActiveNav();
    engine.openSearchResult({
      kind,
      title,
      subtitle: '',
      artwork: '',
      browseId,
    });
  };

  const playTracks = (tracks: readonly RichTrack[], index: number, shuffle = false) => {
    if (!active || !tracks.length) return;
    const items = tracks.map((track) => track.item);
    engine.playContext(
      items,
      Math.max(0, Math.min(items.length - 1, index)),
      { kind: 'playlist', title: active.title, browseId: active.browseId },
      shuffle ? { shuffle: true } : undefined,
    );
  };

  const openPicker = async (videoId: string) => {
    document.getElementById(PICKER_ID)?.remove();
    const overlay = document.createElement('div');
    overlay.id = PICKER_ID;
    overlay.className = 'ui143-playlist-picker-backdrop';
    const dialog = document.createElement('section');
    dialog.className = 'ui143-playlist-picker';
    const head = document.createElement('div');
    head.className = 'ui143-playlist-picker-header';
    const title = document.createElement('div');
    title.className = 'ui143-playlist-picker-title';
    title.textContent = 'Add to playlist';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ui143-playlist-picker-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => overlay.remove());
    head.append(title, closeButton);
    const list = document.createElement('div');
    list.className = 'ui143-playlist-picker-list';
    const loading = document.createElement('div');
    loading.className = 'ui143-playlist-picker-message';
    loading.textContent = 'Loading playlists…';
    list.append(loading);
    dialog.append(head, list);
    overlay.append(dialog);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);

    try {
      const playlists = await engine.getPlaylists();
      if (!overlay.isConnected) return;
      list.replaceChildren();
      for (const playlist of playlists) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ui143-playlist-picker-item';
        row.textContent = playlist.title;
        row.addEventListener('click', async () => {
          row.disabled = true;
          const old = row.textContent;
          row.textContent = 'Adding…';
          try {
            await engine.addToPlaylist(playlist.playlistId, videoId);
            row.textContent = 'Added';
            row.classList.add('is-success');
            showToast(`Added to ${playlist.title}`);
            window.setTimeout(() => overlay.remove(), 380);
          } catch (error) {
            console.error('[143 Music] Add to playlist failed', error);
            row.disabled = false;
            row.textContent = old;
            showToast('Could not add this track', true);
          }
        });
        list.append(row);
      }
      if (!list.childElementCount) {
        const empty = document.createElement('div');
        empty.className = 'ui143-playlist-picker-message';
        empty.textContent = 'No editable playlists found.';
        list.append(empty);
      }
    } catch (error) {
      console.error('[143 Music] Playlist picker failed', error);
      loading.textContent = 'Could not load playlists.';
    }
  };

  const startRadio = async (item: SearchResultItem) => {
    if (!item.videoId) return;
    try {
      const autoplay = await engine.getAutoplayItems(item.videoId);
      const seen = new Set([item.videoId]);
      const radio = [item];
      for (const candidate of autoplay) {
        if (!candidate.videoId || seen.has(candidate.videoId)) continue;
        seen.add(candidate.videoId);
        radio.push(candidate);
      }
      if (radio.length === 1) {
        engine.openSearchResult(item);
        return;
      }
      engine.playContext(radio, 0, {
        kind: 'playlist',
        title: `Radio • ${item.title}`,
        browseId: `RDAMVM${item.videoId}`,
      });
      showToast('Track radio started');
    } catch (error) {
      console.error('[143 Music] Track radio failed', error);
      showToast('Could not start radio', true);
    }
  };

  const menuButton = (
    label: string,
    action: () => void | Promise<void>,
    danger = false,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui143-track-menu-item${danger ? ' is-danger' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      document.getElementById(MENU_ID)?.remove();
      void action();
    });
    return button;
  };

  const openTrackMenu = (
    item: SearchResultItem,
    x: number,
    y: number,
    playlistContext?: { videoId: string; setVideoId: string },
  ) => {
    document.getElementById(MENU_ID)?.remove();
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'ui143-track-menu';
    menu.append(
      menuButton('Start radio', () => startRadio(item)),
      menuButton('Add to playlist', () => {
        if (item.videoId) void openPicker(item.videoId);
      }),
    );
    if (playlistContext)
      menu.append(
        menuButton(
          'Remove from playlist',
          () => removeTrack(playlistContext.videoId, playlistContext.setVideoId),
          true,
        ),
      );
    document.body.append(menu);
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(margin, Math.min(window.innerWidth - rect.width - margin, x))}px`;
    menu.style.top = `${Math.max(margin, Math.min(window.innerHeight - rect.height - margin, y))}px`;
  };

  const renderHero = () => {
    if (!active) return document.createElement('div');
    const hero = document.createElement('section');
    hero.className = 'ui143-playlist-workspace-hero';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ui143-playlist-workspace-back';
    back.textContent = '← Back to playlists';
    back.addEventListener('click', () => close(true));

    const artButton = document.createElement('button');
    artButton.type = 'button';
    artButton.className = 'ui143-playlist-workspace-art';
    artButton.title = 'Change playlist cover';
    if (active.artwork) {
      const image = document.createElement('img');
      image.src = active.artwork;
      image.alt = '';
      artButton.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.textContent = '♫';
      artButton.append(fallback);
    }
    const artHint = document.createElement('span');
    artHint.className = 'ui143-playlist-art-hint';
    artHint.textContent = 'Change cover';
    artButton.append(artHint);
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/jpeg,image/png';
    file.hidden = true;
    file.addEventListener('change', () => {
      const selected = file.files?.[0];
      if (!selected) return;
      artButton.classList.add('is-loading');
      void uploadArtwork(selected)
        .catch((error) => {
          console.error('[143 Music] Playlist cover failed', error);
          showToast(error instanceof Error ? error.message : 'Could not update cover', true);
        })
        .finally(() => artButton.classList.remove('is-loading'));
    });
    artButton.addEventListener('click', () => file.click());

    const copy = document.createElement('div');
    copy.className = 'ui143-playlist-workspace-copy';
    const label = document.createElement('span');
    label.className = 'ui143-playlist-workspace-label';
    label.textContent = 'Playlist';
    const titleButton = document.createElement('button');
    titleButton.type = 'button';
    titleButton.className = 'ui143-playlist-title-button';
    titleButton.title = 'Rename playlist';
    const heading = document.createElement('h1');
    heading.textContent = active.title;
    titleButton.append(heading);
    titleButton.addEventListener('click', () => {
      if (!active) return;
      const input = document.createElement('input');
      input.className = 'ui143-playlist-title-input';
      input.value = active.title;
      titleButton.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const finish = (save: boolean) => {
        if (done) return;
        done = true;
        if (!save) {
          render();
          return;
        }
        input.disabled = true;
        void renamePlaylist(input.value).catch((error) => {
          console.error('[143 Music] Rename playlist failed', error);
          showToast('Could not rename playlist', true);
          render();
        });
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    });
    const meta = document.createElement('div');
    meta.className = 'ui143-playlist-workspace-meta';
    meta.textContent = [
      active.subtitle,
      `${active.tracks.length} tracks`,
    ]
      .filter(Boolean)
      .join(' • ');
    copy.append(label, titleButton, meta);

    const body = document.createElement('div');
    body.className = 'ui143-playlist-workspace-hero-body';
    body.append(artButton, file, copy);
    hero.append(back, body);
    return hero;
  };

  const renderToolbar = () => {
    const bar = document.createElement('div');
    bar.className = 'ui143-playlist-workspace-toolbar';
    const playback = document.createElement('div');
    playback.className = 'ui143-playlist-workspace-playback';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'ui143-playlist-workspace-primary';
    play.textContent = 'Play';
    play.addEventListener('click', () => playTracks(sortedTracks(), 0));
    const shuffle = document.createElement('button');
    shuffle.type = 'button';
    shuffle.className = 'ui143-playlist-workspace-secondary';
    shuffle.textContent = 'Shuffle';
    shuffle.addEventListener('click', () => {
      const tracks = sortedTracks();
      if (!tracks.length) return;
      playTracks(tracks, Math.floor(Math.random() * tracks.length), true);
    });
    playback.append(play, shuffle);

    const controls = document.createElement('div');
    controls.className = 'ui143-playlist-workspace-controls';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'ui143-playlist-workspace-search';
    search.placeholder = 'Search in playlist';
    search.value = filter;
    search.addEventListener('input', () => {
      filter = search.value;
      renderTracksOnly();
      requestAnimationFrame(() => {
        const next = root.querySelector<HTMLInputElement>('.ui143-playlist-workspace-search');
        next?.focus();
        if (next) next.setSelectionRange(filter.length, filter.length);
      });
    });

    const select = document.createElement('select');
    select.className = 'ui143-playlist-workspace-sort';
    for (const [value, label] of [
      ['newest', 'Newest added'],
      ['oldest', 'Oldest added'],
    ] as const) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = sort === value;
      select.append(option);
    }
    select.addEventListener('change', () => {
      sort = select.value === 'oldest' ? 'oldest' : 'newest';
      renderTracksOnly();
    });
    controls.append(search, select);
    bar.append(playback, controls);
    return bar;
  };

  const renderTrackList = () => {
    const section = document.createElement('section');
    section.className = 'ui143-playlist-workspace-tracks';
    const tracks = sortedTracks();

    const header = document.createElement('div');
    header.className = 'ui143-playlist-track-header';
    header.innerHTML = '<span>#</span><span>Title</span><span>Album</span><span>Date added</span><span></span>';
    section.append(header);

    const list = document.createElement('div');
    list.className = 'ui143-playlist-track-list';
    for (const [viewIndex, track] of tracks.entries()) {
      const row = document.createElement('div');
      row.className = 'ui143-playlist-track';
      row.tabIndex = 0;
      row.dataset.videoId = track.item.videoId ?? '';
      row.dataset.trackTitle = track.item.title;
      row.dataset.trackSubtitle = track.item.subtitle;
      row.dataset.playlistId = active?.playlistId ?? '';
      row.dataset.setVideoId = track.setVideoId;
      row.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest('button, a, input, select')) return;
        playTracks(tracks, viewIndex);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          playTracks(tracks, viewIndex);
        }
      });

      const number = document.createElement('span');
      number.className = 'ui143-playlist-track-number';
      number.textContent = String(viewIndex + 1);

      const titleCell = document.createElement('div');
      titleCell.className = 'ui143-playlist-track-main';
      const art = document.createElement('div');
      art.className = 'ui143-playlist-track-art';
      if (track.item.artwork) {
        const image = document.createElement('img');
        image.src = track.item.artwork;
        image.alt = '';
        image.loading = 'lazy';
        art.append(image);
      } else art.textContent = '♪';
      const trackCopy = document.createElement('div');
      trackCopy.className = 'ui143-playlist-track-copy';
      const trackTitle = document.createElement('strong');
      trackTitle.className = 'ui143-playlist-track-title';
      trackTitle.textContent = track.item.title;
      const artistLine = document.createElement('div');
      artistLine.className = 'ui143-playlist-track-artists';
      if (track.artists.length) {
        track.artists.forEach((artist, index) => {
          if (index) artistLine.append(document.createTextNode(', '));
          const artistButton = document.createElement('button');
          artistButton.type = 'button';
          artistButton.textContent = artist.name;
          artistButton.addEventListener('click', (event) => {
            event.stopPropagation();
            openBrowse('artist', artist.name, artist.browseId);
          });
          artistLine.append(artistButton);
        });
      } else {
        const fallback = document.createElement('span');
        fallback.textContent = track.item.subtitle || 'Unknown artist';
        artistLine.append(fallback);
      }
      trackCopy.append(trackTitle, artistLine);
      titleCell.append(art, trackCopy);

      const albumCell = document.createElement('div');
      albumCell.className = 'ui143-playlist-track-album';
      if (track.album) {
        const albumButton = document.createElement('button');
        albumButton.type = 'button';
        albumButton.textContent = track.album.title;
        albumButton.addEventListener('click', (event) => {
          event.stopPropagation();
          if (track.album)
            openBrowse('album', track.album.title, track.album.browseId);
        });
        albumCell.append(albumButton);
      } else {
        const single = document.createElement('span');
        single.textContent = 'Single';
        albumCell.append(single);
      }

      const date = document.createElement('span');
      date.className = 'ui143-playlist-track-date';
      date.textContent = track.dateAddedText || '—';

      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'ui143-playlist-track-more';
      more.textContent = '•••';
      more.setAttribute('aria-label', `More actions for ${track.item.title}`);
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        const rect = more.getBoundingClientRect();
        openTrackMenu(
          track.item,
          rect.right - 180,
          rect.bottom + 5,
          {
            videoId: track.item.videoId ?? '',
            setVideoId: track.setVideoId,
          },
        );
      });

      row.append(number, titleCell, albumCell, date, more);
      list.append(row);
    }
    if (!tracks.length) {
      const empty = document.createElement('div');
      empty.className = 'ui143-playlist-workspace-empty';
      empty.textContent = filter ? 'No tracks match this search.' : 'This playlist is empty.';
      list.append(empty);
    }
    section.append(list);
    return section;
  };

  const renderTracksOnly = () => {
    const old = content.querySelector('.ui143-playlist-workspace-toolbar');
    const tracks = content.querySelector('.ui143-playlist-workspace-tracks');
    old?.replaceWith(renderToolbar());
    tracks?.replaceWith(renderTrackList());
    syncNowPlaying();
  };

  const render = () => {
    if (!active) return;
    content.replaceChildren(renderHero(), renderToolbar(), renderTrackList());
    if (active.continuation) {
      const loading = document.createElement('div');
      loading.className = 'ui143-playlist-workspace-loading';
      loading.textContent = 'Loading the rest of the playlist…';
      content.append(loading);
    }
    syncNowPlaying();
  };

  const loadRemaining = async (token: number) => {
    let pages = 0;
    while (
      !disposed &&
      active &&
      request === token &&
      active.continuation &&
      pages < 50
    ) {
      const nextToken = active.continuation;
      try {
        const response = await continuation(nextToken);
        if (!active || request !== token) return;
        const additions = collectTracks(response, active.tracks.length);
        active.tracks.push(...additions);
        active.continuation = continuationToken(response);
        pages++;
      } catch (error) {
        console.warn('[143 Music] Playlist continuation failed', error);
        active.continuation = '';
        break;
      }
    }
    if (active && request === token) render();
  };

  const openPlaylist = async (
    playlist: PlaylistEntry,
    sourceCard: HTMLElement | null,
  ) => {
    const token = ++request;
    hideLibrary();
    setVisible(true);
    message('Loading playlist…');
    try {
      const response = await browse(playlist.browseId);
      if (disposed || token !== request) return;
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
      active = {
        title: textFromValue(header.title) || playlist.title,
        subtitle:
          textFromValue(header.subtitle) ||
          textFromValue(header.secondSubtitle) ||
          textFromValue(header.description) ||
          '',
        artwork: bestThumbnail(header.thumbnail ?? header),
        browseId: playlist.browseId,
        playlistId: playlistIdFrom(playlist.playlistId || playlist.browseId),
        tracks: collectTracks(response),
        continuation: continuationToken(response),
        sourceCard,
      };
      filter = '';
      sort = 'newest';
      render();
      if (active.continuation) void loadRemaining(token);
    } catch (error) {
      if (token !== request) return;
      console.error('[143 Music] Enhanced playlist failed', error);
      message('Playlist unavailable', 'YouTube Music did not return this playlist.');
    }
  };

  const playlistFromCard = async (card: HTMLElement) => {
    const title = card.querySelector<HTMLElement>('strong')?.textContent?.trim() ?? '';
    if (!title) return null;
    const playlists = await engine.getPlaylists();
    const exact = playlists.find((playlist) => playlist.title.trim() === title);
    return exact ?? null;
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const back = event.target.closest<HTMLElement>(
      '.ui143-history button[aria-label="Back"]',
    );
    if (back && !root.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
      return;
    }

    const card = event.target.closest<HTMLElement>('.ui143-library-playlist');
    if (card && root.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void playlistFromCard(card)
        .then((playlist) => {
          if (playlist) {
            void openPlaylist(playlist, card);
            return;
          }
          showToast('Could not resolve this playlist', true);
        })
        .catch((error) => {
          console.error('[143 Music] Playlist card resolve failed', error);
          showToast('Could not open this playlist', true);
        });
      return;
    }

    const nav = event.target.closest('.ui143-nav-item[data-key]');
    if (nav && active) close(false);
    if (event.target.closest('.ui143-search') && active) close(false);
  };

  const onContextMenu = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest<HTMLElement>('[data-video-id]');
    if (!row) return;
    const item = genericTrackFromRow(row);
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    const playlistContext =
      row.closest(`#${ROOT_ID}`) && row.dataset.playlistId
        ? {
            videoId: item.videoId ?? '',
            setVideoId: row.dataset.setVideoId ?? '',
          }
        : undefined;
    openTrackMenu(item, event.clientX, event.clientY, playlistContext);
  };

  const dismissMenu = (event: PointerEvent) => {
    const menu = document.getElementById(MENU_ID);
    if (!menu || !(event.target instanceof Node) || menu.contains(event.target)) return;
    menu.remove();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (document.getElementById(MENU_ID)) {
      document.getElementById(MENU_ID)?.remove();
      return;
    }
    if (document.getElementById(PICKER_ID)) {
      document.getElementById(PICKER_ID)?.remove();
      return;
    }
  };

  const onSubmit = (event: SubmitEvent) => {
    if (
      active &&
      event.target instanceof Element &&
      event.target.matches('.ui143-search')
    )
      close(false);
  };

  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('pointerdown', dismissMenu, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('submit', onSubmit, true);

  return {
    isOpen: () => !root.hidden,
    back() {
      if (root.hidden) return false;
      close(true);
      return true;
    },
    close,
    dispose() {
      disposed = true;
      ++request;
      window.clearTimeout(toastTimer);
      closeFloating();
      unsubscribe();
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('pointerdown', dismissMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('submit', onSubmit, true);
      document.documentElement.classList.remove('ui143-playlist-workspace-open');
      root.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (entry) => entry !== sheet,
      );
    },
  };
};