import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('new visitors start dark before paint, while a chosen light theme is remembered', async () => {
  const early = await fs.readFile(new URL('../site/assets/theme-init.js', import.meta.url), 'utf8');
  const theme = (
    await fs.readFile(new URL('../site/assets/theme.js', import.meta.url), 'utf8')
  ).replace('export function', 'function');
  for (const saved of [null, 'dark', 'light', 'invalid', 'blocked']) {
    const root = { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } };
    const button = new EventTarget();
    button.setAttribute = () => {};
    const storage = new Map(saved ? [['theme', saved]] : []);
    const env = {
      document: { documentElement: root, querySelector: () => button, dispatchEvent() {} },
      window: { matchMedia: () => Object.assign(new EventTarget(), { matches: false }) },
      localStorage: {
        getItem: (key) => {
          if (saved === 'blocked') throw new Error('blocked');
          return storage.get(key) || null;
        },
        setItem: (key, value) => {
          if (saved === 'blocked') throw new Error('blocked');
          storage.set(key, value);
        },
      },
      Event,
      AbortController,
      setTimeout,
      clearTimeout,
    };
    const context = vm.createContext(env);
    vm.runInContext(early, context);
    assert.equal(root.dataset.theme, saved === 'light' ? 'light' : 'dark');
    const stop = vm.runInContext(theme + '\nenableRobinerTheme();', context);
    assert.equal(root.dataset.theme, saved === 'light' ? 'light' : 'dark');
    button.dispatchEvent(new Event('click'));
    assert.equal(root.dataset.theme, saved === 'light' ? 'dark' : 'light');
    if (saved !== 'blocked') assert.equal(storage.get('theme'), root.dataset.theme);
    stop();
  }
  const html = await fs.readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]*data-theme="dark"/);
  assert.ok(html.indexOf('theme-init.js') < html.indexOf('rel="stylesheet"'));
});
