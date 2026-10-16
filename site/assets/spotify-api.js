// Start Spotify's network setup before the main UI modules and images finish.
(() => {
  if (window.robinerSpotifyApiReady) return;
  const script = document.createElement('script');
  script.src = 'https://open.spotify.com/embed/iframe-api/v1';
  script.async = true;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(), 12000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Spotify controls could not load'));
    }
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      resolve(api);
    };
    script.addEventListener('error', fail, { once: true });
  });
  window.robinerSpotifyApiReady = ready;
  // A slow/blocked third-party request must not produce an unhandled rejection
  // before the UI has had a chance to attach its normal embed fallback.
  ready.catch(() => {
    if (window.robinerSpotifyApiReady === ready) window.robinerSpotifyApiReady = undefined;
  });
  document.head.append(script);
})();
