import type { MusicPlayerAppElement } from '@/types/music-player-app-element';
import type { MusicPlayer } from '@/types/music-player';
import type { QueueElement } from '@/types/queue';

type ArtistEntry = {
  name: string;
  browseId: string;
};

type PlaylistEntry = {
  title: string;
  browseId: string;
  playlistId: string;
};

type UnknownRecord = Record<string, unknown>;

type TextRun = {
  text?: string;
  navigationEndpoint?: {
    browseEndpoint?: {
      browseId?: string;
      browseEndpointContextSupportedConfigs?: {
        browseEndpointContextMusicConfig?: {
          pageType?: string;
        };
      };
    };
  };
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const app = () =>
  document.querySelector<MusicPlayerAppElement>('ytmusic-app');

const playerApi = () =>
  document.querySelector<HTMLElement & MusicPlayer>('#movie_player');

const currentQueueRenderer = () => {
  const queue = document.querySelector<QueueElement>('#queue');
  const items = queue?.queue.store.store.getState().queue.items ?? [];

  for (const item of items) {
    const renderer =
      item.playlistPanelVideoRenderer ??
      item.playlistPanelVideoWrapperRenderer?.primaryRenderer
        .playlistPanelVideoRenderer;
    if (renderer?.selected) return renderer;
  }

  return null;
};

const currentArtists = (): ArtistEntry[] => {
  const renderer = currentQueueRenderer();
  const result: ArtistEntry[] = [];
  const seen = new Set<string>();

  for (const run of renderer?.longBylineText?.runs ?? []) {
    const browse = run.navigationEndpoint?.browseEndpoint;
    const pageType =
      browse?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType;
    const name = run.text?.trim();
    const browseId = browse?.browseId;
    if (!name || !browseId || pageType !== 'MUSIC_PAGE_TYPE_ARTIST') continue;
    if (seen.has(browseId)) continue;
    seen.add(browseId);
    result.push({ name, browseId });
  }

  if (result.length > 0) return result;

  // Queue data is the best source because it contains every credited artist.
  // Keep a clickable primary-artist fallback for tracks where the queue has not
  // materialized yet.
  const response = playerApi()?.getPlayerResponse() as unknown as
    | { videoDetails?: { author?: string; channelId?: string } }
    | undefined;
  const name = response?.videoDetails?.author?.trim();
  const browseId = response?.videoDetails?.channelId;
  return name && browseId ? [{ name, browseId }] : [];
};

const syncArtistLinks = () => {
  const container = document.querySelector<HTMLElement>('.ui143-player-artist');
  if (!container) return;

  const artists = currentArtists();
  if (artists.length === 0) {
    const primary = playerApi()?.getVideoData().author?.trim();
    if (primary && container.dataset.ui143Artists !== `plain:${primary}`) {
      container.dataset.ui143Artists = `plain:${primary}`;
      container.textContent = primary;
    }
    return;
  }

  const key = artists.map(({ browseId, name }) => `${browseId}:${name}`).join('|');
  if (container.dataset.ui143Artists === key) return;
  container.dataset.ui143Artists = key;
  container.replaceChildren();

  artists.forEach(({ name, browseId }, index) => {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'ui143-player-artist-separator';
      separator.textContent = ', ';
      container.append(separator);
    }

    const artist = document.createElement('button');
    artist.type = 'button';
    artist.className = 'ui143-player-artist-link ui143-player-artist-button';
    artist.textContent = name;
    artist.title = `Open ${name}`;
    artist.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      app()?.navigate(browseId);
    });
    container.append(artist);
  });
};

const readRuns = (value: unknown): TextRun[] => {
  if (!isRecord(value) || !Array.isArray(value.runs)) return [];
  return value.runs.filter(isRecord) as TextRun[];
};

const candidateRuns = (candidate: UnknownRecord): TextRun[] => {
  const runs = [...readRuns(candidate.title)];
  const flexColumns = candidate.flexColumns;
  if (!Array.isArray(flexColumns)) return runs;

  for (const column of flexColumns) {
    if (!isRecord(column)) continue;
    const renderer = column.musicResponsiveListItemFlexColumnRenderer;
    if (!isRecord(renderer)) continue;
    runs.push(...readRuns(renderer.text));
  }
  return runs;
};

const playlistFromCandidate = (candidate: UnknownRecord): PlaylistEntry | null => {
  const runs = candidateRuns(candidate);
  const playlistRun = runs.find((run) => {
    const browseId = run.navigationEndpoint?.browseEndpoint?.browseId;
    return typeof browseId === 'string' && browseId.startsWith('VLPL');
  });
  const browseId = playlistRun?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!browseId) return null;

  const title =
    readRuns(candidate.title)
      .map((run) => run.text?.trim() ?? '')
      .find(Boolean) ??
    runs.map((run) => run.text?.trim() ?? '').find(Boolean);
  if (!title) return null;

  return {
    title,
    browseId,
    playlistId: browseId.slice(2),
  };
};

const collectPlaylists = (root: unknown): PlaylistEntry[] => {
  const result: PlaylistEntry[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: unknown) => {
    if (!isRecord(candidate)) return;
    const playlist = playlistFromCandidate(candidate);
    if (!playlist || seen.has(playlist.playlistId)) return;
    seen.add(playlist.playlistId);
    result.push(playlist);
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;

    addCandidate(value.musicTwoRowItemRenderer);
    addCandidate(value.musicResponsiveListItemRenderer);
    Object.values(value).forEach(visit);
  };

  visit(root);
  return result;
};

const closePlaylistPicker = () => {
  document.getElementById('ui143-playlist-picker')?.remove();
};

const renderPickerMessage = (list: HTMLElement, message: string) => {
  list.replaceChildren();
  const row = document.createElement('div');
  row.className = 'ui143-playlist-picker-message';
  row.textContent = message;
  list.append(row);
};

const openPlaylistPicker = async () => {
  closePlaylistPicker();

  const musicApp = app();
  const videoId = playerApi()?.getVideoData().video_id;
  if (!musicApp || !videoId) return;

  const overlay = document.createElement('div');
  overlay.id = 'ui143-playlist-picker';
  overlay.className = 'ui143-playlist-picker-backdrop';

  const dialog = document.createElement('section');
  dialog.className = 'ui143-playlist-picker';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Add to playlist');

  const header = document.createElement('div');
  header.className = 'ui143-playlist-picker-header';
  const heading = document.createElement('div');
  heading.className = 'ui143-playlist-picker-title';
  heading.textContent = 'Add to playlist';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ui143-playlist-picker-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closePlaylistPicker);
  header.append(heading, close);

  const list = document.createElement('div');
  list.className = 'ui143-playlist-picker-list';
  renderPickerMessage(list, 'Loading playlists…');

  dialog.append(header, list);
  overlay.append(dialog);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) closePlaylistPicker();
  });
  document.body.append(overlay);

  try {
    const response = await musicApp.networkManager.fetch<unknown, { browseId: string }>(
      '/browse',
      { browseId: 'FEmusic_liked_playlists' },
    );
    const playlists = collectPlaylists(response);

    if (playlists.length === 0) {
      renderPickerMessage(list, 'No editable playlists found.');
      return;
    }

    list.replaceChildren();
    for (const playlist of playlists) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-playlist-picker-item';
      row.textContent = playlist.title;
      row.addEventListener('click', async () => {
        row.disabled = true;
        row.classList.add('is-loading');
        const original = row.textContent;
        row.textContent = 'Adding…';
        try {
          await musicApp.networkManager.fetch<
            unknown,
            {
              playlistId: string;
              actions: { action: string; addedVideoId: string }[];
            }
          >('/playlist/edit', {
            playlistId: playlist.playlistId,
            actions: [
              {
                action: 'ACTION_ADD_VIDEO',
                addedVideoId: videoId,
              },
            ],
          });
          row.classList.remove('is-loading');
          row.classList.add('is-success');
          row.textContent = 'Added';
          window.setTimeout(closePlaylistPicker, 420);
        } catch (error) {
          console.error('[143 Music] Failed to add track to playlist', error);
          row.disabled = false;
          row.classList.remove('is-loading');
          row.textContent = original;
          renderPickerMessage(list, 'Could not add this track. Try again.');
        }
      });
      list.append(row);
    }
  } catch (error) {
    console.error('[143 Music] Failed to load playlists', error);
    renderPickerMessage(list, 'Could not load playlists.');
  }
};

export const mountPlayerPolish = () => {
  const playlistButton = document.querySelector<HTMLButtonElement>(
    '.ui143-player button[aria-label="Add to playlist"]',
  );

  const playlistListener = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openPlaylistPicker();
  };
  playlistButton?.addEventListener('click', playlistListener, true);

  const escapeListener = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePlaylistPicker();
  };
  window.addEventListener('keydown', escapeListener);

  const artistInterval = window.setInterval(syncArtistLinks, 250);
  syncArtistLinks();

  return () => {
    playlistButton?.removeEventListener('click', playlistListener, true);
    window.removeEventListener('keydown', escapeListener);
    window.clearInterval(artistInterval);
    closePlaylistPicker();
  };
};
