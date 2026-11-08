/* Общий каркас интерактивной сцены.
   Упражнение описывает модель (состояние, расчёт, рисунок, ручки, пометки),
   а этот файл берёт на себя SVG, перетаскивание, повторения и подписи «ручкой». */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, norm, perp, len, clamp, project, svgPoint, reducedMotion } = global.Bio;
  const NS = 'http://www.w3.org/2000/svg';
  const f1 = (n) => n.toFixed(1);

  // ── Рисование в координатах модели (метры) ─────────────────────
  function drawer(V, opt = {}) {
    const X = (p) => f1(V.x(p));
    const Y = (p) => f1(V.y(p));
    const P = V.pt;
    const px = V.px;
    const D = { V, P, px, X, Y };

    D.ln = (a, b, cls, w) =>
      `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" class="${cls}"${w ? ` stroke-width="${f1(w)}"` : ''}/>`;
    D.circ = (c, r, cls, style = '', extra = '') =>
      `<circle cx="${X(c)}" cy="${Y(c)}" r="${f1(r)}" class="${cls}"${style ? ` style="${style}"` : ''} ${extra}/>`;
    D.poly = (pts, cls, extra = '') => `<polygon points="${pts.map(P).join(' ')}" class="${cls}" ${extra}/>`;
    D.pline = (pts, cls, extra = '') => `<polyline points="${pts.map(P).join(' ')}" class="${cls}" ${extra}/>`;
    D.text = (p, s, cls, dx = 0, dy = 0, anchor = 'middle') =>
      `<text x="${f1(V.x(p) + dx)}" y="${f1(V.y(p) + dy)}" class="${cls}" text-anchor="${anchor}">${s}</text>`;
    D.ellipse = (c, rx, ry, dir, cls, style = '', extra = '') => {
      const ang = dir ? -Math.atan2(dir.y, dir.x) / DEG : 0;
      return `<ellipse cx="${X(c)}" cy="${Y(c)}" rx="${f1(px(rx))}" ry="${f1(px(ry))}" transform="rotate(${f1(ang)} ${X(c)} ${Y(c)})" class="${cls}"${style ? ` style="${style}"` : ''} ${extra}/>`;
    };

    D.arrow = (from, to, cls, w) => {
      const d = norm(sub(to, from));
      const head = (10 + w * 1.6) / V.scale;
      const base = sub(to, mul(d, head));
      const side = mul(perp(d), head * 0.55);
      return `<g class="${cls}">${D.ln(from, add(base, mul(d, head * 0.3)), 'arrow-line', w)}` +
        D.poly([to, add(base, side), sub(base, side)], 'arrow-head') + '</g>';
    };

    // ── Силуэт ────────────────────────────────────────────────────
    // Замкнутая плавная кривая через точки экрана (Catmull-Rom → кубические Безье)
    const smooth = (pts) => {
      const n = pts.length;
      let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
          `${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
      }
      return d + 'Z';
    };
    const toScr = (p) => [V.x(p), V.y(p)];
    const at = (arr, t) => {
      const x = t * (arr.length - 1);
      const i = Math.min(Math.floor(x), arr.length - 2);
      const f = x - i;
      return arr[i] * (1 - f) + arr[i + 1] * f;
    };

    // Полуширины частей тела (м) от начала к концу: f — передняя сторона, b — задняя
    const PROF = {
      thigh: { f: [0.084, 0.094, 0.088, 0.072, 0.056], b: [0.1, 0.094, 0.08, 0.066, 0.056] },
      shank: { f: [0.054, 0.048, 0.04, 0.033, 0.029], b: [0.056, 0.074, 0.062, 0.04, 0.029] },
      upperArm: { f: [0.05, 0.056, 0.05, 0.042, 0.036], b: [0.052, 0.05, 0.046, 0.04, 0.036] },
      foreArm: { f: [0.04, 0.044, 0.036, 0.029, 0.025], b: [0.038, 0.041, 0.034, 0.028, 0.025] },
      torso: { f: [0.1, 0.096, 0.1, 0.122, 0.1], b: [0.13, 0.104, 0.108, 0.124, 0.106] },
      neck: { f: [0.046, 0.042, 0.046], b: [0.046, 0.042, 0.046] },
    };

    // Сторона отрезка a→b, смотрящая от точки p (и к ней)
    D.away = (a, b, p) => { const n = perp(norm(sub(b, a))); return dot(n, sub(p, a)) > 0 ? mul(n, -1) : n; };
    D.toward = (a, b, p) => mul(D.away(a, b, p), -1);

    // Часть тела от a к b; front — куда смотрит передняя сторона
    D.limb = (a, b, front, pf, pb) => {
      const L = len(sub(b, a));
      const d = norm(sub(b, a));
      let n = perp(d);
      if (dot(n, front) < 0) n = mul(n, -1);
      const pts = [];
      const N = 8;
      for (let i = 0; i <= N; i++) pts.push(add(add(a, mul(d, (i / N) * L)), mul(n, at(pf, i / N))));
      const fb = pf[pf.length - 1], bb = pb[pb.length - 1];
      const rb = (fb + bb) / 2, cb = add(b, mul(n, (fb - bb) / 2));
      for (let j = 1; j < 5; j++) { const t = (j / 5) * Math.PI; pts.push(add(cb, add(mul(n, Math.cos(t) * rb), mul(d, Math.sin(t) * rb)))); }
      for (let i = N; i >= 0; i--) pts.push(add(add(a, mul(d, (i / N) * L)), mul(n, -at(pb, i / N))));
      const ra = (pf[0] + pb[0]) / 2, ca = add(a, mul(n, (pf[0] - pb[0]) / 2));
      for (let j = 1; j < 5; j++) { const t = (j / 5) * Math.PI; pts.push(add(ca, add(mul(n, -Math.cos(t) * ra), mul(d, -Math.sin(t) * ra)))); }
      return smooth(pts.map(toScr));
    };
    D.part = (name, a, b, front, k = 1) => D.limb(a, b, front, PROF[name].f.map((x) => x * k), PROF[name].b.map((x) => x * k));
    D.blob = (pts) => smooth(pts.map(toScr));
    // Голова: овал вдоль оси up, лицо в сторону front
    D.head = (c, up, front, r = 0.1) => {
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2;
        const cs = Math.cos(t), sn = Math.sin(t);
        const jaw = cs > 0 && sn < 0 ? 0.012 * cs : 0;
        pts.push(add(c, add(mul(up, sn * r * 1.14), mul(front, cs * r * 0.95 + jaw))));
      }
      return smooth(pts.map(toScr));
    };
    // Стопа на полу, носок в сторону +x (dir = -1 — в сторону −x)
    D.footFlat = (A, floorY, dir = 1) => D.blob([
      [-0.07, floorY - A.y + 0.004], [0.14, floorY - A.y], [0.215, floorY - A.y + 0.014], [0.18, floorY - A.y + 0.042],
      [0.065, 0.0], [0.03, 0.05], [-0.045, 0.045], [-0.088, floorY - A.y + 0.035],
    ].map(([x, y]) => v(A.x + dir * x, A.y + y)));
    // Дальняя нога: тот же силуэт, чуть позади и темнее — чтобы было видно, что ног две
    D.farLeg = (H, K, A, foot, off = v(-0.045, 0)) => {
      const f = (p) => add(p, off);
      return D.figure([[D.part('thigh', f(H), f(K), D.away(H, K, A)), D.part('shank', f(K), f(A), D.away(K, A, H)), foot(f(A))]], 'far');
    };
    D.disc = (c, r) => D.head(c, v(0, 1), v(1, 0), r / 1.1);
    // Слои: внутри слоя всё сливается в один силуэт, между слоями — тонкий зазор
    // Порядок внутри слоя: зазор от предыдущего слоя → общий контур → заливка
    D.figure = (layers, cls = '') => `<g class="fig ${cls}">` + layers.map((parts) =>
      parts.map((d) => `<path d="${d}" class="b-sep"/>`).join('') +
      parts.map((d) => `<path d="${d}" class="b-rim"/>`).join('') +
      parts.map((d) => `<path d="${d}" class="b-sil"/>`).join('')).join('') + '</g>';

    // ── Мышцы ─────────────────────────────────────────────────────
    // Линза вдоль отрезка a→b, выпуклая в сторону n
    D.lens = (a, b, n, bulge, t0 = 0.12, t1 = 0.1, inset = 0.02) => {
      const d = norm(sub(b, a));
      const L = len(sub(b, a));
      const p1 = add(add(a, mul(d, L * t0)), mul(n, inset));
      const p2 = add(sub(b, mul(d, L * t1)), mul(n, inset));
      const m = mul(add(p1, p2), 0.5);
      // веретено: наружу выпуклость bulge, внутрь — поменьше, мышца выглядит объёмной
      return `M${P(p1)} Q${P(add(m, mul(n, bulge)))} ${P(p2)} Q${P(add(m, mul(n, inset - bulge * 0.4)))} ${P(p1)}Z`;
    };
    // Напряжение i (0…1): мышца немного растёт и светится — но не забивает силуэт.
    // В превью на главной без фильтров: так легче для телефона.
    const grow = (i) => 0.86 + 0.3 * i;
    const muscleLayers = (shape, big, cls, i, uid) => {
      // заливка — градиент: светлая середина, насыщенные края
      const key = (cls.match(/m\d/) || ['m1'])[0];
      const core = shape(`${cls} mu-core`, `opacity:${(0.3 + 0.7 * i).toFixed(3)};fill:url(#mg-${key}-${uid})`, '');
      if (opt.mini || i < 0.04) return core;
      // ореол чуть больше мышцы: от её цвета к соседнему оттенку и в прозрачность
      return big(`mu-halo`, `opacity:${(0.95 * Math.pow(i, 1.05)).toFixed(3)};fill:url(#mh-${key}-${uid})`, `filter="url(#glow-${uid})"`) + core;
    };
    D.muscleLens = (a, b, n, bulge, t0, t1, inset, cls, i, uid) => {
      const k = grow(i);
      const path = (d) => (c, style, extra) => `<path d="${d}" class="${c}" style="${style}" ${extra}/>`;
      return muscleLayers(
        path(D.lens(a, b, n, bulge * k, t0, t1, inset)),
        path(D.lens(a, b, n, bulge * k * 1.7, Math.max(t0 - 0.06, 0), Math.max(t1 - 0.06, 0), inset - bulge * k * 0.25)),
        cls, i, uid);
    };
    D.muscleEll = (c, rx, ry, dir, cls, i, uid) => {
      const k = grow(i);
      return muscleLayers(
        (cl, style, extra) => D.ellipse(c, rx * k, ry * k, dir, cl, style, extra),
        (cl, style, extra) => D.ellipse(c, rx * k * 1.45, ry * k * 1.45, dir, cl, style, extra),
        cls, i, uid);
    };

    // Плечо рычага: перпендикуляр от сустава J до линии силы (точка C, направление u)
    D.lever = (J, C, u, arm, cls, opts = {}) => {
      const foot = project(J, C, u);
      const L = len(sub(J, foot));
      if (L < 0.008) return '';
      const toJ = norm(sub(J, foot));
      let along = sub(C, foot);
      along = len(along) > 0.03 ? norm(along) : u;
      const s = opts.mark ?? 0.026;
      const a = add(foot, mul(toJ, s));
      const ra = `<polyline points="${P(a)} ${P(add(a, mul(along, s)))} ${P(add(foot, mul(along, s)))}" class="ra"/>`;
      const mid = mul(add(J, foot), 0.5);
      const off = add(mid, mul(along, opts.labelOff ?? 0.045));
      const cm = Math.round(Math.abs(arm) * 100);
      return D.ln(J, foot, 'lever ' + cls + (arm < 0 ? ' neg' : '')) + ra +
        `<text x="${X(off)}" y="${f1(V.y(off) + 5)}" class="lever-lbl ${cls}" text-anchor="middle">${cm} см</text>`;
    };

    // График нагрузки по амплитуде (координаты сцены). c: 'm1' | 'm2' | 'm3'
    D.chart = ({ x, y, w, h, title, left, right, curve, tMin, tMax, max, cur, c = 'm1' }) => {
      const gx = (t) => x + 30 + ((t - tMin) / (tMax - tMin)) * (w - 44);
      const gy = (m) => y + h - 30 - (Math.max(m, 0) / max) * (h - 56);
      const pts = curve.map(([t, m]) => `${f1(gx(t))},${f1(gy(m))}`).join(' ');
      return `<line x1="${x + 30}" y1="${y + h - 30}" x2="${x + w - 10}" y2="${y + h - 30}" class="chart-axis"/>` +
        `<line x1="${x + 30}" y1="${y + 22}" x2="${x + 30}" y2="${y + h - 30}" class="chart-axis"/>` +
        `<text x="${x + 30}" y="${y + 14}" class="chart-lbl">${title}</text>` +
        `<text x="${x + 30}" y="${y + h - 10}" class="chart-lbl">${left}</text>` +
        `<text x="${x + w - 10}" y="${y + h - 10}" class="chart-lbl" text-anchor="end">${right}</text>` +
        `<polyline points="${pts}" class="chart-curve ${c}"/>` +
        `<circle cx="${f1(gx(cur[0]))}" cy="${f1(gy(cur[1]))}" r="8" class="chart-dot ${c}"/>`;
    };

    // Вертикальная линия силы тяжести через точку (для свободных весов)
    D.vline = (p, up = 0.5, down = 0.6) => D.ln(add(p, v(0, up)), add(p, v(0, -down)), 'fline');

    D.joints = (pts, r = 7) => pts.map((p) => D.circ(p, r, 'joint')).join('');
    D.bones = (pairs) => pairs.map(([a, b]) => D.ln(a, b, 'bone')).join('');
    return D;
  }

  // ── Пометки «ручкой» ────────────────────────────────────────────
  // n: { lines:[...], x, y (экран), anchor, to (точка модели) | toXY [x,y],
  //      from [x,y] (откуда стрелка), gap, bend, circle (радиус обводки) }
  function notes(list, V, ns = 1) {
    let out = '';
    for (const n of list) {
      if (!n) continue;
      const lh = (n.lh || 25) * ns;
      const anchor = n.anchor || 'start';
      n.lines.forEach((t, i) => {
        out += `<text x="${f1(n.x)}" y="${f1(n.y + i * lh)}" class="note-txt" text-anchor="${anchor}">${t}</text>`;
      });
      if (!n.from && !n.circle) continue;
      const tgt = n.toXY || [V.x(n.to), V.y(n.to)];
      if (n.circle) out += scribble(tgt, n.circle);
      if (!n.from) continue;
      const [sx, sy] = n.from;
      const dx = tgt[0] - sx, dy = tgt[1] - sy;
      const L = Math.hypot(dx, dy);
      const gap = n.gap ?? (n.circle ? n.circle + 6 : 10);
      if (L < gap + 14) continue;
      const ex = tgt[0] - (dx / L) * gap, ey = tgt[1] - (dy / L) * gap;
      const bend = n.bend ?? 0.25;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const cx = mx + (-dy / L) * bend * L * 0.4;
      const cy = my + (dx / L) * bend * L * 0.4;
      out += `<path d="M${f1(sx)} ${f1(sy)} Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}" class="note-ln"/>`;
      const tx = ex - cx, ty = ey - cy, tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl, uy = ty / tl;
      const head = (a) => {
        const c = Math.cos(a), s = Math.sin(a);
        const hx = ux * c - uy * s, hy = ux * s + uy * c;
        return `${f1(ex - hx * 15)} ${f1(ey - hy * 15)}`;
      };
      out += `<path d="M${head(0.45)} L${f1(ex)} ${f1(ey)} L${head(-0.38)}" class="note-ln"/>`;
    }
    return out;
  }

  // Узкий экран: на картинке только номера, подписи — списком под ней
  function badges(list, V, box = [0, 0, 1000, 724]) {
    let out = '';
    const items = [];
    let k = 0;
    for (const n of list) {
      if (!n) continue;
      k++;
      items.push(n.lines.join(' '));
      let pos;
      if (n.from) {
        const tgt = n.toXY || [V.x(n.to), V.y(n.to)];
        let dx = n.from[0] - tgt[0], dy = n.from[1] - tgt[1];
        const L = Math.hypot(dx, dy) || 1;
        const off = (n.circle ? n.circle + 34 : 40);
        pos = [tgt[0] + (dx / L) * off, tgt[1] + (dy / L) * off];
      } else {
        pos = [n.x + 30, n.y - 8];
      }
      pos[0] = Math.max(box[0] + 34, Math.min(box[0] + box[2] - 34, pos[0]));
      pos[1] = Math.max(box[1] + 34, Math.min(box[1] + box[3] - 34, pos[1]));
      out += scribble(pos, 30) +
        `<text x="${f1(pos[0])}" y="${f1(pos[1] + 15)}" class="note-num" text-anchor="middle">${k}</text>`;
    }
    return { svg: out, items };
  }

  function scribble([cx, cy], r) {
    const pts = [];
    const n = 34;
    for (let i = 0; i <= n; i++) {
      const t = -0.9 + (i / n) * Math.PI * 2 * 1.1;
      const rr = r * (1 + 0.06 * Math.sin(3 * t + 1) + 0.04 * (i / n));
      pts.push(`${f1(cx + Math.cos(t) * rr * 1.12)} ${f1(cy + Math.sin(t) * rr * 0.92)}`);
    }
    return `<path d="M${pts.join(' L')}" class="note-ln"/>`;
  }

  // ── Ручки ───────────────────────────────────────────────────────
  const GLYPH = '<path d="M-10 0H10M-10 0l5-5M-10 0l5 5M10 0l-5-5M10 0l-5 5" class="ctl-glyph"/>';
  function makeHandle(h) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ctl');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'slider');
    g.setAttribute('aria-label', h.label);
    g.dataset.key = h.key;
    g.innerHTML = '<circle r="36" class="ctl-hit"/><circle r="27" class="ctl-pulse"/><circle r="21" class="ctl-ring"/>' + GLYPH;
    return g;
  }

  // ── Сцена ───────────────────────────────────────────────────────
  let uidSeq = 0;

  function mount(svg, model, opts = {}) {
    const interactive = opts.interactive !== false && !opts.mini;
    const mini = !!opts.mini;
    const uid = ++uidSeq;
    const V = model.view;
    const D = drawer(V, { mini });
    const ctx = { D, V, uid, mini };

    let vb = mini ? (model.miniViewBox || model.viewBox) : model.viewBox;
    svg.setAttribute('viewBox', vb);
    svg.classList.add('lp-scene');
    svg.innerHTML =
      `<defs><filter id="glow-${uid}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>` +
      ['m1', 'm2', 'm3'].map((m) => `<radialGradient id="mg-${m}-${uid}" cx="50%" cy="45%" r="62%">` +
        `<stop offset="0" class="gs-hi ${m}"/><stop offset="0.55" class="gs ${m}"/><stop offset="1" class="gs-lo ${m}"/></radialGradient>` +
        `<radialGradient id="mh-${m}-${uid}" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0" class="gs ${m}"/><stop offset="0.55" class="gh ${m}" stop-opacity="0.7"/><stop offset="1" class="gh ${m}" stop-opacity="0"/></radialGradient>`).join('') +
      '</defs>' +
      `<g class="layer-static">${model.drawStatic ? model.drawStatic(ctx) : ''}</g>` +
      '<g class="layer-dyn"></g><g class="layer-notes" aria-hidden="true"></g><g class="layer-ctl"></g>';
    const dyn = svg.querySelector('.layer-dyn');
    const notesLayer = svg.querySelector('.layer-notes');
    const ctlLayer = svg.querySelector('.layer-ctl');

    const state = model.initial();
    const listeners = [];
    let playing = false, phase = 0, last = 0, rafId = 0, visible = true, hk = 1, ns = 1, narrow = false;
    let listHTML = '';
    const list = opts.notesList || null;
    let lastR = null, lastW = 0;

    const fix = () => model.clamp(state);

    if (interactive && 'ResizeObserver' in global) {
      // смену кадра откладываем на следующий кадр, чтобы не зациклить ResizeObserver
      new ResizeObserver(() => requestAnimationFrame(() => {
        const w = svg.clientWidth || 1000;
        const next = clamp(560 / w, 1, 2);
        const nextNs = clamp(620 / w, 1, 1.4);
        const nextNarrow = !!list && w < 560;
        if (Math.abs(next - hk) > 0.02 || Math.abs(nextNs - ns) > 0.02 || nextNarrow !== narrow || (narrow && Math.abs(w - lastW) > 2)) {
          hk = next; ns = nextNs; narrow = nextNarrow; ctx.narrow = narrow; lastW = w;
          // на телефоне кадр ближе к человеку
          vb = narrow && model.mobileViewBox ? model.mobileViewBox : model.viewBox;
          if (narrow) {
            // сверху — полоса под кнопку «Подсказки», чтобы она не закрывала ручки и рисунок
            const [x, y, vw, vh] = vb.split(/\s+/).map(Number);
            const pad = 56 * (vw / w);
            vb = `${x} ${Math.round(y - pad)} ${vw} ${Math.round(vh + pad)}`;
          }
          if (svg.getAttribute('viewBox') !== vb) svg.setAttribute('viewBox', vb);
          svg.style.setProperty('--ns', ns.toFixed(2));
          schedule();
        }
      })).observe(svg);
    }

    const handles = interactive ? (model.handles || []).map((h) => ({ def: h, el: makeHandle(h) })) : [];
    handles.forEach((h) => ctlLayer.appendChild(h.el));

    function draw() {
      const r = model.solve(state);
      lastR = r;
      dyn.innerHTML = model.draw(r, ctx);
      if (!mini && model.notes) {
        const nl = model.notes(r, ctx);
        if (narrow) {
          const bd = badges(nl, V, vb.split(/\s+/).map(Number));
          notesLayer.innerHTML = bd.svg;
          const html = bd.items.map((t) => `<li>${t}</li>`).join('');
          if (html !== listHTML) { list.innerHTML = html; listHTML = html; }
        } else {
          notesLayer.innerHTML = notes(nl, V, ns);
          if (listHTML) { list.innerHTML = ''; listHTML = ''; }
        }
        if (list) list.hidden = !narrow;
      }
      for (const { def, el } of handles) {
        const p = def.pos(r);
        const ax = def.axis(r);
        const ang = -Math.atan2(ax.y, ax.x) / DEG;
        el.setAttribute('transform', `translate(${f1(V.x(p))} ${f1(V.y(p))}) scale(${hk.toFixed(2)})`);
        el.querySelector('.ctl-glyph').setAttribute('transform', `rotate(${f1(ang)})`);
        const val = def.value(r);
        el.setAttribute('aria-valuetext', val.text);
        el.setAttribute('aria-valuenow', String(Math.round(val.now)));
        el.setAttribute('aria-valuemin', String(val.min ?? 0));
        el.setAttribute('aria-valuemax', String(val.max ?? 100));
      }
      listeners.forEach((cb) => cb(r));
    }

    function tick(t) {
      rafId = 0;
      // превью на главной — примерно 30 кадров в секунду, этого хватает глазу и экономит батарею
      if (mini && playing && last && t - last < 30) { rafId = requestAnimationFrame(tick); return; }
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      if (playing) {
        phase += dt * (Math.PI * 2) / (model.period || 3.2);
        model.animate(state, phase, ctx);
        fix();
      }
      draw();
      if (playing && visible) rafId = requestAnimationFrame(tick);
      else last = 0;
    }
    function schedule() { if (!rafId) rafId = requestAnimationFrame(tick); }

    function play() {
      if (playing) return;
      phase = model.phaseOf ? model.phaseOf(state) : 0;
      playing = true;
      schedule();
    }
    function pause() { playing = false; schedule(); }

    if (interactive) {
      const worldAt = (ev) => { const p = svgPoint(svg, ev.clientX, ev.clientY); return V.toWorld(p.x, p.y); };
      const touched = () => { svg.classList.add('touched'); (opts.onInteract || (() => {}))(); };
      for (const { def, el } of handles) {
        let active = false;
        el.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          active = true;
          if (def.pausesPlay) pause();
          el.setPointerCapture(ev.pointerId);
          el.classList.add('dragging');
          svg.classList.add('is-dragging');
          touched();
        });
        el.addEventListener('pointermove', (ev) => {
          if (!active) return;
          def.drag(state, worldAt(ev), lastR || model.solve(state));
          fix();
          schedule();
        });
        const end = () => { active = false; el.classList.remove('dragging'); svg.classList.remove('is-dragging'); };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('keydown', (ev) => {
          const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
          if (!dir) return;
          ev.preventDefault();
          if (def.pausesPlay) pause();
          def.step(state, dir, ev.shiftKey ? 4 : 1);
          fix();
          schedule();
          touched();
        });
      }
    }

    if (mini && 'IntersectionObserver' in global) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible && playing) schedule();
      }).observe(svg);
    }

    fix();
    draw();
    if (opts.autoplay && !reducedMotion()) play();

    return {
      get state() { return { ...state }; },
      set(partial) { Object.assign(state, partial); fix(); schedule(); },
      play, pause,
      get playing() { return playing; },
      onChange(cb) { listeners.push(cb); schedule(); },
      svg,
    };
  }

  global.Scene = { mount, drawer, notes };
  global.EXERCISES = global.EXERCISES || {};
})(window);
