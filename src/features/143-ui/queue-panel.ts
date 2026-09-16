import queueStyle from './queue-panel.css?inline';

import type {
  PlaybackContextAdapter,
  PlaybackContextSource,
} from './playback-context';
import type { SearchResultItem } from './youtube-music';

const ROOT_ID = 'ui143-queue-panel';
const PLAY_CONTEXT_EVENT = 'ui143:play-context';
const PLAY_CONTEXT_INDEX_EVENT = 'ui143:play-context-index';

type PlayContextDetail = Readonly<{
  items: readonly SearchResultItem[];
  startIndex: number;
  source: PlaybackContextSource;
}>;

export const mountQueuePanel = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(queueStyle);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const root = document.createElement('aside');
  root.id = ROOT_ID;
  root.hidden = true;

  const header = document.createElement('div');
  header.className = 'ui143-queue-header';
  const heading = document.createElement('div');
  heading.className = 'ui143-queue-heading';
  const title = document.createElement('strong');
  title.textContent = 'Up next';
  const source = document.createElement('span');
  heading.append(title, source);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ui143-queue-close';
  close.setAttribute('aria-label', 'Close queue');
  close.title = 'Close queue';
  close.textContent = '×';
  close.addEventListener('click', () => engine.closeContextQueue());
  header.append(heading, close);

  const list = document.createElement('div');
  list.className = 'ui143-queue-list';
  root.append(header, list);
  document.body.append(root);

  const syncPlayerButton = (active: boolean) => {
    const button = document.querySelector<HTMLButtonElement>(
      '#ui143-player button[aria-label="Queue"]',
    );
    if (!button) return;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  };

  const rows = new Map<string, HTMLButtonElement>();
  let firstItem: unknown;
  let scrolledId = '';
  const render = () => {
    const context = engine.getPlaybackContext();
    const visible = Boolean(context?.queueOpen);
    root.hidden = !visible;
    syncPlayerButton(visible);
    if (!context) {
      list.replaceChildren();
      rows.clear();
      source.textContent = '';
      delete root.dataset.sourceKind;
      delete root.dataset.sourceTitle;
      delete root.dataset.sourceBrowseId;
      delete root.dataset.currentIndex;
      return;
    }

    root.dataset.sourceKind = context.source.kind;
    root.dataset.sourceTitle = context.source.title;
    root.dataset.currentIndex = String(context.index);
    if (context.source.browseId) root.dataset.sourceBrowseId = context.source.browseId;
    else delete root.dataset.sourceBrowseId;

    source.textContent = `${context.source.title} • ${context.items.length} tracks`;
    if (context.items[0] !== firstItem) {
      rows.clear();
      list.replaceChildren();
      firstItem = context.items[0];
      scrolledId = '';
    }
    const ids = new Set(context.items.map((item) => item.videoId!));
    for (const [id, row] of rows)
      if (!ids.has(id)) {
        row.remove();
        rows.delete(id);
      }
    for (const [index, item] of context.items.entries()) {
      const existing = rows.get(item.videoId!);
      if (existing) {
        existing.classList.toggle('is-current', index === context.index);
        existing.dataset.index = String(index);
        existing.querySelector('.ui143-queue-index')!.textContent =
          `${index + 1}/${context.items.length}`;
        continue;
      }
      const row = document.createElement('button');
      rows.set(item.videoId!, row);
      row.type = 'button';
      row.className = 'ui143-queue-row';
      row.dataset.videoId = item.videoId!;
      row.dataset.index = String(index);
      row.dataset.title = item.title;
      row.dataset.subtitle = item.subtitle;
      if (item.artwork) row.dataset.artwork = item.artwork;
      row.classList.toggle('is-current', index === context.index);
      row.addEventListener('click', () => engine.playContextIndex(index));

      const art = document.createElement('div');
      art.className = 'ui143-queue-art';
      if (item.artwork) {
        const image = document.createElement('img');
        image.src = item.artwork;
        image.alt = '';
        image.loading = 'lazy';
        art.append(image);
      } else {
        art.textContent = '♪';
      }

      const copy = document.createElement('div');
      copy.className = 'ui143-queue-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      const subtitle = document.createElement('span');
      subtitle.textContent = item.subtitle;
      copy.append(name, subtitle);

      const position = document.createElement('span');
      position.className = 'ui143-queue-index';
      position.textContent = `${index + 1}/${context.items.length}`;
      row.append(art, copy, position);
      list.append(row);
    }

    const id = context.items[context.index]?.videoId ?? '';
    if (visible && id !== scrolledId) {
      list
        .querySelector<HTMLElement>('.ui143-queue-row.is-current')
        ?.scrollIntoView({ block: 'nearest' });
      scrolledId = id;
    }
  };

  const onPlayContext = (event: Event) => {
    const detail = (event as CustomEvent<PlayContextDetail>).detail;
    if (!detail?.items?.length) return;
    engine.playContext(
      detail.items,
      detail.startIndex,
      detail.source,
    );
  };
  const onPlayContextIndex = (event: Event) => {
    const index = Number((event as CustomEvent<number>).detail);
    if (!Number.isInteger(index) || index < 0) return;
    engine.playContextIndex(index);
  };
  document.addEventListener(PLAY_CONTEXT_EVENT, onPlayContext);
  document.addEventListener(PLAY_CONTEXT_INDEX_EVENT, onPlayContextIndex);

  const unsubscribe = engine.subscribePlaybackContext(render);
  const buttonSyncTimer = window.setInterval(
    () => syncPlayerButton(Boolean(engine.getPlaybackContext()?.queueOpen)),
    120,
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && engine.getPlaybackContext()?.queueOpen)
      engine.closeContextQueue();
  };
  const onOutsidePointerDown = (event: PointerEvent) => {
    if (!engine.getPlaybackContext()?.queueOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (root.contains(target)) return;

    const element = target instanceof Element ? target : target.parentElement;
    if (element?.closest('#ui143-player button[aria-label="Queue"]')) return;

    engine.closeContextQueue();
  };
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onOutsidePointerDown, true);

  return () => {
    unsubscribe();
    window.clearInterval(buttonSyncTimer);
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    document.removeEventListener(PLAY_CONTEXT_EVENT, onPlayContext);
    document.removeEventListener(PLAY_CONTEXT_INDEX_EVENT, onPlayContextIndex);
    syncPlayerButton(false);
    root.remove();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (candidate) => candidate !== sheet,
    );
  };
};
