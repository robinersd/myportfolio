// Run before styles to use dark by default without a light first-paint flash.
(() => {
  let theme = 'dark';
  try {
    if (localStorage.getItem('theme') === 'light') theme = 'light';
  } catch {
    // Dark remains available when the visitor blocks browser storage.
  }
  document.documentElement.dataset.theme = theme;
})();
