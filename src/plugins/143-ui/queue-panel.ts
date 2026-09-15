import queueStyle from './queue-panel.css?inline';
import type { PlaybackContextAdapter } from './playback-context';

const ROOT_ID = 'ui143-queue-panel';

export const mountQueuePanel = (engine: PlaybackContextAdapter) => {
  document.getElementById(ROOT_ID)?.remove();

  const sheet = new CSSStyleSheet();
  void sheet.replace(queueStyle);
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

  const render = () => {
    const context = engine.getPlaybackContext();
    const visible = Boolean(context?.queueOpen);
    root.hidden = !visible;
    syncPlayerButton(visible);
    if (!context) {
      list.replaceChildren();
      source.textContent = '';
      return;
    }

    source.textContent = `${context.source.title} • ${context.items.length} tracks`;
    list.replaceChildren();
    for (const [index, item] of context.items.entries()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ui143-queue-row';
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

    list
      .querySelector<HTMLElement>('.ui143-queue-row.is-current')
      ?.scrollIntoView({ block: 'nearest' });
  };

  const unsubscribe = engine.subscribePlaybackContext(render);
  const buttonSyncTimer = window.setInterval(
    () => syncPlayerButton(Boolean(engine.getPlaybackContext()?.queueOpen)),
    120,
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && engine.getPlaybackContext()?.queueOpen)
      engine.closeContextQueue();
  };
  window.addEventListener('keydown', onKeyDown);

  return () => {
    unsubscribe();
    window.clearInterval(buttonSyncTimer);
    window.removeEventListener('keydown', onKeyDown);
    syncPlayerButton(false);
    root.remove();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (candidate) => candidate !== sheet,
    );
  };
};
