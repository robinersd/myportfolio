// Adapted from the supplied React Bits PixelTransition source for this static site.
// White square random pop; gridSize 10; gap/mosaic/fps 0; step duration 0.4s;
// trigger hover; once false. Random pattern already scatters every pixel.
const GRID_COLUMNS = 10;
const STEP_MS = 400;
const DOUBLE_TAP_MS = 420;

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
  if (!context || !photos.has('default')) return;

  const lifecycle = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const listen = (node, type, handler) =>
    node.addEventListener(type, handler, { signal: lifecycle.signal });
  let current = 'default',
    desired = 'default',
    mode = 'default';
  let hovered = false,
    keyboardFocused = false,
    touch = null;
  let lastTap = null,
    lastTouch = -Infinity;
  let animation = null,
    frameId = 0,
    lastFrame = 0;
  let returnAt = 0;

  function show(name) {
    current = name;
    photos.forEach((image, key) => {
      image.dataset.visible = String(key === name);
    });
    portrait.dataset.pose = name;
    portrait.dataset.active = String(name !== 'default');
  }
  const themedPhoto = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const clearCanvas = () => context.clearRect(0, 0, canvas.width, canvas.height);

  function draw() {
    clearCanvas();
    if (!animation || animation.progress <= 0 || animation.progress >= 1) return;
    const covering = animation.progress < 0.5;
    const local = covering ? animation.progress * 2 : animation.progress * 2 - 1;
    const cell = canvas.width / GRID_COLUMNS;
    const rows = Math.ceil(canvas.height / cell);
    const top = (canvas.height - rows * cell) / 2;
    context.fillStyle = '#ffffff';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        const delay = pixelNoise(col, row, animation.seed);
        if (local >= delay !== covering) continue;
        const x = Math.round(col * cell),
          y = Math.round(top + row * cell);
        context.fillRect(
          x,
          y,
          Math.round((col + 1) * cell) - x,
          Math.round(top + (row + 1) * cell) - y,
        );
      }
    }
  }

  function start() {
    if (animation || current === desired) {
      if (returnAt && !frameId) frameId = requestAnimationFrame(frame);
      return;
    }
    if (reduced.matches) {
      show(desired);
      clearCanvas();
      return;
    }
    animation = {
      from: current,
      to: desired,
      progress: 0,
      seed: Math.floor(Math.random() * 65536),
    };
    lastFrame = 0;
    frameId = requestAnimationFrame(frame);
  }

  function frame(now) {
    frameId = 0;
    if (returnAt > 0 && now >= returnAt) {
      returnAt = 0;
      request('default');
      return;
    }
    if (!animation && returnAt) {
      if (returnAt < 0) returnAt = now + 500;
      frameId = requestAnimationFrame(frame);
      return;
    }
    if (!animation) return;
    const dt = lastFrame ? Math.min(100, now - lastFrame) : 1000 / 60;
    lastFrame = now;
    const aim = desired === animation.from ? 0 : 1;
    const step = dt / (2 * STEP_MS);
    animation.progress = aim
      ? Math.min(1, animation.progress + step)
      : Math.max(0, animation.progress - step);
    show(animation.progress >= 0.5 ? animation.to : animation.from);
    draw();
    if (animation.progress !== aim) frameId = requestAnimationFrame(frame);
    else {
      show(aim ? animation.to : animation.from);
      animation = null;
      clearCanvas();
      start();
    }
  }

  function request(nextMode) {
    mode = nextMode;
    desired = mode === 'theme' ? themedPhoto() : mode;
    // Reverse the same pixels on release; never finish a stale reveal.
    if (
      animation &&
      desired !== animation.from &&
      desired !== animation.to &&
      animation.progress < 0.5
    ) {
      animation.to = desired;
    }
    start();
  }

  function releaseTouch(cancel = true) {
    touch = null;
    if (cancel) {
      returnAt = 0;
      request(hovered || keyboardFocused ? 'theme' : 'default');
    } else {
      // A quick tap must finish the reveal before returning, rather than reverse
      // before the hidden portrait ever becomes visible on a phone.
      returnAt = -1; // Start the return delay only after the reveal fully settles.
      start();
    }
  }

  function beginTouch(id, x, y) {
    if (touch) return; // Deduplicate native touch and pointer events in WebViews.
    const now = performance.now();
    returnAt = 0;
    hovered = keyboardFocused = false;
    lastTouch = now;
    const doubleTap =
      lastTap &&
      now - lastTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(x - lastTap.x, y - lastTap.y) < 30;
    touch = { id, x, y, started: now, doubleTap: Boolean(doubleTap) };
    request(doubleTap ? 'alternate' : 'theme');
    if (doubleTap) lastTap = null;
  }

  function endTouch(id) {
    if (touch?.id !== id) return;
    lastTouch = performance.now();
    lastTap =
      !touch.doubleTap && lastTouch - touch.started <= DOUBLE_TAP_MS
        ? { time: lastTouch, x: touch.x, y: touch.y }
        : null;
    releaseTouch(false);
  }

  listen(portrait, 'pointerenter', (event) => {
    if (event.pointerType === 'touch' || performance.now() - lastTouch < 700) return;
    hovered = true;
    request('theme');
  });
  listen(portrait, 'pointerleave', (event) => {
    if (event.pointerType === 'touch') {
      return;
    }
    if (performance.now() - lastTouch < 700) return;
    hovered = keyboardFocused = false;
    request('default');
  });
  listen(portrait, 'pointerdown', (event) => {
    keyboardFocused = false;
    if (event.pointerType === 'touch' && event.isPrimary !== false) {
      beginTouch(event.pointerId, event.clientX, event.clientY);
    }
  });
  listen(portrait, 'pointermove', (event) => {
    if (
      touch?.id === event.pointerId &&
      Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12
    ) {
      lastTap = null;
      releaseTouch();
    }
  });
  // Document listeners also release when the finger lifts outside the portrait.
  listen(document, 'pointerup', (event) => endTouch(event.pointerId));
  listen(document, 'pointercancel', (event) => {
    if (touch?.id !== event.pointerId) return;
    lastTap = null;
    releaseTouch();
  });
  // Listen to native touch as well: some embedded Android browsers expose
  // PointerEvent but dispatch only part of its touch lifecycle.
  {
    listen(portrait, 'touchstart', (event) => {
      const point = event.changedTouches[0];
      if (point) beginTouch(point.identifier, point.clientX, point.clientY);
    });
    listen(portrait, 'touchmove', (event) => {
      for (const point of event.changedTouches) {
        if (touch && Math.hypot(point.clientX - touch.x, point.clientY - touch.y) > 12) {
          lastTap = null;
          releaseTouch();
        }
      }
    });
    listen(document, 'touchend', (event) => {
      if (event.touches.length === 0 && touch) endTouch(touch.id);
    });
    listen(document, 'touchcancel', () => {
      lastTap = null;
      releaseTouch();
    });
  }
  listen(portrait, 'dblclick', (event) => {
    event.preventDefault();
    if (performance.now() - lastTouch >= 700 && hovered) request('alternate');
  });
  listen(portrait, 'focus', () => {
    if (performance.now() - lastTouch < 700 || !portrait.matches(':focus-visible')) return;
    keyboardFocused = true;
    request('theme');
  });
  listen(portrait, 'blur', () => {
    keyboardFocused = false;
    if (!hovered && !touch && !returnAt) request('default');
  });
  listen(portrait, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    keyboardFocused = hovered = false;
    lastTap = null;
    releaseTouch();
  });
  listen(document, 'robiner-theme-change', () => {
    if (mode === 'theme') request('theme');
  });
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
    animation = null;
    returnAt = 0;
    hovered = keyboardFocused = false;
    touch = lastTap = null;
    desired = mode = 'default';
    show('default');
    clearCanvas();
  });
  listen(reduced, 'change', () => {
    if (!reduced.matches) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
    animation = null;
    show(desired);
    clearCanvas();
  });
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(portrait.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(portrait.clientHeight * dpr));
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(portrait);
  resize();
  show('default');
  return () => {
    returnAt = 0;
    lifecycle.abort();
    observer.disconnect();
    cancelAnimationFrame(frameId);
    clearCanvas();
  };
}
