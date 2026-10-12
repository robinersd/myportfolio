export function renderCertificateDialog() {
  return `<dialog id="certificate-viewer" aria-label="Certificate viewer">
    <div class="certificate-visual">
      <button type="button" class="certificate-close" aria-label="Close certificate">×</button>
      <img class="certificate-full" alt="" decoding="async" />
    </div>
  </dialog>`;
}

export function enableCertificateViewer(certificate) {
  const viewer = document.querySelector('#certificate-viewer');
  if (!viewer) return;
  const image = viewer.querySelector('.certificate-full');
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-certificate-open]');
    if (!trigger) return;
    event.preventDefault();
    image.src = certificate.image;
    image.alt = `${certificate.title}, ${certificate.issuer}`;
    if (!viewer.open) {
      viewer.showModal();
      document.documentElement.classList.add('certificate-viewer-open');
    }
  });
  viewer.querySelector('.certificate-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('close', () => {
    document.documentElement.classList.remove('certificate-viewer-open');
  });
  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) viewer.close();
  });
}
