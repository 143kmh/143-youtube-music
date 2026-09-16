export const obsOverlayPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>143 Music · Now Playing</title>
<style>
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * { box-sizing: border-box; }

  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: transparent;
  }

  body {
    display: grid;
    place-items: center;
    padding: 20px;
  }

  #card {
    --artwork-bg: none;
    position: relative;
    isolation: isolate;
    width: min(680px, calc(100vw - 40px));
    min-height: 164px;
    display: grid;
    grid-template-columns: 118px minmax(0, 1fr);
    gap: 18px;
    align-items: center;
    padding: 17px 18px;
    border: 1px solid rgba(255,255,255,.045);
    border-radius: 26px;
    background:
      radial-gradient(circle at 16% 8%, rgba(96,81,155,.16), transparent 42%),
      linear-gradient(135deg, rgba(16,16,20,.92), rgba(8,8,11,.86));
    box-shadow:
      0 22px 58px rgba(0,0,0,.34),
      0 0 34px rgba(96,81,155,.07);
    backdrop-filter: blur(20px) saturate(1.12);
    -webkit-backdrop-filter: blur(20px) saturate(1.12);
    opacity: 0;
    transform: translateY(8px) scale(.985);
    transition: opacity .22s ease, transform .22s ease;
  }

  #card::before {
    content: "";
    position: absolute;
    z-index: -2;
    inset: -14px;
    border-radius: 34px;
    background-image:
      linear-gradient(rgba(96,81,155,.22), rgba(96,81,155,.10)),
      var(--artwork-bg);
    background-size: cover;
    background-position: center;
    filter: blur(30px) saturate(1.2);
    opacity: .22;
    transform: scale(.96);
    pointer-events: none;
  }

  #card::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    box-shadow:
      inset 0 1px rgba(255,255,255,.025),
      inset 0 0 0 1px rgba(255,255,255,.018);
    pointer-events: none;
  }

  body.has-track #card {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  #card.changed {
    animation: track-change .28s ease;
  }

  @keyframes track-change {
    0% { transform: translateY(0) scale(1); }
    45% { transform: translateY(1px) scale(.992); }
    100% { transform: translateY(0) scale(1); }
  }

  #art-wrap {
    position: relative;
    width: 118px;
    height: 118px;
    border-radius: 20px;
    overflow: hidden;
    background: #18181d;
    box-shadow:
      0 12px 30px rgba(0,0,0,.28),
      inset 0 0 0 1px rgba(255,255,255,.045);
  }

  #art {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  #art-wrap::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.18), transparent 60%);
    pointer-events: none;
  }

  #content {
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2px 3px 1px 0;
  }

  #eyebrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 7px;
    color: #9188b7;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  #brand {
    color: #a797e8;
  }

  #state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #777582;
    letter-spacing: .075em;
  }

  #dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #625f6d;
    box-shadow: none;
  }

  body.playing #dot {
    background: #9686df;
    box-shadow: 0 0 12px rgba(150,134,223,.72);
  }

  #title,
  #artist,
  #album {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  #title {
    margin: 0;
    color: #f1f0f5;
    font-size: 24px;
    font-weight: 730;
    line-height: 1.12;
    letter-spacing: -.025em;
  }

  #artist {
    margin-top: 5px;
    color: #b0acb8;
    font-size: 14.5px;
    font-weight: 590;
  }

  #album {
    min-height: 15px;
    margin-top: 3px;
    color: #74717d;
    font-size: 11.5px;
  }

  #progress-row {
    display: grid;
    grid-template-columns: 42px minmax(0,1fr) 42px;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .time {
    color: #74717d;
    font-size: 10px;
    font-weight: 560;
    font-variant-numeric: tabular-nums;
  }

  #duration { text-align: right; }

  #track {
    position: relative;
    height: 4px;
    overflow: visible;
    border-radius: 999px;
    background: rgba(255,255,255,.07);
    box-shadow: inset 0 1px 2px rgba(0,0,0,.18);
  }

  #fill {
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #60519b, #a18ced);
    box-shadow: 0 0 12px rgba(96,81,155,.50);
    transition: width .22s linear;
  }
</style>
</head>
<body>
  <section id="card" aria-live="polite">
    <div id="art-wrap"><img id="art" alt="" /></div>
    <div id="content">
      <div id="eyebrow"><span id="brand">143 MUSIC</span><span id="state"><span id="dot"></span><span id="state-text">PAUSED</span></span></div>
      <h1 id="title"></h1>
      <div id="artist"></div>
      <div id="album"></div>
      <div id="progress-row">
        <span class="time" id="elapsed">0:00</span>
        <div id="track"><div id="fill"></div></div>
        <span class="time" id="duration">0:00</span>
      </div>
    </div>
  </section>
<script>
(() => {
  const card = document.getElementById('card');
  const art = document.getElementById('art');
  const title = document.getElementById('title');
  const artist = document.getElementById('artist');
  const album = document.getElementById('album');
  const elapsed = document.getElementById('elapsed');
  const duration = document.getElementById('duration');
  const fill = document.getElementById('fill');
  const stateText = document.getElementById('state-text');

  let state = null;
  let lastId = '';

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const rounded = Math.floor(seconds);
    const minutes = Math.floor(rounded / 60);
    const rest = String(rounded % 60).padStart(2, '0');
    return minutes + ':' + rest;
  };

  const effectiveTime = () => {
    if (!state) return 0;
    const drift = state.playing && state.updatedAt
      ? Math.max(0, Date.now() - state.updatedAt) / 1000
      : 0;
    return Math.min(state.duration || 0, Math.max(0, (state.time || 0) + drift));
  };

  const renderProgress = () => {
    if (!state) return;
    const current = effectiveTime();
    const total = Math.max(0, state.duration || 0);
    elapsed.textContent = formatTime(current);
    duration.textContent = formatTime(total);
    const ratio = total > 0 ? Math.min(1, current / total) : 0;
    fill.style.width = (ratio * 100).toFixed(3) + '%';
  };

  const render = (next) => {
    state = next || null;
    const hasTrack = Boolean(state && state.id && state.title);
    document.body.classList.toggle('has-track', hasTrack);
    document.body.classList.toggle('playing', Boolean(state && state.playing));
    if (!hasTrack) return;

    if (state.id !== lastId) {
      lastId = state.id;
      card.classList.remove('changed');
      void card.offsetWidth;
      card.classList.add('changed');
      window.setTimeout(() => card.classList.remove('changed'), 320);
    }

    title.textContent = state.title || 'Unknown track';
    artist.textContent = state.artist || 'Unknown artist';
    album.textContent = state.album || '';
    stateText.textContent = state.playing ? 'PLAYING' : 'PAUSED';

    if (state.artwork) {
      art.src = state.artwork;
      art.style.visibility = 'visible';
      const artworkUrl = state.artwork.replaceAll('"', '%22');
      card.style.setProperty('--artwork-bg', 'url("' + artworkUrl + '")');
    } else {
      art.removeAttribute('src');
      art.style.visibility = 'hidden';
      card.style.setProperty('--artwork-bg', 'none');
    }
    renderProgress();
  };

  fetch('/state', { cache: 'no-store' })
    .then((response) => response.json())
    .then(render)
    .catch(() => {});

  const events = new EventSource('/events');
  events.onmessage = (event) => {
    try { render(JSON.parse(event.data)); } catch {}
  };

  window.setInterval(renderProgress, 250);
})();
</script>
</body>
</html>`;
