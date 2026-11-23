const contentsLinks = [...document.querySelectorAll('.contents a')];
function markCurrentSection() {
  const current = contentsLinks.find(link => link.hash === location.hash) ?? contentsLinks[0];
  for (const link of contentsLinks) {
    if (link === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', markCurrentSection);
markCurrentSection();

const photoDialog = document.querySelector('.photo-dialog');
if (typeof photoDialog?.showModal === 'function') {
  const photo = photoDialog.querySelector('img');
  const visual = photoDialog.querySelector('.photo-dialog-visual');
  const powerCaption = visual.querySelector('.power-caption');
  const caption = photoDialog.querySelector('#photo-caption');
  document.addEventListener('click', event => {
    const trigger = event.target.closest('a[data-zoom]');
    if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const description = trigger.querySelector('img').alt;
    const isPower = trigger.dataset.zoom === 'side';
    const isCover = trigger.dataset.zoom === 'cover';
    caption.textContent = description;
    photo.src = trigger.href;
    photo.alt = description;
    visual.toggleAttribute('data-power', isPower);
    visual.toggleAttribute('data-cover', isCover);
    powerCaption.hidden = !isPower;
    photoDialog.showModal();
  });
}

const soundPreviews = [...document.querySelectorAll('.sound-list audio, #demo-audio')];
for (const preview of soundPreviews) {
  preview.addEventListener('play', () => {
    for (const other of soundPreviews) {
      if (other !== preview && !other.paused) other.pause();
    }
  });
}
