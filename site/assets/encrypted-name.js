// Character-by-character reveal inspired by Aceternity UI EncryptedText.
export function enableEncryptedName() {
  const heading = document.querySelector('[data-encrypted-name]');
  if (!heading) return;
  const segments = [...heading.querySelectorAll('[data-encrypted-text]')];
  const originals = segments.map((segment) => segment.dataset.encryptedText);
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const lifecycle = new AbortController();
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&';
  let frame = 0;
  let startupFrame = 0;
  let observer;
  let cells = [];
  function restore() {
    cancelAnimationFrame(frame);
    frame = 0;
    segments.forEach((segment, index) => {
      segment.textContent = originals[index];
    });
  }
  function play() {
    if (preference.matches || frame || document.hidden) return;
    cells = [];
    segments.forEach((segment, index) => {
      segment.replaceChildren();
      for (const character of originals[index]) {
        const cell = document.createElement('span');
        cell.className = 'encrypted-char';
        cell.textContent = character;
        segment.append(cell);
        if (/\s/.test(character)) continue;
        cells.push({ cell, character });
      }
    });
    // Hold each glyph's original width while the encrypted symbols change.
    cells.forEach(({ cell }) => {
      cell.style.width = `${cell.getBoundingClientRect().width}px`;
    });
    let started;
    let previousStep = -1;
    function reveal(time) {
      started ??= time;
      const step = Math.floor((time - started) / 50);
      if (step !== previousStep) {
        cells.forEach(({ cell, character }, index) => {
          const visible = index < step;
          cell.textContent = visible
            ? character
            : glyphs[Math.floor(Math.random() * glyphs.length)];
          cell.classList.toggle('is-revealed', visible);
        });
        previousStep = step;
      }
      if (step >= cells.length) restore();
      else frame = requestAnimationFrame(reveal);
    }
    frame = requestAnimationFrame(reveal);
  }
  heading.addEventListener(
    'pointerenter',
    (event) => {
      if (event.pointerType === 'mouse') play();
    },
    { signal: lifecycle.signal },
  );
  preference.addEventListener('change', restore, { signal: lifecycle.signal });
  // Touch browsers do not have mouse hover; tapping the name replays the effect.
  heading.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') play();
    },
    { signal: lifecycle.signal, passive: true },
  );
  heading.addEventListener(
    'click',
    () => {
      if (matchMedia('(hover: none)').matches) play();
    },
    { signal: lifecycle.signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) restore();
    },
    { signal: lifecycle.signal },
  );
  // Begin only when the heading is visible, so phone visitors do not miss the reveal.
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        startupFrame = requestAnimationFrame(() => {
          startupFrame = 0;
          play();
        });
      },
      { threshold: 0.25 },
    );
    observer.observe(heading);
  } else play();
  return () => {
    lifecycle.abort();
    observer?.disconnect();
    cancelAnimationFrame(startupFrame);
    restore();
  };
}
