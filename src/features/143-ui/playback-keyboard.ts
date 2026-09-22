export const installPlaybackKeyboard = (engine: { togglePlayback(): void }) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing
    )
      return;
    const path = event.composedPath();
    if (
      path.some(
        (node) =>
          node instanceof Element &&
          node.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], dialog[open], [role="dialog"]',
          ),
      )
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) engine.togglePlayback();
  };
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
};
