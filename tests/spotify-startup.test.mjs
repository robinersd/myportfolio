import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function bootstrap() {
  const script = new EventTarget();
  script.remove = () => {
    script.removed = true;
  };
  const scripts = [];
  const timers = new Map();
  const win = {};
  const env = {
    window: win,
    document: { createElement: () => script, head: { append: (node) => scripts.push(node) } },
    setTimeout: (callback) => {
      timers.set(1, callback);
      return 1;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const source = await fs.readFile(
    new URL('../site/assets/spotify-api.js', import.meta.url),
    'utf8',
  );
  const context = vm.createContext(env);
  vm.runInContext(source, context);
  return { script, scripts, timers, win, repeat: () => vm.runInContext(source, context) };
}

test('Spotify starts loading before the main app and shares one ready API', async () => {
  const { script, scripts, timers, win, repeat } = await bootstrap();
  assert.equal(scripts.length, 1);
  assert.equal(script.src, 'https://open.spotify.com/embed/iframe-api/v1');
  assert.equal(script.async, true);
  const ready = win.robinerSpotifyApiReady;
  repeat();
  assert.equal(scripts.length, 1);
  assert.equal(win.robinerSpotifyApiReady, ready);
  const api = { createController() {} };
  win.onSpotifyIframeApiReady(api);
  assert.equal(await ready, api);
  assert.equal(timers.size, 0);
  const html = await fs.readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('/assets/spotify-api.js') < html.indexOf('/assets/portfolio.js'));
  assert.match(html, /rel="preconnect" href="https:\/\/open.spotify.com"/);
});

test('failed early Spotify requests clean up and allow the normal embed fallback', async () => {
  for (const errorType of ['network', 'timeout']) {
    const { script, timers, win } = await bootstrap();
    const ready = win.robinerSpotifyApiReady;
    if (errorType === 'network') script.dispatchEvent(new Event('error'));
    else timers.get(1)();
    await assert.rejects(ready, /Spotify controls could not load/);
    assert.equal(win.robinerSpotifyApiReady, undefined);
    assert.equal(script.removed, true);
    assert.equal(timers.size, 0);
  }
});
