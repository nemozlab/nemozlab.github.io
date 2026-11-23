const photoDialog = document.querySelector('.photo-dialog');
if (typeof photoDialog?.showModal === 'function') {
  const photo = photoDialog.querySelector('img');
  const visual = photoDialog.querySelector('.photo-dialog-visual');
  const powerIndicator = visual.querySelector('.power-indicator');
  const coverOutline = visual.querySelector('.cover-outline');
  const caption = photoDialog.querySelector('#photo-caption');
  document.addEventListener('click', event => {
    const trigger = event.target.closest('a[data-zoom]');
    if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const description = trigger.querySelector('img').alt;
    const isPower = trigger.dataset.zoom === 'power';
    const isCover = trigger.dataset.zoom === 'cover';
    caption.textContent = description;
    photo.src = trigger.href;
    photo.alt = description;
    visual.toggleAttribute('data-power', isPower);
    visual.toggleAttribute('data-cover', isCover);
    powerIndicator.hidden = !isPower;
    coverOutline.hidden = !isCover;
    photoDialog.showModal();
  });
}

const soundPreviews = [...document.querySelectorAll('.sound-list audio')];
for (const preview of soundPreviews) {
  preview.addEventListener('play', () => {
    for (const other of soundPreviews) {
      if (other !== preview && !other.paused) other.pause();
    }
  });
}
