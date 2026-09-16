/** Observe custom page content, not YouTube's DOM or the progress player. */
export const observePages = (selector: string, refresh: () => void) => {
  if (typeof MutationObserver === 'undefined') return () => {};
  const pages = new Map<HTMLElement, MutationObserver>();
  const discover = () => {
    for (const [page, observer] of pages) {
      if (!page.isConnected) {
        observer.disconnect();
        pages.delete(page);
      }
    }
    for (const page of document.querySelectorAll<HTMLElement>(selector)) {
      if (pages.has(page)) continue;
      const observer = new MutationObserver(() => {
        if (!page.hidden) refresh();
      });
      observer.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      pages.set(page, observer);
      if (!page.hidden) refresh();
    }
  };
  const mounts = new MutationObserver(discover);
  // Custom page roots are direct children of body.
  mounts.observe(document.body, { childList: true });
  discover();
  return () => {
    mounts.disconnect();
    for (const observer of pages.values()) observer.disconnect();
    pages.clear();
  };
};
