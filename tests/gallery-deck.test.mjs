import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { renderPixelGallery } from '../site/assets/pixel-gallery.js';
import { projects, gallery } from '../site/assets/data.js';

class Element extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.attributes = new Map();
    this.animations = [];
    const classes = new Set();
    this.classList = {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    };
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  removeAttribute(key) {
    this.attributes.delete(key);
    if (key === 'data-deck-slot') delete this.dataset.deckSlot;
  }
  focus() {
    this.focused = true;
  }
  querySelector(selector) {
    return this.nodes?.get(selector) || null;
  }
  querySelectorAll() {
    return [];
  }
  append(child) {
    this.children.push(child);
    child.parent = this;
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }
  contains(child) {
    return this.children.includes(child);
  }
  animate() {
    const animation = {
      canceled: false,
      cancel() {
        this.canceled = true;
      },
    };
    this.animations.push(animation);
    return animation;
  }
  getBoundingClientRect() {
    return { left: 100, top: 50, width: 390, height: 330 };
  }
  async emit(type, extras = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), extras);
    this.dispatchEvent(event);
    await new Promise((resolve) => setImmediate(resolve));
    return event;
  }
}
function clock() {
  let id = 0;
  const timers = new Map();
  const frames = new Map();
  return {
    timers,
    frames,
    setTimeout(callback, delay) {
      timers.set(++id, { callback, delay });
      return id;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    requestAnimationFrame(callback) {
      frames.set(++id, callback);
      return id;
    },
    cancelAnimationFrame(key) {
      frames.delete(key);
    },
    frame() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    },
  };
}
async function load(file, context, exported) {
  const source = (
    await fs.readFile(new URL(`../site/assets/${file}`, import.meta.url), 'utf8')
  ).replaceAll('export function', 'function');
  const sandbox = vm.createContext(context);
  vm.runInContext(source + `\nglobalThis.api = { ${exported} };`, sandbox);
  return sandbox.api;
}

test('phone deck retains rotation and keyboard selection; desktop shows every card and link', async () => {
  const shell = new Element(),
    grid = new Element(),
    doc = new Element();
  const cards = projects.map(() => new Element());
  const links = projects.map(() => new Element());
  shell.nodes = new Map([['.project-grid', grid]]);
  grid.querySelectorAll = () => cards;
  cards.forEach((card, index) => {
    card.nodes = new Map([['h3', { textContent: projects[index].name }]]);
    card.querySelectorAll = () => [links[index]];
  });
  doc.querySelectorAll = () => [shell];
  const desktop = new Element();
  desktop.matches = false;
  const win = new Element();
  win.matchMedia = () => desktop;
  const api = await load(
    'project-deck.js',
    { document: doc, window: win, AbortController },
    'enableRobinerProjectDeck',
  );
  const stop = api.enableRobinerProjectDeck();
  assert.equal(cards[0].dataset.deckSlot, 'center');
  await cards[1].emit('click', { button: 0 });
  assert.equal(cards[1].dataset.deckSlot, 'center');
  assert.equal(links[0].getAttribute('tabindex'), '-1');
  await shell.emit('keydown', { key: 'ArrowRight' });
  assert.equal(cards[2].dataset.deckSlot, 'center');
  assert.equal(cards[2].focused, true);
  await cards[2].emit('pointerdown', { button: 0, pointerType: 'touch' });
  assert.equal(cards[2].classList.contains('is-deck-pressed'), true);
  desktop.matches = true;
  await desktop.emit('change');
  assert.equal(grid.classList.contains('project-deck'), false);
  assert.equal(grid.classList.contains('project-desktop'), true);
  cards.forEach((card) => assert.equal(card.dataset.deckSlot, undefined));
  links.forEach((link) => assert.equal(link.getAttribute('tabindex'), null));
  assert.equal(cards[2].classList.contains('is-deck-pressed'), false);
  for (const card of cards) {
    await card.emit('pointerdown', { button: 0, pointerType: 'mouse' });
    assert.equal(
      card.classList.contains('is-deck-pressed'),
      true,
      'Every desktop card supports press feedback',
    );
    await doc.emit('pointerup');
    assert.equal(
      card.classList.contains('is-deck-pressed'),
      false,
      'Press feedback resets on release',
    );
    const click = await card.emit('click', { button: 0 });
    assert.equal(click.defaultPrevented, false, 'Desktop card presses never block project links');
  }
  await cards[1].emit('pointerdown', { button: 0, pointerType: 'mouse' });
  await win.emit('blur');
  assert.equal(cards[1].classList.contains('is-deck-pressed'), false);
  await shell.emit('keydown', { key: 'Home' });
  desktop.matches = false;
  await desktop.emit('change');
  assert.equal(
    cards[2].dataset.deckSlot,
    'center',
    'Desktop interaction must not change the phone selection',
  );
  assert.equal(grid.classList.contains('project-desktop'), false);
  assert.equal(links[0].getAttribute('tabindex'), '-1');
  await doc.emit('pointerup');
  stop();
  assert.equal(grid.classList.contains('project-deck'), false);
  assert.equal(cards[2].getAttribute('role'), null);
  assert.equal(links[0].getAttribute('tabindex'), null);
  desktop.matches = true;
  await desktop.emit('change');
  assert.equal(
    grid.classList.contains('project-desktop'),
    false,
    'Route cleanup removes the media listener',
  );
});

test('whole web project cards keep native click and Enter navigation on desktop and phone', async () => {
  for (const isDesktop of [false, true]) {
    const shell = new Element(),
      grid = new Element(),
      doc = new Element();
    const cards = projects.map((project) => {
      const card = new Element();
      card.nodes = new Map([['h3', { textContent: project.name }]]);
      if (project.url) {
        card.setAttribute('href', project.url);
        card.setAttribute('aria-label', `${project.name} website`);
      }
      return card;
    });
    shell.nodes = new Map([['.project-grid', grid]]);
    grid.querySelectorAll = () => cards;
    doc.querySelectorAll = () => [shell];
    const desktop = Object.assign(new Element(), { matches: isDesktop });
    const win = new Element();
    win.matchMedia = () => desktop;
    const api = await load(
      'project-deck.js',
      { document: doc, window: win, AbortController },
      'enableRobinerProjectDeck',
    );
    const stop = api.enableRobinerProjectDeck();
    for (let index = 0; index < 2; index++) {
      const click = await cards[index].emit('click', { button: 0 });
      assert.equal(click.defaultPrevented, false, 'A rear linked card opens on the first tap');
      const enter = await cards[index].emit('keydown', { key: 'Enter' });
      assert.equal(enter.defaultPrevented, false, 'Native keyboard navigation is preserved');
      assert.equal(cards[index].getAttribute('href'), projects[index].url);
      assert.equal(
        cards[index].getAttribute('role'),
        null,
        'A native link must retain link semantics',
      );
    }
    const hardwareClick = await cards[2].emit('click', { button: 0 });
    assert.equal(hardwareClick.defaultPrevented, !isDesktop);
    assert.equal(cards[2].getAttribute('href'), null);
    stop();
    assert.equal(cards[0].getAttribute('aria-label'), `${projects[0].name} website`);
  }
});

test('gallery removes thumbnails while retaining its bounded region', () => {
  const trail = renderPixelGallery(gallery, String);
  assert.match(trail, /data-pixel-gallery/);
  assert.doesNotMatch(trail, /data-gallery-photo|pixel-gallery-choices/);
});

test('phone trail remains inside its gallery, bounds active images and supports viewing', async () => {
  const root = new Element();
  const layer = new Element();
  root.nodes = new Map([['.pixel-gallery-layer', layer]]);
  const choices = [new Element(), new Element()];
  choices.forEach((button, index) => {
    button.dataset.galleryPhoto = String(index);
  });
  const doc = new Element();
  doc.hidden = false;
  doc.querySelector = () => root;
  doc.querySelectorAll = () => choices;
  doc.createElement = () => new Element();
  const reduced = new Element();
  reduced.matches = false;
  const timers = clock();
  const opens = [];
  class LoadedImage {
    set src(value) {
      this.onload();
    }
  }
  const api = await load(
    'pixel-gallery.js',
    {
      document: doc,
      matchMedia: () => reduced,
      AbortController,
      Image: LoadedImage,
      ...timers,
    },
    'enablePixelGallery',
  );
  const stop = api.enablePixelGallery([{ image: '/one.jpg' }, { image: '/two.jpg' }], {
    onOpen: (index) => opens.push(index),
  });
  for (let index = 0; index < 12; index++) {
    await root.emit('pointerdown', { pointerType: 'touch', clientX: 490, clientY: 380 });
  }
  assert.equal(layer.children.length, 6);
  layer.children.forEach((image) => {
    assert.ok(parseFloat(image.style.left) >= 0);
    assert.ok(parseFloat(image.style.top) >= 0);
    assert.ok(parseFloat(image.style.left) + parseFloat(image.style.width) <= 390);
    assert.ok(parseFloat(image.style.top) + parseFloat(image.style.height) <= 330);
    assert.equal(image.children.length, 5);
  });
  await root.emit('pointerdown', { pointerType: 'touch', clientX: 230, clientY: 220 });
  await root.emit('pointerup', { pointerType: 'touch', clientX: 230, clientY: 220 });
  assert.equal(opens.length, 1);
  await root.emit('pointerdown', { pointerType: 'touch', clientX: 230, clientY: 220 });
  await root.emit('pointerup', { pointerType: 'touch', clientX: 270, clientY: 220 });
  assert.equal(opens.length, 1, 'swiping must not open the viewer');
  await root.emit('pointerleave');
  assert.equal(timers.frames.size, 0);
  doc.hidden = true;
  await doc.emit('visibilitychange');
  assert.equal(layer.children.length, 0);
  assert.equal(timers.timers.size, 0);
  stop();
  assert.equal(timers.frames.size, 0);
});
