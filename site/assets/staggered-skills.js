export const clampProgress = (value) => Math.max(0, Math.min(1, value));
export const skillColumns = (width) => (width < 600 ? 2 : width < 900 ? 3 : 4);

export function renderStaggeredSkills(skills, previews, icons, escape) {
  const tiles = skills.map((name) => {
    const picture = previews[name]
      ? `<img class="staggered-skill-image" src="${escape(previews[name].image)}" alt="" loading="lazy" decoding="async" draggable="false">`
      : '';
    return `<button class="skill-badge staggered-skill-tile" type="button"
      data-skill="${escape(name)}" data-stagger-item
      aria-haspopup="dialog" aria-controls="robiner-skill-preview"
    >${picture}<span class="staggered-skill-copy">
      <img class="skill-logo" src="/assets/icons/${escape(icons[name])}.svg" alt="" width="22" height="22">
      <span>${escape(name)}</span>
    </span></button>`;
  });
  return `<div class="staggered-skills" data-staggered-skills>

    <p class="muted staggered-help">Hover or touch to preview · Double-tap to open a picture</p>
    <div class="staggered-grid">${tiles.join('')}</div>
  </div>`;
}

export function enableStaggeredSkills() {
  const roots = [...document.querySelectorAll('[data-staggered-skills]')];
  if (!roots.length) return () => {};
  const lifecycle = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set();
  const state = new Map(roots.map((root) => [root, { value: 0, target: 0 }]));
  const resetPreviews = new Map();
  let frame = 0,
    alive = true;
  const listen = (node, type, handler, options = {}) =>
    node.addEventListener(type, handler, { signal: lifecycle.signal, ...options });

  function paint(root, progress) {
    const columns = skillColumns(innerWidth);
    root.querySelectorAll('[data-stagger-item]').forEach((tile, index) => {
      const column = index % columns;
      const delay = Math.abs(column - (columns - 1) / 2) * 0.045;
      const reveal = clampProgress((progress - delay) / (1 - delay));
      tile.style.setProperty('--stagger-y', `${(1 - reveal) * 450}%`);
      tile.style.setProperty('--stagger-opacity', String(reveal));
    });
  }
  function measure() {
    if (!alive) return;
    roots.forEach((root) => {
      const entry = state.get(root);
      entry.target = reduced.matches
        ? 1
        : clampProgress((innerHeight - root.getBoundingClientRect().top) / (innerHeight * 0.6));
    });
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    if (!alive || document.hidden) return;
    let moving = false;
    roots.forEach((root) => {
      if (!visible.has(root) && !reduced.matches) return;
      const entry = state.get(root);
      entry.value += (entry.target - entry.value) * 0.16;
      if (Math.abs(entry.target - entry.value) < 0.002) entry.value = entry.target;
      else moving = true;
      paint(root, reduced.matches ? 1 : entry.value);
    });
    if (moving) frame = requestAnimationFrame(update);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visible.add(entry.target);
        else {
          visible.delete(entry.target);
          resetPreviews.get(entry.target)?.();
        }
      });
      measure();
    },
    { rootMargin: '100px' },
  );

  roots.forEach((root) => {
    const cards = [...root.querySelectorAll('[data-stagger-item]')];
    let previewCard = null,
      mouseHoverCard = null,
      timer = 0,
      gesture = null,
      lastTap = null,
      ignoreUntil = 0;
    const cardAt = (target) => target.closest?.('.staggered-skill-tile');
    function hide() {
      clearTimeout(timer);
      timer = 0;
      previewCard?.classList.remove('is-previewing');
      previewCard = null;
    }
    function reset() {
      hide();
      gesture = null;
      lastTap = null;
      mouseHoverCard = null;
    }
    function show(card) {
      hide();
      previewCard = card;
      card.classList.add('is-previewing');
    }
    function hideLater(delay) {
      clearTimeout(timer);
      timer = setTimeout(hide, delay);
    }
    function press(card, x, y, id = null) {
      if (!card || document.querySelector('dialog[open]')) return;
      gesture = { card, x, y, id, moved: false };
      show(card);
    }
    function move(x, y) {
      if (!gesture || Math.hypot(x - gesture.x, y - gesture.y) <= 10) return;
      gesture.moved = true;
      ignoreUntil = performance.now() + 500;
      lastTap = null;
      hide();
    }
    function release(cancelled = false) {
      if (!gesture) return;
      if (cancelled || gesture.moved) {
        ignoreUntil = performance.now() + 500;
        lastTap = null;
        hide();
      } else hideLater(180);
      gesture = null;
    }
    resetPreviews.set(root, reset);
    root.classList.add('stagger-ready');
    paint(root, reduced.matches ? 1 : 0);
    observer.observe(root);
    cards.forEach((card) => {
      listen(card, 'pointerenter', (event) => {
        if (event.pointerType === 'mouse') {
          mouseHoverCard = card;
          show(card);
        }
      });
      listen(card, 'pointerleave', (event) => {
        if (event.pointerType === 'mouse') {
          if (mouseHoverCard === card) mouseHoverCard = null;
          if (previewCard === card) hide();
        }
      });
      listen(card, 'focus', () => {
        if (card.matches(':focus-visible')) show(card);
      });
      listen(card, 'blur', () => {
        if (previewCard === card) hide();
      });
      listen(card, 'click', (event) => {
        // Native keyboard/assistive activation opens directly.
        if (event.detail === 0 && !event.pointerType) {
          reset();
          return;
        }
        const now = performance.now();
        if (now < ignoreUntil || gesture?.moved) {
          event.preventDefault();
          reset();
          return;
        }
        const doubleTap = lastTap?.card === card && (event.detail >= 2 || now - lastTap.time < 380);
        if (doubleTap) {
          reset();
          return;
        }
        event.preventDefault();
        lastTap = { card, time: now };
        show(card);
        // Touch-generated hover must not leave a preview permanently visible.
        if (mouseHoverCard !== card) hideLater(650);
      });
    });
    listen(root, 'pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      press(cardAt(event.target), event.clientX, event.clientY, event.pointerId);
    });
    listen(
      window,
      'pointermove',
      (event) => {
        if (gesture?.id === event.pointerId) move(event.clientX, event.clientY);
      },
      { passive: true },
    );
    listen(window, 'pointerup', (event) => {
      if (gesture?.id === event.pointerId) release();
    });
    listen(window, 'pointercancel', (event) => {
      if (gesture?.id === event.pointerId) release(true);
    });
    listen(
      root,
      'touchstart',
      (event) => {
        if (event.touches.length !== 1) {
          release(true);
          return;
        }
        const touch = event.touches[0];
        press(cardAt(event.target), touch.clientX, touch.clientY);
      },
      { passive: true },
    );
    listen(
      root,
      'touchmove',
      (event) => {
        if (event.touches.length !== 1) {
          release(true);
          return;
        }
        const touch = event.touches[0];
        move(touch.clientX, touch.clientY);
      },
      { passive: true },
    );
    listen(window, 'touchend', () => release(), { passive: true });
    listen(window, 'touchcancel', () => release(true), { passive: true });
    listen(window, 'scroll', reset, { passive: true });
    listen(window, 'resize', reset, { passive: true });
  });
  listen(window, 'scroll', measure, { passive: true });
  listen(window, 'resize', measure, { passive: true });
  listen(reduced, 'change', measure);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      resetPreviews.forEach((reset) => reset());
    } else measure();
  });
  measure();
  return () => {
    alive = false;
    lifecycle.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    resetPreviews.forEach((reset) => reset());
    roots.forEach((root) => root.classList.remove('stagger-ready'));
  };
}
