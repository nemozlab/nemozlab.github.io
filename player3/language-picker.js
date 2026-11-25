function initPlayerLanguagePicker(initialLanguage, onChange) {
  const picker = document.querySelector('.language-picker');
  const trigger = picker.querySelector('summary');
  const code = picker.querySelector('.language-code');
  const options = picker.querySelectorAll('[data-language]');

  function select(language) {
    code.textContent = language === 'zh' ? 'ZH' : 'KO';
    for (const option of options) {
      option.setAttribute('aria-pressed', String(option.dataset.language === language));
    }
  }

  select(initialLanguage);
  for (const option of options) {
    option.addEventListener('click', () => {
      const language = option.dataset.language;
      onChange(language);
      select(language);
      picker.open = false;
      trigger.focus();
    });
  }
  document.addEventListener('click', event => {
    if (picker.open && !picker.contains(event.target)) picker.open = false;
  });
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker.open) return;
    picker.open = false;
    trigger.focus();
  });
}
