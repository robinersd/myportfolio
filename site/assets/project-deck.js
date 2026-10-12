// Three desktop columns, with the existing spotlight deck on smaller screens.
export function enableRobinerProjectDeck() {
  const lifecycle = new AbortController();
  const options = { signal: lifecycle.signal };
  const restore = [];
  const desktop = window.matchMedia('(min-width: 900px)');

  document.querySelectorAll('[data-project-deck]').forEach((shell) => {
    const grid = shell.querySelector('.project-grid');
    const cards = [...grid.querySelectorAll('.project-card')];
    if (cards.length !== 3) return;
    const names = cards.map((card) => card.querySelector('h3').textContent);
    const isSiteLink = cards.map((card) => Boolean(card.getAttribute('href')));
    const cardLabels = cards.map((card) => card.getAttribute('aria-label'));

    const linkTabs = new Map(
      cards.flatMap((card) =>
        [...card.querySelectorAll('a')].map((link) => [link, link.getAttribute('tabindex')]),
      ),
    );
    const slots = ['center', 'left', 'right'];
    let selected = 0;

    function paint() {
      grid.classList.remove(desktop.matches ? 'project-deck' : 'project-desktop');
      grid.classList.add(desktop.matches ? 'project-desktop' : 'project-deck');
      cards.forEach((card, index) => {
        if (desktop.matches) {
          card.removeAttribute('data-deck-slot');
          card.removeAttribute('tabindex');
          if (!isSiteLink[index]) card.removeAttribute('aria-label');
          card.classList.remove('is-deck-pressed');
        } else {
          card.tabIndex = 0;
          card.dataset.deckSlot = slots[index];
          if (!isSiteLink[index])
            card.setAttribute(
              'aria-label',
              `${names[index]}${index === selected ? ', selected project' : ', select to bring forward'}`,
            );
        }
        card.querySelectorAll('a').forEach((link) => {
          if (!desktop.matches && index !== selected) link.setAttribute('tabindex', '-1');
          else if (linkTabs.get(link) === null) link.removeAttribute('tabindex');
          else link.setAttribute('tabindex', linkTabs.get(link));
        });
      });
    }
    function select(index, focus = false) {
      if (index !== selected) {
        [slots[selected], slots[index]] = [slots[index], slots[selected]];
        selected = index;
        paint();
      }
      if (focus) cards[selected].focus({ preventScroll: true });
    }

    cards.forEach((card, index) => {
      card.tabIndex = 0;
      if (!isSiteLink[index]) card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', 'project card');
      card.addEventListener(
        'click',
        (event) => {
          if (desktop.matches) return;
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          if (index !== selected) {
            // Native linked cards open from any point, including rear cards.
            // The hardware card still selects without navigating.
            if (!isSiteLink[index]) event.preventDefault();
            select(index);
          }
        },
        options,
      );
      card.addEventListener(
        'keydown',
        (event) => {
          if (desktop.matches || isSiteLink[index]) return;
          if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          select(index);
        },
        options,
      );
      card.addEventListener(
        'pointerdown',
        (event) => {
          if (event.button === 0 && (desktop.matches || event.pointerType !== 'mouse'))
            card.classList.add('is-deck-pressed');
        },
        { ...options, passive: true },
      );
    });
    shell.addEventListener(
      'keydown',
      (event) => {
        if (desktop.matches) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? cards.length - 1
              : (selected + (event.key === 'ArrowRight' ? 1 : -1) + cards.length) % cards.length;
        select(index, true);
      },
      options,
    );
    function release() {
      cards.forEach((card) => card.classList.remove('is-deck-pressed'));
    }
    document.addEventListener('pointerup', release, { ...options, passive: true });
    document.addEventListener('pointercancel', release, { ...options, passive: true });
    window.addEventListener('scroll', release, { ...options, passive: true });
    window.addEventListener('blur', release, options);
    paint();
    desktop.addEventListener('change', paint, options);
    restore.push(() => {
      grid.classList.remove('project-deck');
      grid.classList.remove('project-desktop');
      cards.forEach((card, index) => {
        card.removeAttribute('data-deck-slot');
        card.removeAttribute('tabindex');
        card.removeAttribute('role');
        card.removeAttribute('aria-roledescription');
        if (cardLabels[index] === null) card.removeAttribute('aria-label');
        else card.setAttribute('aria-label', cardLabels[index]);
        card.classList.remove('is-deck-pressed');
      });
      linkTabs.forEach((value, link) =>
        value === null ? link.removeAttribute('tabindex') : link.setAttribute('tabindex', value),
      );
    });
  });
  return () => {
    lifecycle.abort();
    restore.forEach((cleanup) => cleanup());
  };
}
