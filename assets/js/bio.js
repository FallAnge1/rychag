/* Общий движок: векторная математика, кинематика и помощники для SVG.
   Работает без сборки и без модулей, чтобы страница открывалась даже с диска. */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;
  const v = (x, y) => ({ x, y });
  const add = (a, b) => v(a.x + b.x, a.y + b.y);
  const sub = (a, b) => v(a.x - b.x, a.y - b.y);
  const mul = (a, k) => v(a.x * k, a.y * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const norm = (a) => { const l = len(a) || 1; return v(a.x / l, a.y / l); };
  const perp = (a) => v(-a.y, a.x); // поворот на 90° против часовой
  const fromAngle = (ang) => v(Math.cos(ang), Math.sin(ang));
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Точка o + Σ(вектор × коэффициент)
  function comb(o, ...pairs) {
    let p = o;
    for (const [dir, k] of pairs) p = add(p, mul(dir, k));
    return p;
  }

  // Два звена (например, бедро и голень): где окажется средний сустав.
  // side = +1 — сустав слева от линии root→target, -1 — справа.
  function ik2(root, target, l1, l2, side) {
    const d = sub(target, root);
    const D = clamp(len(d), Math.abs(l1 - l2) + 1e-6, l1 + l2 - 1e-6);
    const a = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
    const ang = Math.atan2(d.y, d.x) + side * a;
    return add(root, mul(fromAngle(ang), l1));
  }

  // Локоть по анатомии: при сгибании кисть уходит вперёд, к передней стороне тела.
  // up — куда смотрит голова вдоль корпуса, ant — куда смотрит грудь.
  function armIK(sh, hand, l1, l2, up, ant) {
    const sgn = Math.sign(cross(mul(up, -1), ant)) || 1;
    return ik2(sh, hand, l1, l2, -sgn);
  }

  // Угол в точке b между отрезками b→a и b→c (180° — прямая линия)
  function angleAt(a, b, c) {
    const u = norm(sub(a, b));
    const w = norm(sub(c, b));
    return Math.acos(clamp(dot(u, w), -1, 1));
  }

  // Основание перпендикуляра из точки p на прямую q + t·u (u — единичный)
  function project(p, q, u) {
    return add(q, mul(u, dot(sub(p, q), u)));
  }

  // Момент силы F (приложена в точке d) относительно сустава j между сегментами j→p и j→d.
  // Плюс — сила раскрывает сустав (держат сгибатели), минус — закрывает (держат разгибатели).
  function openingMoment(j, p, d, F) {
    const tq = cross(sub(d, j), F);
    return -tq * Math.sign(cross(sub(d, j), sub(p, j)));
  }

  // Перевод метров модели в пиксели сцены (ось Y в SVG смотрит вниз)
  function makeView(ox, oy, scale) {
    return {
      scale,
      x: (p) => ox + p.x * scale,
      y: (p) => oy - p.y * scale,
      pt: (p) => (ox + p.x * scale).toFixed(1) + ',' + (oy - p.y * scale).toFixed(1),
      px: (m) => m * scale,
      toWorld: (sx, sy) => v((sx - ox) / scale, (oy - sy) / scale),
    };
  }

  // Координаты указателя в системе viewBox
  function svgPoint(svg, clientX, clientY) {
    const m = svg.getScreenCTM();
    if (!m) return v(0, 0);
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return v(p.x, p.y);
  }

  const reducedMotion = () =>
    global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  global.Bio = {
    DEG, v, add, sub, mul, dot, cross, len, norm, perp, fromAngle, clamp, lerp, comb,
    ik2, armIK, angleAt, project, openingMoment, makeView, svgPoint, reducedMotion,
  };
})(window);
