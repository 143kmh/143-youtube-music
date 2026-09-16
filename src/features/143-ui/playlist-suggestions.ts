import type { PlaybackContextAdapter } from './playback-context';
import type { SearchResultItem } from './youtube-music';

const ROOT_ID = 'ui143-playlist-suggestions';
const STYLE_ID = 'ui143-playlist-suggestions-style';

type PlaylistEditor = PlaybackContextAdapter & {
  addToPlaylist: (playlistId: string, videoId: string) => Promise<void>;
};

const playSuggestion = (engine: PlaylistEditor, item: SearchResultItem) => {
  if (!item.videoId) return;
  engine.openSearchResult(item);
};

const appendLiveTrack = (
  engine: PlaylistEditor,
  playlistId: string,
  item: SearchResultItem,
) => {
  const workspace = document.getElementById('ui143-playlist-workspace');
  if (!workspace || workspace.hidden || !item.videoId) return;
  const list = workspace.querySelector<HTMLElement>('.ui143-playlist-track-list');
  if (!list) return;
  if (
    list.querySelector<HTMLElement>(
      `.ui143-playlist-track[data-video-id="${CSS.escape(item.videoId)}"]`,
    )
  )
    return;

  list.querySelector('.ui143-playlist-workspace-empty')?.remove();

  const row = document.createElement('div');
  row.className = 'ui143-playlist-track';
  row.tabIndex = 0;
  row.dataset.videoId = item.videoId;
  row.dataset.trackTitle = item.title;
  row.dataset.trackSubtitle = item.subtitle;
  row.dataset.playlistId = playlistId;
  row.dataset.setVideoId = '';
  const play = () => playSuggestion(engine, item);
  row.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('button, a, input, select')) return;
    play();
  });
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    play();
  });

  const number = document.createElement('span');
  number.className = 'ui143-playlist-track-number';
  number.textContent = String(
    list.querySelectorAll('.ui143-playlist-track[data-video-id]').length + 1,
  );

  const titleCell = document.createElement('div');
  titleCell.className = 'ui143-playlist-track-main';
  const art = document.createElement('div');
  art.className = 'ui143-playlist-track-art';
  if (item.artwork) {
    const image = document.createElement('img');
    image.src = item.artwork;
    image.alt = '';
    image.loading = 'lazy';
    art.append(image);
  } else art.textContent = '♪';
  const trackCopy = document.createElement('div');
  trackCopy.className = 'ui143-playlist-track-copy';
  const trackTitle = document.createElement('strong');
  trackTitle.className = 'ui143-playlist-track-title';
  trackTitle.textContent = item.title;
  const artistLine = document.createElement('div');
  artistLine.className = 'ui143-playlist-track-artists';
  const artist = document.createElement('span');
  artist.textContent = item.subtitle || 'Unknown artist';
  artistLine.append(artist);
  trackCopy.append(trackTitle, artistLine);
  titleCell.append(art, trackCopy);

  const album = document.createElement('div');
  album.className = 'ui143-playlist-track-album';
  const single = document.createElement('span');
  single.textContent = 'Single';
  album.append(single);

  const date = document.createElement('span');
  date.className = 'ui143-playlist-track-date';
  date.textContent = 'Just now';

  const spacer = document.createElement('span');
  row.append(number, titleCell, album, date, spacer);
  list.append(row);

  const meta = workspace.querySelector<HTMLElement>('.ui143-playlist-workspace-meta');
  if (meta) {
    const count = list.querySelectorAll(
      '.ui143-playlist-track[data-video-id]',
    ).length;
    meta.textContent = /\d+\s+tracks?/iu.test(meta.textContent ?? '')
      ? (meta.textContent ?? '').replace(/\d+\s+tracks?/iu, `${count} tracks`)
      : `${meta.textContent ? `${meta.textContent} • ` : ''}${count} tracks`;
  }
};

const makeRow = (
  engine: PlaylistEditor,
  playlistId: string,
  item: SearchResultItem,
) => {
  const row = document.createElement('div');
  row.className = 'ui143-playlist-suggestion';
  row.tabIndex = item.videoId ? 0 : -1;
  row.setAttribute('role', item.videoId ? 'button' : 'group');
  row.title = item.videoId ? `Play ${item.title}` : '';
  row.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('button')) return;
    playSuggestion(engine, item);
  });
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    playSuggestion(engine, item);
  });

  const art = document.createElement('div');
  art.className = 'ui143-playlist-suggestion-art';
  if (item.artwork) {
    const image = document.createElement('img');
    image.src = item.artwork;
    image.alt = '';
    image.loading = 'lazy';
    art.append(image);
  } else art.textContent = '♪';

  const copy = document.createElement('div');
  copy.className = 'ui143-playlist-suggestion-copy';
  const title = document.createElement('strong');
  title.textContent = item.title;
  const meta = document.createElement('span');
  meta.textContent = item.subtitle;
  copy.append(title, meta);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'ui143-playlist-suggestion-add';
  add.textContent = 'Add';
  add.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!item.videoId || add.disabled) return;
    add.disabled = true;
    add.textContent = 'Adding…';
    try {
      await engine.addToPlaylist(playlistId, item.videoId);
      appendLiveTrack(engine, playlistId, item);
      add.textContent = 'Added';
      row.classList.add('is-added');
      window.setTimeout(() => row.remove(), 360);
    } catch (error) {
      console.error('[143 Music] Suggested track add failed', error);
      add.disabled = false;
      add.textContent = 'Retry';
    }
  });
  row.append(art, copy, add);
  return row;
};

const render = (
  engine: PlaylistEditor,
  playlistId: string,
  items: readonly SearchResultItem[],
) => {
  const section = document.createElement('section');
  section.id = ROOT_ID;
  section.dataset.playlistId = playlistId;
  const title = document.createElement('h2');
  title.textContent = 'Suggested tracks';
  const copy = document.createElement('p');
  copy.textContent = 'Similar music — click a track to preview it, or add it to this playlist.';
  section.append(title, copy);
  for (const item of items) section.append(makeRow(engine, playlistId, item));
  return section;
};

const mountStyle = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} { margin-top: 30px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.075); }
    #${ROOT_ID} h2 { margin: 0 0 5px; color: #f5f5f5; font-size: 18px; font-weight: 720; }
    #${ROOT_ID} > p { margin: 0 0 12px; color: #858585; font-size: 11px; }
    .ui143-playlist-suggestion { min-height: 56px; display: grid; grid-template-columns: 42px minmax(0,1fr) auto; align-items: center; gap: 11px; padding: 6px 8px; border-radius: 7px; cursor: pointer; transition: background 120ms ease, opacity 160ms ease, transform 160ms ease; }
    .ui143-playlist-suggestion:hover { background: rgba(255,255,255,.045); }
    .ui143-playlist-suggestion:focus-visible { outline: 1px solid var(--ui143-accent-strong); outline-offset: 1px; }
    .ui143-playlist-suggestion.is-added { opacity: 0; transform: translateX(8px); }
    .ui143-playlist-suggestion-art { width: 42px; height: 42px; overflow: hidden; display: grid; place-items: center; border-radius: 5px; background: #202020; color: #777; }
    .ui143-playlist-suggestion-art img { width: 100%; height: 100%; object-fit: cover; }
    .ui143-playlist-suggestion-copy { min-width: 0; }
    .ui143-playlist-suggestion-copy strong, .ui143-playlist-suggestion-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ui143-playlist-suggestion-copy strong { color: #eee; font-size: 12px; font-weight: 650; }
    .ui143-playlist-suggestion-copy span { margin-top: 3px; color: #8c8c8c; font-size: 10.5px; }
    .ui143-playlist-suggestion-add { min-width: 74px; padding: 7px 11px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; background: transparent; color: #eee; font: inherit; font-size: 10.5px; font-weight: 680; cursor: pointer; }
    .ui143-playlist-suggestion-add:hover:not(:disabled) { background: rgba(255,255,255,.08); }
    .ui143-playlist-suggestion-add:disabled { opacity: .62; cursor: default; }
  `;
  document.head.append(style);
  return () => style.remove();
};

import { observePages } from './page-observer';

export const installPlaylistSuggestions = (engine: PlaybackContextAdapter) => {
  document.getElementById(STYLE_ID)?.remove();
  const editor = engine as PlaylistEditor;
  const removeStyle = mountStyle();
  let revision = 0;
  let timer: number | undefined;

  const refresh = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const workspace = document.getElementById('ui143-playlist-workspace');
      if (!workspace || workspace.hidden) return;
      const rows = [...workspace.querySelectorAll<HTMLElement>('.ui143-playlist-track[data-video-id][data-playlist-id]')];
      const seed = rows[0]?.dataset.videoId ?? '';
      const playlistId = rows[0]?.dataset.playlistId ?? '';
      if (!seed || !playlistId) {
        document.getElementById(ROOT_ID)?.remove();
        return;
      }
      if (document.getElementById(ROOT_ID)?.dataset.playlistId === playlistId) return;
      const current = ++revision;
      try {
        const autoplay = await editor.getAutoplayItems(seed);
        if (current !== revision || workspace.hidden) return;
        const existing = new Set(rows.map((row) => row.dataset.videoId).filter(Boolean));
        const seen = new Set<string>();
        const suggestions = autoplay.filter((item) => {
          if (item.kind !== 'song' || !item.videoId) return false;
          if (existing.has(item.videoId) || seen.has(item.videoId)) return false;
          seen.add(item.videoId);
          return true;
        }).slice(0, 8);
        document.getElementById(ROOT_ID)?.remove();
        if (!suggestions.length) return;
        workspace.querySelector<HTMLElement>('.ui143-playlist-workspace-content')?.append(render(editor, playlistId, suggestions));
      } catch (error) {
        console.warn('[143 Music] Could not load playlist suggestions', error);
      }
    }, 140);
  };

  const disconnect = observePages('#ui143-playlist-workspace', refresh);
  refresh();
  return () => {
    revision++;
    window.clearTimeout(timer);
    disconnect();
    document.getElementById(ROOT_ID)?.remove();
    removeStyle();
  };
};
