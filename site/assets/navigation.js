// Keep the shell and chatbot mounted while changing the page content.
export function enableRobinerNavigation({ render, initialize, routes }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let entryAnimation;
  let scrollTimer;
  window.history.scrollRestoration = 'manual';

  function saveScroll() {
    window.history.replaceState(
      { ...window.history.state, robinerScrollY: window.scrollY },
      '',
      window.location.href,
    );
  }
  function changePage(url, { fromHistory = false, scrollY = 0 } = {}) {
    entryAnimation?.cancel();
    if (!fromHistory) {
      saveScroll();
      window.history.pushState({ robinerScrollY: 0 }, '', url.pathname + url.search);
    }
    render();
    const main = document.querySelector('#main');
    // Avoid animating the previous page's scroll position into the new page.
    document.documentElement.classList.add('page-switching');
    window.scrollTo({ top: scrollY, behavior: 'auto' });
    initialize({ pageEntry: true });
    main.dataset.navigation = 'client';
    main.dataset.page = url.pathname;
    main.focus({ preventScroll: true });
    requestAnimationFrame(() => document.documentElement.classList.remove('page-switching'));
    if (!reducedMotion.matches && typeof main.animate === 'function') {
      entryAnimation = main.animate([{ opacity: 0.25 }, { opacity: 1 }], {
        duration: 220,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      });
    }
  }
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target?.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.hash) return;
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    if (!routes.has(pathname)) return;
    event.preventDefault();
    if (pathname === '/experience') url.pathname = '/projects';
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    changePage(url);
  });
  window.addEventListener('popstate', (event) => {
    changePage(new URL(window.location.href), {
      fromHistory: true,
      scrollY: event.state?.robinerScrollY || 0,
    });
  });
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveScroll, 150);
    },
    { passive: true },
  );
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) entryAnimation?.cancel();
  });
}
