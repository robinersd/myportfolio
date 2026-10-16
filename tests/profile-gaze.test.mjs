import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { setMaxListeners } from 'node:events';

class Element extends EventTarget {
  dataset = {};
  events = [];
  addEventListener(type, handler, options) {
    this.events.push({ type, options });
    super.addEventListener(type, handler, options);
  }
  emit(type, props = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), props);
    this.dispatchEvent(event);
    return event;
  }
}

async function harness({ reducedMotion = false, canvasAvailable = true } = {}) {
  const names = [
    'default',
    'center',
    'right',
    'down-right',
    'down',
    'down-left',
    'left',
    'up-left',
    'up',
    'up-right',
  ];
  const photos = new Map(
    names.map((name) => {
      const image = new Element();
      image.dataset.profilePhoto = name;
      image.complete = true;
      image.naturalWidth = 480;
      return [name, image];
    }),
  );
  const portrait = new Element();
  portrait.clientWidth = 112;
  portrait.clientHeight = 140;
  portrait.rect = { left: 100, top: 100, width: 112, height: 140, bottom: 240 };
  portrait.getBoundingClientRect = () => portrait.rect;
  const pixels = [];
  const canvas = {
    getContext: () =>
      canvasAvailable ? { clearRect() {}, fillRect: (...args) => pixels.push(args) } : null,
  };
  portrait.querySelector = () => canvas;
  portrait.querySelectorAll = () => [...photos.values()];
  const doc = new Element();
  doc.querySelector = () => portrait;
  doc.hidden = false;
  const win = new Element();
  win.innerHeight = 800;
  const reduced = new Element();
  reduced.matches = reducedMotion;
  let clock = 1000,
    id = 0,
    observerDisconnected = false;
  const tasks = new Map();
  const source = (
    await fs.readFile(new URL('../site/assets/profile.js', import.meta.url), 'utf8')
  ).replaceAll('export function', 'function');
  const sandbox = vm.createContext({
    document: doc,
    window: win,
    matchMedia: () => reduced,
    devicePixelRatio: 3,
    performance: { now: () => clock },
    AbortController: class extends AbortController {
      constructor() {
        super();
        setMaxListeners(0, this.signal);
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {
        observerDisconnected = true;
      }
    },
    requestAnimationFrame: (callback) => {
      tasks.set(++id, callback);
      return id;
    },
    cancelAnimationFrame: (key) => tasks.delete(key),
  });
  vm.runInContext(
    source + '\nglobalThis.api = { enableRobinerProfile, profileDirection };',
    sandbox,
  );
  const cleanup = sandbox.api.enableRobinerProfile();
  const advance = (ms = 16) => {
    clock += ms;
    const pending = [...tasks.values()];
    tasks.clear();
    pending.forEach((callback) => callback(clock));
  };
  const settle = () => {
    for (let i = 0; i < 40; i++) advance();
  };
  const point = (x, y, type = 'mouse', event = 'pointermove') =>
    doc.emit(event, { clientX: x, clientY: y, pointerType: type, isPrimary: true });
  return {
    photos,
    portrait,
    canvas,
    doc,
    win,
    reduced,
    tasks,
    pixels,
    advance,
    settle,
    point,
    cleanup,
    api: sandbox.api,
    observerDisconnected: () => observerDisconnected,
  };
}

test('profile starts as art; all eight sectors and center are relative to the portrait', async () => {
  const h = await harness({ reducedMotion: true });
  assert.equal(h.portrait.dataset.pose, 'default');
  assert.equal(h.tasks.size, 0);
  h.doc.emit('robiner-theme-change');
  assert.equal(h.portrait.dataset.pose, 'default');
  const rect = h.portrait.rect;
  const cx = rect.left + rect.width / 2,
    cy = rect.top + rect.height * 0.45;
  for (const [name, x, y] of [
    ['right', 300, 0],
    ['down-right', 300, 300],
    ['down', 0, 300],
    ['down-left', -300, 300],
    ['left', -300, 0],
    ['up-left', -300, -300],
    ['up', 0, -300],
    ['up-right', 300, -300],
    ['center', 0, 0],
  ]) {
    h.point(cx + x, cy + y);
    h.advance();
    assert.equal(h.portrait.dataset.pose, name);
    assert.equal(
      [...h.photos.values()].filter((image) => image.dataset.visible === 'true').length,
      1,
    );
  }
  h.cleanup();
});

test('pixel transition retargets rapid input and leaves no idle animation loop', async () => {
  const h = await harness();
  h.point(600, 163);
  h.advance();
  h.advance();
  h.advance(48);
  assert.equal(h.portrait.dataset.pose, 'default');
  assert.ok(h.pixels.length > 0);
  h.point(-300, 163);
  h.advance();
  h.advance(64);
  assert.equal(h.portrait.dataset.pose, 'left');
  h.point(156, 700);
  h.settle();
  assert.equal(h.portrait.dataset.pose, 'down');
  assert.equal(h.tasks.size, 0);
  assert.equal(h.canvas.width, 224, 'canvas DPR is capped at two');
  h.cleanup();
});

test('only the artwork reveal uses pixels; following poses switch in the next input frame', async () => {
  const h = await harness();
  h.point(156, 700);
  h.settle();
  assert.equal(h.portrait.dataset.pose, 'down');
  assert.ok(h.pixels.length > 0);
  const firstRevealPixels = h.pixels.length;
  for (const [x, y, pose] of [
    [156, -200, 'up'],
    [-300, 163, 'left'],
    [600, 163, 'right'],
  ]) {
    h.point(x, y);
    h.advance();
    assert.equal(h.portrait.dataset.pose, pose);
    assert.equal(h.tasks.size, 0, 'no second reveal or delayed animation queue');
    assert.equal(h.pixels.length, firstRevealPixels, 'no pixel tiles between real photos');
  }
  h.win.emit('blur');
  h.point(156, 700);
  h.settle();
  assert.ok(h.pixels.length > firstRevealPixels, 'returning from artwork still uses its reveal');
  h.cleanup();
});

test('touch pose changes also avoid pixel animation after the first art reveal', async () => {
  const h = await harness();
  h.point(156, 700, 'touch', 'pointerdown');
  h.settle();
  const initialPixels = h.pixels.length;
  h.doc.emit('touchmove', { touches: [{ clientX: 156, clientY: -200 }] });
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'up');
  assert.equal(h.pixels.length, initialPixels);
  assert.equal(h.tasks.size, 0);
  h.cleanup();
});

test('phone taps and native drags follow globally without blocking scroll or resetting at lift', async () => {
  const h = await harness({ reducedMotion: true });
  const tap = h.point(600, 163, 'touch', 'pointerdown');
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'right');
  h.doc.emit('pointercancel', { pointerType: 'touch' });
  const drag = h.doc.emit('touchmove', { touches: [{ clientX: 156, clientY: 700 }] });
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'down');
  h.doc.emit('touchend', { touches: [] });
  h.doc.emit('pointerleave', { pointerType: 'touch' });
  h.point(-300, 163); // Ignore synthetic mouse events immediately following touch.
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'down');
  assert.equal(tap.defaultPrevented || drag.defaultPrevented, false);
  for (const type of ['pointerdown', 'pointermove', 'touchstart', 'touchmove']) {
    assert.equal(h.doc.events.find((event) => event.type === type).options.passive, true);
  }
  h.cleanup();
});

test('slow and failed photos never replace the current image with an empty layer', async () => {
  const h = await harness({ reducedMotion: true });
  const right = h.photos.get('right');
  right.complete = false;
  right.naturalWidth = 0;
  h.point(600, 163);
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'default');
  right.complete = true;
  right.naturalWidth = 480;
  right.emit('load');
  assert.equal(h.portrait.dataset.pose, 'right');
  const left = h.photos.get('left');
  left.complete = false;
  left.naturalWidth = 0;
  h.point(-300, 163);
  h.advance();
  left.emit('error');
  assert.equal(h.portrait.dataset.pose, 'center');
  h.win.emit('blur');
  left.naturalWidth = 480;
  left.complete = true;
  left.emit('load');
  assert.equal(h.portrait.dataset.pose, 'default', 'late loads cannot revive an old request');
  h.cleanup();
});

test('offscreen input avoids animation; scroll recomputes direction when the photo returns', async () => {
  const h = await harness({ reducedMotion: true });
  h.portrait.rect = { ...h.portrait.rect, top: -200, bottom: -60 };
  h.point(156, 700);
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'default');
  assert.equal(h.tasks.size, 0);
  h.portrait.rect = { ...h.portrait.rect, top: 100, bottom: 240 };
  h.win.emit('scroll');
  h.advance();
  assert.equal(h.portrait.dataset.pose, 'down');
  h.cleanup();
});

test('keyboard controls and no-canvas fallback remain usable; hiding cancels pending work', async () => {
  const h = await harness({ canvasAvailable: false });
  h.portrait.emit('keydown', { key: 'ArrowUp' });
  assert.equal(h.portrait.dataset.pose, 'up');
  h.portrait.emit('keydown', { key: 'Enter' });
  assert.equal(h.portrait.dataset.pose, 'center');
  h.portrait.emit('keydown', { key: 'Escape' });
  assert.equal(h.portrait.dataset.pose, 'default');
  h.point(600, 163);
  h.doc.hidden = true;
  h.doc.emit('visibilitychange');
  h.settle();
  assert.equal(h.portrait.dataset.pose, 'default');
  assert.equal(h.tasks.size, 0);
  h.cleanup();
});

test('route cleanup removes all input listeners and animation work', async () => {
  const h = await harness();
  h.point(600, 163);
  h.advance();
  h.cleanup();
  h.point(-300, 163);
  h.doc.emit('touchmove', { touches: [{ clientX: 156, clientY: 700 }] });
  h.settle();
  assert.equal(h.portrait.dataset.pose, 'default');
  assert.equal(h.tasks.size, 0);
  assert.equal(h.observerDisconnected(), true);
});

test('reduced motion cancels an active pixel reveal without losing the desired pose', async () => {
  const h = await harness();
  h.point(600, 163);
  h.advance();
  h.advance();
  h.reduced.matches = true;
  h.reduced.emit('change');
  assert.equal(h.portrait.dataset.pose, 'right');
  assert.equal(h.tasks.size, 0);
  h.cleanup();
});
