/* Переключатель темы. По умолчанию тёмная, выбор запоминается.
   Сама тема ставится ещё в <head>, чтобы страница не мигала при загрузке. */
(function () {
  'use strict';
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const meta = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    if (theme === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    if (meta) meta.content = theme === 'light' ? '#f4f4f2' : '#0c0c0e';
    if (btn) btn.setAttribute('aria-label', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
  }

  apply(root.dataset.theme === 'light' ? 'light' : 'dark');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    apply(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* без хранилища — только до перезагрузки */ }
  });
})();
