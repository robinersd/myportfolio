import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../site/assets/', import.meta.url);
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.value = '';
    this.hidden = false;
    this.isConnected = true;
    this.rawText = '';
    this.classList = { add() {}, toggle() {} };
  }
  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  async emit(type, extra = {}) {
    await this.listeners.get(type)?.({ preventDefault() {}, ...extra });
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.append(child);
  }
  after(child) {
    this.sibling = child;
  }
  replaceChildren(...children) {
    this.children = children;
    this.rawText = '';
  }
  setAttribute() {}
  focus() {}
  set textContent(value) {
    this.rawText = value;
    this.children = [];
  }
  get textContent() {
    return this.rawText + this.children.map((child) => child.textContent).join('');
  }
  querySelector(selector) {
    return (
      this.nodes?.get(selector) ||
      this.children.find((child) => child.className === selector.slice(1)) ||
      null
    );
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return this.parent;
  }
}
function executable(source) {
  return source.replace(/^import[\s\S]*?;\s*/gm, '').replaceAll('export function', 'function');
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('resume shows the exact lock without clues, then loads public pages after activation', async () => {
  const source = await fs.readFile(new URL('resume.js', root), 'utf8');
  const gate = new Element();
  const events = new Element();
  const storage = new Map();
  const images = [];
  const context = vm.createContext({
    document: {
      querySelector: () => gate,
      createElement(tag) {
        const element = new Element(tag);
        if (tag === 'img') images.push(element);
        return element;
      },
    },
    window: {
      addEventListener: (...args) => events.addEventListener(...args),
      removeEventListener: (...args) => events.removeEventListener(...args),
      dispatchEvent: (event) => events.emit(event.type),
    },
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    resumePages: ['/assets/images/resume-page-1.png', '/assets/images/resume-page-2.png'],
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(
    executable(source) +
      '\nglobalThis.resume = { renderResumeGate, enableResumeGate, activateResume, isResumeActivated };',
    context,
  );
  const html = context.resume.renderResumeGate();
  assert.ok(
    html.includes(
      'The resume isn’t activated yet — you need to activate it first to view it. You can ask the AI chat assistant for help.',
    ),
  );
  assert.doesNotMatch(html, /activate the resume|Open assistant|button|Checking access/);
  const stop = context.resume.enableResumeGate();
  assert.equal(images.length, 0, 'Locked visitor should not fetch resume pages');
  context.resume.activateResume();
  assert.equal(context.resume.isResumeActivated(), true);
  assert.equal(images.length, 2);
  assert.equal(gate.sibling, undefined, 'Do not render broken/loading placeholders');
  await images[0].emit('load');
  await images[1].emit('load');
  await tick();
  assert.equal(gate.hidden, true);
  assert.equal(gate.sibling.children.length, 2);
  assert.equal(gate.sibling.children[0].children[1].src, '/assets/images/resume-page-1.png');
  stop();
  assert.equal(events.listeners.size, 0);
});

test('certificate opens in the existing page and closes through button/backdrop', async () => {
  const source = await fs.readFile(new URL('certificate-viewer.js', root), 'utf8');
  const viewer = new Element();
  const doc = new Element();
  const image = new Element('img');
  const close = new Element('button');
  viewer.nodes = new Map([
    ['.certificate-full', image],
    ['.certificate-close', close],
  ]);
  let opens = 0;
  let closes = 0;
  const pageClasses = new Set();
  viewer.showModal = () => {
    opens++;
    viewer.open = true;
  };
  viewer.close = () => {
    closes++;
    viewer.open = false;
    viewer.emit('close');
  };
  const context = vm.createContext({
    document: {
      querySelector: () => viewer,
      documentElement: {
        classList: {
          add: (value) => pageClasses.add(value),
          remove: (value) => pageClasses.delete(value),
        },
      },
      addEventListener: (...args) => doc.addEventListener(...args),
    },
  });
  vm.runInContext(
    executable(source) +
      '\nglobalThis.certificate = { renderCertificateDialog, enableCertificateViewer };',
    context,
  );
  const markup = context.certificate.renderCertificateDialog();
  assert.match(markup, /<dialog/);
  assert.doesNotMatch(markup, /certificate-toolbar|certificate-caption|<h2/);
  context.certificate.enableCertificateViewer({
    image: '/assets/images/certificates/oop-restored.webp',
    title: 'Top 8',
    issuer: 'ICCT',
  });
  await doc.emit('click', { target: { closest: () => ({}) } });
  assert.equal(opens, 1);
  assert.equal(image.src, '/assets/images/certificates/oop-restored.webp');
  assert.equal(pageClasses.has('certificate-viewer-open'), true);
  await viewer.emit('click', { target: image });
  assert.equal(closes, 0, 'clicking the certificate keeps it open');
  await close.emit('click');
  assert.equal(closes, 1);
  assert.equal(pageClasses.has('certificate-viewer-open'), false);
  await doc.emit('click', { target: { closest: () => ({}) } });
  await viewer.emit('click', { target: viewer, clientX: 5, clientY: 50 });
  assert.equal(opens, 2);
  assert.equal(closes, 2);
  assert.equal(pageClasses.has('certificate-viewer-open'), false);
});

test('project markup uses responsive eager previews and certificate buttons do not open tabs', async () => {
  const source = await fs.readFile(new URL('portfolio.js', root), 'utf8');
  const project = source.slice(
    source.indexOf('function projectCard('),
    source.indexOf('function educationSection('),
  );
  assert.match(project, /srcset=/);
  assert.match(project, /loading="eager"/);
  assert.doesNotMatch(project, /loading="lazy"/);
  const render = vm.runInNewContext(project + '\nprojectCard;', {
    text: (value) => String(value),
    skillIcons: {},
  });
  for (const [id, url] of [
    ['streetwear', 'https://streetwear-tau.vercel.app/'],
    ['alagatrack', 'https://alagatrack.vercel.app/'],
  ]) {
    const card = render({ id, name: id, url, image: '/preview.webp', tools: [] });
    assert.match(card, /^<a class="project-card"/);
    assert.ok(card.includes(`href="${url}"`));
    assert.equal(
      (card.match(/<a\s/g) || []).length,
      1,
      'Whole-card link cannot contain nested links',
    );
    assert.match(card, /<\/a>$/);
  }
  assert.match(render({ id: 'medicare', name: 'Medicare', url: null, tools: [] }), /^<article /);
  const award = source.slice(
    source.indexOf('function awardSection('),
    source.indexOf('function contactSection('),
  );
  assert.doesNotMatch(award, /target="_blank"|href=/);
  assert.equal((award.match(/data-certificate-open/g) || []).length, 2);
  assert.doesNotMatch(source, /data-chat-question="activate the resume"/);
});
