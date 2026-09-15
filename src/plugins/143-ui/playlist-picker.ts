import type { YouTubeMusicAdapter } from './youtube-music';

export const mountPlaylistPicker = (engine: YouTubeMusicAdapter) => {
  let disposed = false;
  let activeOverlay: HTMLElement | null = null;
  let closeTimer: number | undefined;
  const closePlaylistPicker = () => {
    activeOverlay?.remove();
    activeOverlay = null;
    window.clearTimeout(closeTimer);
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

    const videoId = engine.getState().track.id;
    if (disposed || !videoId) return;

    const overlay = document.createElement('div');
    activeOverlay = overlay;
    const isCurrent = () => !disposed && activeOverlay === overlay;
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
      const playlists = await engine.getPlaylists();
      if (!isCurrent()) return;

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
            await engine.addToPlaylist(playlist.playlistId, videoId);
            if (!isCurrent()) return;
            row.classList.remove('is-loading');
            row.classList.add('is-success');
            row.textContent = 'Added';
            closeTimer = window.setTimeout(() => {
              if (isCurrent()) closePlaylistPicker();
            }, 420);
          } catch (error) {
            if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      console.error('[143 Music] Failed to load playlists', error);
      renderPickerMessage(list, 'Could not load playlists.');
    }
  };

  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePlaylistPicker();
  };
  window.addEventListener('keydown', escape);
  return {
    open: openPlaylistPicker,
    dispose() {
      disposed = true;
      closePlaylistPicker();
      window.removeEventListener('keydown', escape);
    },
  };
};
