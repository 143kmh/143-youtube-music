import type {
  SearchArtistProfile,
  SearchCatalog,
  SearchResultItem,
  YouTubeMusicAdapter,
} from './youtube-music';

const ROOT_ID = 'ui143-artist-page';

type ArtistRef = Readonly<{
  name: string;
  browseId: string;
}>;

type OpenOptions = Readonly<{
  restoreSearch?: boolean;
  pushHistory?: boolean;
}>;

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEpisodeLike = (item: SearchResultItem) => {
  const value = `${item.title} ${item.subtitle}`;
  return (
    /\b(?:podcast|episode|interview)\b/iu.test(value) ||
    /(?:^|[\s•·—–-])(?:подкаст|эпизод|епізод|выпуск|випуск|интервью)(?=$|[\s•·—–-])/iu.test(
      value,
    )
  );
};

const playCount = (item: SearchResultItem) => {
  const text = item.subtitle.toLocaleLowerCase().replaceAll('\u00a0', ' ');
  const pattern =
    /(\d+(?:[.,]\d+)?)\s*(млрд|млн|тыс\.?|b|m|k)?\s*(?:прослушиван\p{L}*|прослуховуван\p{L}*|plays?|views?)/giu;
  let best = -1;
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1]?.replace(',', '.'));
    if (!Number.isFinite(amount)) continue;
    const suffix = match[2]?.replace('.', '').toLocaleLowerCase() ?? '';
    const multiplier =
      suffix === 'млрд' || suffix === 'b'
        ? 1_000_000_000
        : suffix === 'млн' || suffix === 'm'
          ? 1_000_000
          : suffix === 'тыс' || suffix === 'k'
            ? 1_000
            : 1;
    best = Math.max(best, amount * multiplier);
  }
  return best;
};

const rankTracks = (items: readonly SearchResultItem[]) =>
  [...items]
    .filter((item) => item.kind === 'song' && !isEpisodeLike(item))
    .map((item, index) => ({ item, index, plays: playCount(item) }))
    .sort((left, right) => right.plays - left.plays || left.index - right.index)
    .map(({ item }) => item);

const releaseYear = (item: SearchResultItem) => {
  const years = `${item.subtitle} ${item.title}`
    .match(/(?:19|20)\d{2}/gu)
    ?.map(Number)
    .filter((year) => year >= 1900 && year <= 2100);
  return years?.length ? Math.max(...years) : -1;
};

const rankReleases = (items: readonly SearchResultItem[]) =>
  [...items]
    .map((item, index) => ({ item, index, year: releaseYear(item) }))
    .sort((left, right) => right.year - left.year || left.index - right.index)
    .map(({ item }) => item);

const belongsToArtist = (item: SearchResultItem, artist: string) => {
  const key = normalize(artist);
  if (!key) return true;
  return normalize(item.subtitle).includes(key);
};

const isSingleLike = (item: SearchResultItem) =>
  /\b(?:single|ep)\b|сингл|мини[ -]?альбом|релиз|реліз/iu.test(
    item.subtitle,
  );

const mergeItems = (
  kind: SearchResultItem['kind'],
  artist: string,
  groups: readonly (readonly SearchResultItem[])[],
) => {
  const seen = new Set<string>();
  const result: SearchResultItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (item.kind !== kind || isEpisodeLike(item)) continue;
      if ((kind === 'album' || kind === 'song') && !belongsToArtist(item, artist))
        continue;
      const key = `${kind}:${item.videoId ?? item.browseId ?? `${item.title}\u0000${item.subtitle}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

const image = (item: SearchResultItem, className: string) => {
  const wrapper = document.createElement('div');
  wrapper.className = className;
  if (item.artwork) {
    const img = document.createElement('img');
    img.src = item.artwork;
    img.alt = '';
    img.loading = 'lazy';
    wrapper.append(img);
  } else {
    const fallback = document.createElement('span');
    fallback.textContent = item.kind === 'artist' ? '●' : '♪';
    wrapper.append(fallback);
  }
  return wrapper;
};

const subtitle = (item: SearchResultItem) => {
  const text = document.createElement('span');
  text.className = 'ui143-artist-subtitle';
  text.textContent = item.subtitle;
  return text;
};

export type ArtistPageController = ReturnType<typeof mountArtistPage>;

export const mountArtistPage = (engine: YouTubeMusicAdapter) => {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('main');
  root.id = ROOT_ID;
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');
  const content = document.createElement('div');
  content.className = 'ui143-artist-page-content';
  root.append(content);
  document.body.append(root);

  let request = 0;
  let current: ArtistRef | null = null;
  let restoreSearch = false;
  const history: ArtistRef[] = [];
  let currentTrackId = engine.getState().track.id;

  const setVisible = (visible: boolean) => {
    root.hidden = !visible;
    document.documentElement.classList.toggle('ui143-artist-open', visible);
  };

  const syncNowPlaying = () => {
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      'button[data-video-id]',
    )) {
      const active = Boolean(
        currentTrackId && row.dataset.videoId === currentTrackId,
      );
      row.classList.toggle('is-now-playing', active);
      if (active) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  };

  const unsubscribe = engine.subscribe((state) => {
    currentTrackId = state.track.id;
    syncNowPlaying();
  });

  const message = (title: string, detail = '') => {
    content.replaceChildren();
    const state = document.createElement('div');
    state.className = 'ui143-artist-message';
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

  const openResult = (item: SearchResultItem) => {
    if (item.kind === 'artist' && item.browseId) {
      void openInternal(
        { name: item.title, browseId: item.browseId },
        { pushHistory: true },
      );
      return;
    }
    if (!engine.openSearchResult(item)) return;
    if (!item.videoId) setVisible(false);
  };

  const resultButton = (item: SearchResultItem, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (item.videoId) button.dataset.videoId = item.videoId;
    button.addEventListener('click', () => openResult(item));
    return button;
  };

  const renderHero = (profile: SearchArtistProfile, fallbackName: string) => {
    const hero = document.createElement('section');
    hero.className = 'ui143-artist-hero';
    if (profile.banner) {
      const banner = document.createElement('img');
      banner.className = 'ui143-artist-hero-banner';
      banner.src = profile.banner;
      banner.alt = '';
      hero.append(banner);
    }
    const shade = document.createElement('div');
    shade.className = 'ui143-artist-hero-shade';
    const identity = document.createElement('div');
    identity.className = 'ui143-artist-hero-identity';
    if (profile.avatar) {
      const avatar = document.createElement('img');
      avatar.className = 'ui143-artist-avatar';
      avatar.src = profile.avatar;
      avatar.alt = '';
      identity.append(avatar);
    }
    const copy = document.createElement('div');
    copy.className = 'ui143-artist-hero-copy';
    const label = document.createElement('span');
    label.textContent = 'Artist';
    const title = document.createElement('h1');
    title.textContent = profile.title || fallbackName;
    const metrics = document.createElement('div');
    metrics.className = 'ui143-artist-metrics';
    for (const metric of [profile.subscribers, profile.monthlyListeners]) {
      if (!metric) continue;
      const span = document.createElement('span');
      span.textContent = metric;
      metrics.append(span);
    }
    copy.append(label, title, metrics);
    identity.append(copy);
    hero.append(shade, identity);
    return hero;
  };

  const renderTopTracks = (items: readonly SearchResultItem[]) => {
    const section = document.createElement('section');
    section.className = 'ui143-artist-section ui143-artist-top-tracks';
    const title = document.createElement('h2');
    title.textContent = 'Top tracks';
    const list = document.createElement('div');
    list.className = 'ui143-artist-track-list';
    for (const [index, item] of items.slice(0, 10).entries()) {
      const row = resultButton(item, 'ui143-artist-track');
      const number = document.createElement('span');
      number.className = 'ui143-artist-track-number';
      number.textContent = String(index + 1);
      const copy = document.createElement('div');
      copy.className = 'ui143-artist-track-copy';
      const name = document.createElement('strong');
      name.textContent = item.title;
      copy.append(name, subtitle(item));
      const nowPlaying = document.createElement('span');
      nowPlaying.className = 'ui143-artist-now-playing';
      nowPlaying.textContent = 'Now playing';
      row.append(number, image(item, 'ui143-artist-track-art'), copy, nowPlaying);
      list.append(row);
    }
    section.append(title, list);
    return section;
  };

  const renderShelf = (
    titleText: string,
    items: readonly SearchResultItem[],
    round = false,
  ) => {
    const section = document.createElement('section');
    section.className = 'ui143-artist-section ui143-artist-shelf';
    const title = document.createElement('h2');
    title.textContent = titleText;
    const shelf = document.createElement('div');
    shelf.className = 'ui143-artist-shelf-row';
    for (const item of items) {
      const card = resultButton(item, 'ui143-artist-card');
      const art = image(item, 'ui143-artist-card-art');
      if (round) art.classList.add('is-round');
      const name = document.createElement('strong');
      name.textContent = item.title;
      card.append(art, name, subtitle(item));
      shelf.append(card);
    }
    shelf.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        if (shelf.scrollWidth <= shelf.clientWidth) return;
        event.preventDefault();
        shelf.scrollLeft += event.deltaY;
      },
      { passive: false },
    );
    section.append(title, shelf);
    return section;
  };

  const render = (
    artist: ArtistRef,
    base: SearchCatalog,
    albumSearch: SearchCatalog | null,
    singleSearch: SearchCatalog | null,
  ) => {
    content.replaceChildren();
    const profile =
      base.featuredArtist &&
      (!base.featuredArtist.browseId ||
        base.featuredArtist.browseId === artist.browseId ||
        normalize(base.featuredArtist.title) === normalize(artist.name))
        ? base.featuredArtist
        : {
            title: artist.name,
            browseId: artist.browseId,
            avatar: '',
            banner: '',
            subscribers: '',
            monthlyListeners: '',
          };

    const songs = rankTracks(
      mergeItems('song', artist.name, [
        base.songs,
        singleSearch?.songs ?? [],
      ]),
    );
    const releases = rankReleases(
      mergeItems('album', artist.name, [
        base.albums,
        albumSearch?.albums ?? [],
        singleSearch?.albums ?? [],
      ]),
    );
    const albums = releases.filter((item) => !isSingleLike(item));
    const related = mergeItems('artist', '', [base.artists]).filter(
      (item) =>
        item.browseId !== artist.browseId &&
        normalize(item.title) !== normalize(artist.name),
    );

    content.append(renderHero(profile, artist.name));
    if (songs.length) content.append(renderTopTracks(songs));
    if (albums.length) content.append(renderShelf('Albums', albums));
    if (releases.length) content.append(renderShelf('Latest', releases));
    if (related.length)
      content.append(renderShelf('Related artists', related.slice(0, 16), true));
    syncNowPlaying();
  };

  const openInternal = async (artist: ArtistRef, options: OpenOptions = {}) => {
    if (!artist.name.trim() || !artist.browseId) return;
    if (
      options.pushHistory !== false &&
      current &&
      (current.browseId !== artist.browseId || current.name !== artist.name)
    )
      history.push(current);
    if (root.hidden) restoreSearch = options.restoreSearch === true;
    current = artist;
    const currentRequest = ++request;
    setVisible(true);
    message('Loading artist…');

    try {
      const base = await engine.searchCatalog(artist.name);
      if (currentRequest !== request) return;
      const [albumsResult, singlesResult] = await Promise.allSettled([
        engine.searchCatalog(`${artist.name} album`),
        engine.searchCatalog(`${artist.name} single`),
      ]);
      if (currentRequest !== request) return;
      render(
        artist,
        base,
        albumsResult.status === 'fulfilled' ? albumsResult.value : null,
        singlesResult.status === 'fulfilled' ? singlesResult.value : null,
      );
    } catch (error) {
      if (currentRequest !== request) return;
      console.error('[143 Music] Artist page failed', error);
      message('Artist unavailable', 'YouTube Music did not return artist data.');
    }
  };

  return {
    open(name: string, browseId: string, options: OpenOptions = {}) {
      return openInternal({ name, browseId }, options);
    },
    back() {
      if (root.hidden) return false;
      const previous = history.pop();
      if (previous) {
        void openInternal(previous, { pushHistory: false });
        return true;
      }
      ++request;
      current = null;
      setVisible(false);
      const shouldRestoreSearch = restoreSearch;
      restoreSearch = false;
      return shouldRestoreSearch ? 'search' : true;
    },
    close() {
      ++request;
      current = null;
      history.length = 0;
      restoreSearch = false;
      setVisible(false);
    },
    isOpen: () => !root.hidden,
    dispose() {
      ++request;
      unsubscribe();
      document.documentElement.classList.remove('ui143-artist-open');
      root.remove();
    },
  };
};
