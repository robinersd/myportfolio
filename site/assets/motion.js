// A small damped-spring simulation. It runs only while something is moving.
export function enableRobinerMotion({ pageEntry = false } = {}) {
  const lifecycle = new AbortController();
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controllers = [];
  const activeControllers = new Set();
  let frameId = 0;
  let lastFrame = 0;

  function wake(controller) {
    activeControllers.add(controller);
    if (!frameId && !preference.matches && !document.hidden) {
      lastFrame = performance.now();
      frameId = requestAnimationFrame(update);
    }
  }
  function update(time) {
    const step = Math.min((time - lastFrame) / 1000, 0.025);
    lastFrame = time;
    activeControllers.forEach((controller) => {
      let moving = false;
      Object.values(controller.springs).forEach((spring) => {
        spring.velocity += ((spring.target - spring.value) * 230 - spring.velocity * 18) * step;
        spring.value += spring.velocity * step;
        if (Math.abs(spring.target - spring.value) > 0.001 || Math.abs(spring.velocity) > 0.001)
          moving = true;
        else {
          spring.value = spring.target;
          spring.velocity = 0;
        }
      });
      controller.paint();
      if (!moving) activeControllers.delete(controller);
    });
    frameId = activeControllers.size ? requestAnimationFrame(update) : 0;
  }

  // Skills and the project deck own their transforms in their own modules.
  // Standalone project cards retain the existing spring zoom.
  document.querySelectorAll('.project-card').forEach((element) => {
    if (element.closest('[data-project-deck]')) return;
    const spring = { value: 1, target: 1, velocity: 0 };
    const controller = {
      springs: { scale: spring },
      paint() {
        if (spring.value === 1) element.style.removeProperty('transform');
        else element.style.transform = `scale(${spring.value})`;
      },
    };
    controllers.push(controller);
    let hovered = false,
      focused = false;
    function reset() {
      const active = hovered || focused;
      spring.target = active && !preference.matches ? 1.035 : 1;
      element.classList.toggle('is-project-active', active);
      wake(controller);
    }
    const options = { signal: lifecycle.signal };
    element.addEventListener(
      'pointerenter',
      (event) => {
        if (event.pointerType !== 'mouse' || preference.matches) return;
        hovered = true;
        reset();
      },
      options,
    );
    element.addEventListener(
      'pointerleave',
      () => {
        hovered = false;
        reset();
      },
      options,
    );
    element.addEventListener(
      'pointerdown',
      (event) => {
        if (preference.matches || event.button !== 0) return;
        spring.target = 1.035;
        element.classList.add('is-project-active');
        wake(controller);
      },
      options,
    );
    function release(event) {
      reset();
      if (event.type === 'pointerup' && event.pointerType !== 'mouse' && !preference.matches) {
        spring.velocity += 0.55;
        wake(controller);
      }
    }
    element.addEventListener('pointerup', release, options);
    element.addEventListener('pointercancel', release, options);
    element.addEventListener(
      'focusin',
      () => {
        focused = true;
        reset();
      },
      options,
    );
    element.addEventListener(
      'focusout',
      (event) => {
        if (element.contains(event.relatedTarget)) return;
        focused = false;
        reset();
      },
      options,
    );
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.06 },
  );
  document.querySelectorAll('main > section, .project-card').forEach((element, index) => {
    if (element.matches('#skills') || element.closest('[data-project-deck]')) return;
    const bounds = element.getBoundingClientRect();
    // One page-entry animation is enough; do not stack slow reveals on it.
    if (pageEntry && bounds.top < innerHeight && bounds.bottom > 0) return;
    element.classList.add('robiner-reveal');
    element.style.setProperty('--reveal-delay', `${Math.min(index % 3, 2) * 55}ms`);
    observer.observe(element);
  });

  document.addEventListener(
    'visibilitychange',
    () => {
      document.documentElement.classList.toggle('motion-suspended', document.hidden);
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (activeControllers.size) {
        wake(activeControllers.values().next().value);
      }
    },
    { signal: lifecycle.signal },
  );
  preference.addEventListener(
    'change',
    () => {
      if (!preference.matches) return;
      cancelAnimationFrame(frameId);
      frameId = 0;
      activeControllers.clear();
      controllers.forEach(({ springs, paint }) => {
        Object.entries(springs).forEach(([name, spring]) => {
          spring.value = spring.target = name === 'scale' ? 1 : 0;
          spring.velocity = 0;
        });
        paint();
      });
    },
    { signal: lifecycle.signal },
  );
  return () => {
    lifecycle.abort();
    cancelAnimationFrame(frameId);
    activeControllers.clear();
    observer.disconnect();
  };
}
