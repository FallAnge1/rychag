/* Общая страница упражнения: сцена + панель с мышцами, подсказками и настройками.
   Какое упражнение — берётся из <body data-exercise="...">. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ex = window.EXERCISES[document.body.dataset.exercise];
  const { page } = ex;
  const svg = $('scene');

  const penList = $('penNotes');
  const api = window.Scene.mount(svg, ex.model, { interactive: true, notesList: penList });

  // ── Пометки на картинке: показать / скрыть ─────────────────────
  const toggle = $('notesToggle');
  const store = {
    get() { try { return localStorage.getItem('notes-off') === '1'; } catch (e) { return false; } },
    set(off) { try { localStorage.setItem('notes-off', off ? '1' : '0'); } catch (e) { /* без хранилища */ } },
  };
  function setNotes(off) {
    svg.classList.toggle('notes-off', off);
    penList.classList.toggle('is-off', off);
    toggle.setAttribute('aria-pressed', String(!off));
    toggle.querySelector('span').textContent = off ? 'Показать подсказки' : 'Скрыть подсказки';
  }
  setNotes(store.get());
  toggle.addEventListener('click', () => {
    const off = !svg.classList.contains('notes-off');
    setNotes(off);
    store.set(off);
  });

  // ── Ползунок ────────────────────────────────────────────────────
  const sl = page.slider;
  const slider = $('ctl');
  $('ctlLabel').textContent = sl.label;
  $('ctlLeft').textContent = sl.left;
  $('ctlRight').textContent = sl.right;
  $('ctlLeft').className = 'c-' + sl.lc;
  $('ctlRight').className = 'c-' + sl.rc;
  slider.style.setProperty('--l', `var(--${sl.lc})`);
  slider.style.setProperty('--r', `var(--${sl.rc})`);
  slider.setAttribute('aria-label', `${sl.label}: от «${sl.left}» до «${sl.right}»`);
  let sliding = false;
  slider.addEventListener('input', () => { sliding = true; api.set(sl.set(+slider.value)); });
  slider.addEventListener('change', () => { sliding = false; });

  // ── Повторения ──────────────────────────────────────────────────
  const playBtn = $('play');
  playBtn.addEventListener('click', () => {
    api.playing ? api.pause() : api.play();
    playBtn.setAttribute('aria-pressed', String(api.playing));
  });

  // ── Готовые настройки ───────────────────────────────────────────
  const presets = $('presets');
  for (const p of page.presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (p.c ? ' c-' + p.c : '');
    b.textContent = p.label;
    b.addEventListener('click', () => api.set({ ...p.state }));
    presets.appendChild(b);
  }

  // ── Панель ─────────────────────────────────────────────────────
  const shares = $('shares');
  const bar = $('bar');
  shares.style.setProperty('--n', page.muscles.length);
  shares.classList.add('n' + page.muscles.length);
  const cells = page.muscles.map((m) => {
    const d = document.createElement('div');
    d.className = 'share';
    d.style.setProperty('--c', `var(--${m.c})`);
    d.innerHTML = `<span>${m.name}</span><b>—</b><small>—</small>`;
    shares.appendChild(d);
    const seg = document.createElement('i');
    seg.style.background = `var(--${m.c})`;
    bar.appendChild(seg);
    return { m, pct: d.querySelector('b'), nm: d.querySelector('small'), seg };
  });

  const nums = $('nums');
  const notesList = $('notes');
  const notesMore = $('notesMore');
  const warn = $('warn');
  const setHTML = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html; };

  api.onChange((r) => {
    const out = page.read(r);
    const vals = cells.map((c) => Math.max(out.loads[c.m.key] || 0, 0));
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    cells.forEach((c, i) => {
      const share = vals[i] / sum;
      c.pct.textContent = Math.round(share * 100) + '%';
      c.nm.textContent = Math.round(vals[i]) + ' Н·м';
      c.seg.style.width = share * 100 + '%';
      c.seg.style.display = share < 0.005 ? 'none' : '';
    });
    setHTML(nums, out.nums.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''));
    const li = ([tone, html]) => `<li class="note" data-tone="${tone}"><p>${html}</p></li>`;
    setHTML(notesList, out.notes.slice(0, 1).map(li).join(''));
    setHTML(notesMore, out.notes.slice(1).map(li).join(''));
    setHTML(warn, out.warnings.map((w) => `<p>${w}</p>`).join(''));
    warn.hidden = out.warnings.length === 0;
    if (!sliding) slider.value = sl.get(r).toFixed(1);
    if (!api.playing) playBtn.setAttribute('aria-pressed', 'false');
  });
})();
