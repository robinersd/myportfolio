// Native distance-based magnification inspired by Magic UI's Dock.
export function enableSocialDock() {
  const dock = document.querySelector('[data-social-dock]');
  if (!dock) return;
  const items = [...dock.querySelectorAll('.dock-item')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const lifecycle = new AbortController();
  const options = { signal: lifecycle.signal };
  function reset() {
    items.forEach((item) => {
      item.style.removeProperty('--dock-scale');
      item.style.removeProperty('--dock-lift');
    });
  }
  function magnify(event) {
    if (event.pointerType !== 'mouse' || reduced.matches) return;
    items.forEach((item) => {
      const bounds = item.getBoundingClientRect();
      const distance = Math.abs(event.clientX - bounds.left - bounds.width / 2);
      const proximity = Math.max(0, 1 - distance / 110);
      item.style.setProperty('--dock-scale', String(1 + proximity * 0.38));
      item.style.setProperty('--dock-lift', `${-proximity * 6}px`);
    });
  }
  dock.addEventListener('pointermove', magnify, options);
  dock.addEventListener('pointerleave', reset, options);
  dock.addEventListener('focusout', reset, options);
  items.forEach((item) => {
    item.addEventListener(
      'focus',
      () => {
        reset();
        if (!reduced.matches) item.style.setProperty('--dock-scale', '1.22');
      },
      options,
    );
    item.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'mouse' || reduced.matches) return;
        reset();
        item.style.setProperty('--dock-scale', '1.16');
      },
      { ...options, passive: true },
    );
  });
  document.addEventListener('pointerup', reset, options);
  document.addEventListener('pointercancel', reset, options);
  window.addEventListener('blur', reset, options);
  reduced.addEventListener('change', reset, options);
  return () => {
    lifecycle.abort();
    reset();
  };
}
