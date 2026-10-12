import { resumePages } from './data.js?v=mobile-47';

const activationKey = 'portfolio.resume.activated';
let activatedInPage = false;

export function isResumeActivated() {
  try {
    return activatedInPage || sessionStorage.getItem(activationKey) === 'true';
  } catch {
    return activatedInPage;
  }
}

export function activateResume() {
  activatedInPage = true;
  try {
    sessionStorage.setItem(activationKey, 'true');
  } catch {
    // Browsers blocking storage still allow activation until this page is reloaded.
  }
  window.dispatchEvent(new CustomEvent('portfolio:resume-activated'));
}

export function renderResumeGate() {
  return `<section class="resume-gate" aria-label="Resume access">
    <p role="status">The resume isn’t activated yet — you need to activate it first to view it. You can ask the AI chat assistant for help.</p>
  </section>`;
}

function loadResumeImage(source, index, signal) {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.alt = `Robiner Dahap’s resume, page ${index + 1}`;
    image.decoding = 'async';
    const timeout = setTimeout(() => finish(new Error('Resume image load timed out.')), 15000);
    function finish(error) {
      clearTimeout(timeout);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve(image);
    }
    function loaded() {
      finish();
    }
    function failed() {
      finish(new Error('Resume image unavailable.'));
    }
    function aborted() {
      finish(new DOMException('Resume page changed.', 'AbortError'));
    }
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    image.src = source;
  });
}

export function enableResumeGate() {
  const gate = document.querySelector('.resume-gate');
  if (!gate) return;
  const lifecycle = new AbortController();
  let version = 0;
  let viewer;
  async function refresh() {
    const current = ++version;
    if (!isResumeActivated() || viewer) return;
    try {
      const images = await Promise.all(
        resumePages.map((page, index) => loadResumeImage(page, index, lifecycle.signal)),
      );
      if (lifecycle.signal.aborted || !gate.isConnected || current !== version) return;
      viewer = document.createElement('div');
      viewer.className = 'resume-viewer';
      images.forEach((image, index) => {
        const figure = document.createElement('figure');
        figure.className = 'resume-page';
        const caption = document.createElement('figcaption');
        caption.textContent = `Page ${index + 1} of ${resumePages.length}`;
        figure.append(caption, image);
        viewer.append(figure);
      });
      gate.after(viewer);
      gate.hidden = true;
    } catch (error) {
      // Keep the requested lock message instead of showing broken image placeholders.
      if (error.name !== 'AbortError') console.warn('Resume images could not be loaded.');
    }
  }
  window.addEventListener('portfolio:resume-activated', refresh);
  refresh();
  return () => {
    lifecycle.abort();
    window.removeEventListener('portfolio:resume-activated', refresh);
  };
}
