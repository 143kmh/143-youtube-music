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
    padding: 10px;
  }

  #card {
    width: min(500px, calc(100vw - 20px));
    min-height: 120px;
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 14px;
    align-items: center;
    padding: 12px;
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 22px;
    background:
      radial-gradient(circle at 15% 15%, rgba(96,81,155,.20), transparent 38%),
      linear-gradient(135deg, rgba(17,17,20,.94), rgba(10,10,12,.88));
    box-shadow: 0 18px 48px rgba(0,0,0,.34), inset 0 1px rgba(255,255,255,.04);
    backdrop-filter: blur(18px) saturate(1.15);
    -webkit-backdrop-filter: blur(18px) saturate(1.15);
    opacity: 0;
    transform: translateY(8px) scale(.985);
    transition: opacity .22s ease, transform .22s ease;
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
    width: 96px;
    height: 96px;
    border-radius: 16px;
    overflow: hidden;
    background: #1b1b20;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
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
    background: linear-gradient(to top, rgba(0,0,0,.20), transparent 58%);
    pointer-events: none;
  }

  #content {
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2px 4px 1px 0;
  }

  #eyebrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
    color: #8f86b9;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .13em;
    text-transform: uppercase;
  }

  #brand {
    color: #a99be7;
  }

  #state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #777582;
    letter-spacing: .08em;
  }

  #dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #625f6d;
    box-shadow: none;
  }

  body.playing #dot {
    background: #8f7fd7;
    box-shadow: 0 0 10px rgba(143,127,215,.75);
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
    color: #f4f3f7;
    font-size: 17px;
    font-weight: 720;
    line-height: 1.18;
    letter-spacing: -.02em;
  }

  #artist {
    margin-top: 4px;
    color: #aaa7b1;
    font-size: 11.5px;
    font-weight: 560;
  }

  #album {
    min-height: 14px;
    margin-top: 2px;
    color: #6e6b75;
    font-size: 9.5px;
  }

  #progress-row {
    display: grid;
    grid-template-columns: 35px minmax(0,1fr) 35px;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .time {
    color: #67646f;
    font-size: 8.5px;
    font-variant-numeric: tabular-nums;
  }

  #duration { text-align: right; }

  #track {
    position: relative;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
  }

  #fill {
    width: 0%;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #60519b, #9d8ae8);
    box-shadow: 0 0 10px rgba(96,81,155,.55);
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
    } else {
      art.removeAttribute('src');
      art.style.visibility = 'hidden';
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
