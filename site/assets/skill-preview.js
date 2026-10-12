// One preview dialog across routes; illustrations stay tied to the depicted tool.
export function enableRobinerSkillPreview(previews, icons) {
  const dialog = document.querySelector('#robiner-skill-preview');
  const image = dialog.querySelector('.skill-preview-image');
  const logo = dialog.querySelector('.skill-preview-logo');
  const fallback = dialog.querySelector('.skill-preview-empty');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let opener,
    closing = false,
    timer,
    generation = 0;

  function finishClose() {
    clearTimeout(timer);
    closing = false;
    generation++;
    dialog.classList.remove('is-closing');
    dialog.close();

    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function close() {
    if (!dialog.open || closing) return;
    if (reduced.matches) {
      finishClose();
      return;
    }
    closing = true;
    dialog.classList.add('is-closing');
    timer = setTimeout(finishClose, 200);
  }
  async function open(button) {
    const name = button.dataset.skill;
    if (!Object.hasOwn(icons, name)) return;
    clearTimeout(timer);
    closing = false;
    dialog.classList.remove('is-closing', 'image-ready');
    const stamp = ++generation;
    opener = button;
    dialog.setAttribute('aria-label', `${name} photo viewer`);
    logo.src = `/assets/icons/${icons[name]}.svg`;
    logo.alt = `${name} logo`;
    image.hidden = true;
    image.removeAttribute('src');
    const preview = previews[name];
    fallback.hidden = !!preview;
    dialog.classList.toggle('has-preview', !!preview);
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('skill-preview-open');

    dialog.querySelector('.skill-preview-close').focus({ preventScroll: true });
    if (!preview) return;
    image.alt = preview.alt;
    image.src = preview.image;
    try {
      await image.decode();
      if (stamp !== generation || !dialog.open || closing) return;
      image.hidden = false;
      dialog.classList.add('image-ready');
    } catch {
      if (stamp !== generation || !dialog.open) return;
      fallback.hidden = false;
      logo.alt = `${name} logo. The preview image could not load.`;
    }
  }
  const badge = (event) => event.target.closest?.('.skill-badge[data-skill]');
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const button = badge(event);
    if (button) {
      open(button);
    }
  });
  dialog.querySelector('.skill-preview-close').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('animationend', (event) => {
    if (closing && event.target === dialog && event.animationName === 'robiner-skill-out')
      finishClose();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    document.documentElement.classList.remove('skill-preview-open');
    clearTimeout(timer);
    closing = false;
    generation++;
  });
  reduced.addEventListener('change', () => {
    if (closing && reduced.matches) finishClose();
  });
}
