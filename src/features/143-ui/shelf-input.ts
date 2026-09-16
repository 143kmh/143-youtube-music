const STYLE_ID = 'ui143-shelf-fixes';

const mountStyle = () => {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ui143-artist-shelf-row,
    .ui143-search-albums .ui143-search-card-grid {
      scroll-snap-type: none !important;
      scrollbar-width: auto !important;
      scrollbar-color: rgba(255,255,255,.34) rgba(255,255,255,.055);
      padding-bottom: 14px !important;
    }
    .ui143-artist-shelf-row::-webkit-scrollbar,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar {
      height: 11px !important;
    }
    .ui143-artist-shelf-row::-webkit-scrollbar-track,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar-track {
      border-radius: 999px;
      background: rgba(255,255,255,.055);
    }
    .ui143-artist-shelf-row::-webkit-scrollbar-thumb,
    .ui143-search-albums .ui143-search-card-grid::-webkit-scrollbar-thumb {
      min-width: 42px;
      border: 2px solid transparent;
      border-radius: 999px;
      background: rgba(255,255,255,.34) !important;
      background-clip: padding-box !important;
    }
    .ui143-artist-shelf-row:hover::-webkit-scrollbar-thumb,
    .ui143-search-albums .ui143-search-card-grid:hover::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.48) !important;
      background-clip: padding-box !important;
    }
  `;
  document.head.append(style);
  return () => style.remove();
};

export const installShelfInput = () => {
  document.getElementById(STYLE_ID)?.remove();
  return mountStyle();
};
