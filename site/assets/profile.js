// Pixel cover/reveal adapted from the supplied React Bits PixelTransition source.
const GRID_COLUMNS = 10;
const TRANSITION_MS = 240;
const DIRECTIONS = [
  'right',
  'down-right',
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
];

export function profileDirection(x, y, rect) {
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height * 0.45);
  if (Math.hypot(dx, dy) < rect.width * 0.2) return 'center';
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTIONS[(sector + 8) % 8];
}

function pixelNoise(x, y, seed) {
  let h =
    Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ Math.imul(seed + 1, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function enableRobinerProfile() {
  const portrait = document.querySelector('.profile-portrait');
  if (!portrait) return;
  const canvas = portrait.querySelector('.pixelated-image-card__pixels');
  const context = canvas?.getContext('2d');
  const photos = new Map(
    [...portrait.querySelectorAll('[data-profile-photo]')].map((image) => [
      image.dataset.profilePhoto,
      image,
    ]),
  );
  if (!photos.has('default')) return;
  const lifecycle = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listen = (node, type, handler, options = {}) =>
    node.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
  const failed = new Set();
  let current = 'default',
    desired = 'default';
  let animation = null,
    animationFrame = 0,
    trackingFrame = 0;
  let lastPoint = null,
    lastTouch = -Infinity;
  const ready = (name) => {
    const image = photos.get(name);
    return image?.complete && image.naturalWidth > 0 && !failed.has(name);
  };
  const available = () =>
    ready(desired) ? desired : failed.has(desired) && ready('center') ? 'center' : null;
  const clearCanvas = () => context?.clearRect(0, 0, canvas.width, canvas.height);

  function show(name) {
    current = name;
    photos.forEach((image, key) => {
      image.dataset.visible = String(key === name);
    });
    portrait.dataset.pose = name;
    portrait.dataset.active = String(name !== 'default');
  }

  function draw() {
    clearCanvas();
    if (!context || !animation) return;
    const covering = animation.progress < 0.5;
    const local = covering ? animation.progress * 2 : animation.progress * 2 - 1;
    const cell = canvas.width / GRID_COLUMNS;
    const rows = Math.ceil(canvas.height / cell);
    context.fillStyle = '#ffffff';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        if (local >= pixelNoise(col, row, animation.seed) !== covering) continue;
        const x = Math.round(col * cell),
          y = Math.round(row * cell);
        context.fillRect(x, y, Math.round((col + 1) * cell) - x, Math.round((row + 1) * cell) - y);
      }
    }
  }

  function start() {
    const next = available();
    if (!next) return; // Keep the last image while a cold image finishes loading.
    if (reduced.matches || !context || (!animation && current !== 'default')) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      animation = null;
      show(next);
      clearCanvas();
    } else if (!animation && current !== next) {
      animation = { to: next, progress: 0, started: null, seed: Math.floor(Math.random() * 65536) };
      animationFrame = requestAnimationFrame(frame);
    } else if (animation) {
      // Only the artwork reveal uses pixels. Follow the latest pose immediately,
      // even while the first reveal is finishing, without another pixel burst.
      animation.to = next;
      if (animation.progress >= 0.5) show(next);
    }
  }

  function frame(now) {
    animationFrame = 0;
    if (!animation) return;
    animation.started ??= now;
    animation.progress = Math.min(1, (now - animation.started) / TRANSITION_MS);
    if (animation.progress >= 0.5) show(animation.to);
    draw();
    if (animation.progress < 1) animationFrame = requestAnimationFrame(frame);
    else {
      animation = null;
      clearCanvas();
      start();
    }
  }

  function request(name) {
    desired = photos.has(name) ? name : 'center';
    start();
  }

  function track() {
    trackingFrame = 0;
    if (!lastPoint || document.hidden) return;
    const rect = portrait.getBoundingClientRect();
    if (rect.width <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
    request(profileDirection(lastPoint.x, lastPoint.y, rect));
  }
  function scheduleTrack() {
    if (lastPoint && !trackingFrame) trackingFrame = requestAnimationFrame(track);
  }
  function point(x, y, type) {
    if (document.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (type === 'touch') lastTouch = performance.now();
    else if (type === 'mouse' && performance.now() - lastTouch < 700) return;
    lastPoint = { x, y, type };
    scheduleTrack();
  }
  function reset() {
    lastPoint = null;
    desired = 'default';
    cancelAnimationFrame(trackingFrame);
    cancelAnimationFrame(animationFrame);
    trackingFrame = animationFrame = 0;
    animation = null;
    show('default');
    clearCanvas();
  }

  photos.forEach((image, name) => {
    if (image.complete && !image.naturalWidth) failed.add(name);
    listen(image, 'load', () => {
      failed.delete(name);
      start();
    });
    listen(image, 'error', () => {
      failed.add(name);
      start();
    });
  });
  listen(
    document,
    'pointermove',
    (event) => {
      if (event.isPrimary !== false)
        point(event.clientX, event.clientY, event.pointerType || 'mouse');
    },
    { passive: true },
  );
  listen(
    document,
    'pointerdown',
    (event) => {
      if (event.isPrimary !== false)
        point(event.clientX, event.clientY, event.pointerType || 'mouse');
    },
    { passive: true },
  );
  // Native touchmove keeps following during a scroll after pointercancel on phones.
  // No pointer capture or preventDefault: native scrolling and links stay usable.
  const touchPoint = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    point(touch.clientX, touch.clientY, 'touch');
  };
  listen(document, 'touchstart', touchPoint, { passive: true });
  listen(document, 'touchmove', touchPoint, { passive: true });
  listen(document, 'pointerleave', (event) => {
    if (event.pointerType !== 'touch' && lastPoint?.type !== 'touch') reset();
  });
  listen(window, 'blur', reset);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) reset();
  });
  listen(window, 'scroll', scheduleTrack, { passive: true });
  listen(window, 'resize', scheduleTrack, { passive: true });
  listen(reduced, 'change', start);
  listen(portrait, 'keydown', (event) => {
    const keys = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Enter: 'center',
      ' ': 'center',
    };
    if (event.key === 'Escape') reset();
    else if (keys[event.key]) {
      event.preventDefault();
      lastPoint = null;
      cancelAnimationFrame(trackingFrame);
      trackingFrame = 0;
      request(keys[event.key]);
    }
  });
  function resize() {
    if (canvas) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(portrait.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(portrait.clientHeight * dpr));
      draw();
    }
    scheduleTrack();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(portrait);
  resize();
  show('default');
  return () => {
    lifecycle.abort();
    observer.disconnect();
    reset();
  };
}
