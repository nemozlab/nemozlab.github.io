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

const soundPreviews = [...document.querySelectorAll('.sound-list audio, .led-table audio, #demo-audio')];
for (const preview of soundPreviews) {
  preview.addEventListener('play', () => {
    for (const other of soundPreviews) {
      if (other !== preview && !other.paused) other.pause();
    }
  });
}


const navLanguageButton = document.querySelector('#nav-language');
const playerNavigation = document.querySelector('.player-nav');
function setNavLanguage(language) {
  const chinese = language === 'zh';
  document.documentElement.dataset.navLang = language;
  navLanguageButton.textContent = chinese ? '한국어' : '中文';
  navLanguageButton.lang = chinese ? 'ko' : 'zh-Hans';
  playerNavigation.setAttribute('aria-label', chinese ? '播放器菜单' : '네모 플레이어 메뉴');
}
setNavLanguage(document.documentElement.dataset.navLang === 'zh' ? 'zh' : 'ko');
navLanguageButton.hidden = false;
navLanguageButton.addEventListener('click', () => {
  const language = document.documentElement.dataset.navLang === 'zh' ? 'ko' : 'zh';
  setNavLanguage(language);
  try { localStorage.setItem('nemo-lang', language); } catch {}
});
