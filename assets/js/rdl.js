/* Румынская тяга: вид сбоку, человек смотрит вправо (+x).
   Ты задаёшь наклон корпуса и насколько штанга прижата к ногам.
   Таз уходит назад, чтобы общий центр масс остался над серединой стопы. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, clamp, lerp, comb, ik2, makeView } = global.Bio;

  const L = { shank: 0.43, thigh: 0.45, torso: 0.52, upperArm: 0.3, foreArm: 0.27 };
  const G = 9.81;
  const M = { bar: 80, upper: 45, thighs: 20 };
  const XM = 0.05, FLOOR = -0.08;
  const BETA = 9 * DEG;                       // колени чуть согнуты
  const TAU_MIN = 5 * DEG, TAU_MAX = 80 * DEG;
  const A = v(0, 0);
  const K = v(Math.sin(BETA) * L.shank, Math.cos(BETA) * L.shank);
  const REACH = L.upperArm + L.foreArm - 0.005;
  const REF = 0.3 * (M.bar + M.upper) * G;

  const VIEW = makeView(470, 600, 380);

  // Передняя поверхность ног на высоте y (штанга не может пройти сквозь ноги)
  function legFront(H, y) {
    if (y >= K.y) {
      const t = clamp((y - K.y) / Math.max(H.y - K.y, 1e-3), 0, 1);
      return K.x + (H.x - K.x) * t + 0.085;
    }
    const t = clamp((y - A.y) / (K.y - A.y), 0, 1);
    return A.x + (K.x - A.x) * t + 0.05;
  }

  function pose(tau, g, psi) {
    const H = add(K, mul(v(-Math.sin(psi), Math.cos(psi)), L.thigh));
    const td = v(Math.sin(tau), Math.cos(tau));
    const back = perp(td);
    const front = mul(back, -1);
    const S = add(H, mul(td, L.torso));
    const Sh = comb(H, [td, 0.47], [front, 0.01]);
    let y = Sh.y - REACH, x = Sh.x, xl = 0;
    for (let i = 0; i < 5; i++) {
      xl = legFront(H, y) + 0.035;
      x = Math.max(lerp(Sh.x, xl, g), xl);
      const dx = clamp(x - Sh.x, -REACH * 0.97, REACH * 0.97);
      x = Sh.x + dx;
      y = Sh.y - Math.sqrt(REACH * REACH - dx * dx);
    }
    const bar = v(x, y);
    const tc = add(H, mul(td, 0.31));
    const thc = mul(add(H, K), 0.5);
    const com = (bar.x * M.bar + tc.x * M.upper + thc.x * M.thighs) / (M.bar + M.upper + M.thighs);
    return { H, td, back, front, S, Sh, bar, xl, tc, thc, com };
  }

  function solve(st) {
    let lo = -15 * DEG, hi = 80 * DEG;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pose(st.tau, st.g, mid).com - XM > 0) lo = mid; else hi = mid;
    }
    const psi = (lo + hi) / 2;
    const P = pose(st.tau, st.g, psi);
    const { H, td, Sh, bar, tc } = P;
    const e1 = ik2(Sh, bar, L.upperArm, L.foreArm, 1);
    const e2 = ik2(Sh, bar, L.upperArm, L.foreArm, -1);
    const E = e1.x < e2.x ? e1 : e2;
    const Wb = M.bar * G, Wu = M.upper * G;
    const Mh = Wb * (bar.x - H.x) + Wu * (tc.x - H.x);              // ягодичные + бицепс бедра
    const Lp = add(H, mul(td, 0.12));
    const Ml = Wb * (bar.x - Lp.x) + Wu * 0.92 * (tc.x - Lp.x);     // поясница
    const Ms = Math.max(Wb * (Sh.x - bar.x), 0);                    // широчайшие прижимают штангу
    return {
      ...P, ...st, psi, E, Lp, Mh, Ml, Ms,
      gap: Math.max(bar.x - P.xl, 0),
      hI: clamp(Mh / REF, 0, 1), lI: clamp(Ml / REF, 0, 1), sI: clamp(Ms / (0.15 * Wb), 0, 1),
    };
  }

  function drawStatic({ D }) {
    return D.ln(v(-1.2, FLOOR - 0.02), v(1.4, FLOOR - 0.02), 'm-base', D.px(0.035));
  }

  function draw(r, { D, uid, mini }) {
    const { H, S, td, back, front, Sh, E, bar } = r;
    const head = comb(S, [td, 0.17], [back, -0.03]);
    let out = D.circ(bar, D.px(0.225), 'm-weight') + D.circ(bar, D.px(0.03), 'm-hub');
    out += D.figure([
      [D.part('thigh', H, K, v(1, 0)), D.part('shank', K, A, D.away(K, A, H)), D.footFlat(A, FLOOR)],
      [D.part('torso', comb(H, [td, -0.02]), S, front), D.part('neck', S, comb(S, [td, 0.12]), front), D.head(head, td, front)],
    ]);
    const dT = norm(sub(K, H));
    let nb = perp(dT);
    if (nb.x > 0) nb = mul(nb, -1);                     // задняя поверхность бедра
    out += D.muscleLens(H, K, nb, 0.075, 0.2, 0.14, 0.03, 'mu-m2', r.hI, uid);
    out += D.muscleEll(comb(H, [nb, 0.06], [dT, -0.03]), 0.09, 0.07, dT, 'mu-m2', r.hI, uid);
    out += D.muscleLens(comb(H, [td, 0.04]), comb(H, [td, 0.42]), back, 0.07, 0.05, 0.25, 0.055, 'mu-m3', r.lI, uid);
    out += D.muscleLens(comb(H, [td, 0.2]), comb(H, [td, 0.48]), back, 0.06, 0.05, 0.05, 0.05, 'mu-m1', r.sI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, bar)), D.part('foreArm', E, bar, D.toward(E, bar, Sh)), D.disc(bar, 0.042)]]);
    out += D.joints([H, K, Sh]);
    if (!mini) {
      out += D.ln(v(bar.x, bar.y + 0.5), v(bar.x, FLOOR), 'fline');
      out += D.lever(H, bar, v(0, -1), bar.x - H.x, 'm2', { labelOff: 0.05 });
      if (r.Ms > 1) out += D.lever(Sh, bar, v(0, -1), Sh.x - bar.x, 'm1', { labelOff: 0.05 });
    }
    out += D.arrow(add(bar, v(0, 0.02)), add(bar, v(0, -0.28)), 'ar-force', 6);
    return out;
  }

  const hp = {
    lean: (r) => comb(r.S, [r.td, 0.36]),
    bar: (r) => add(r.bar, v(0.14, 0)),
  };

  function notes(r) {
    return [
      { lines: ['тяни: наклон', 'корпуса'], x: 790, y: 60, from: [800, 90], to: hp.lean(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: штанга ближе', 'или дальше от ног'], x: 780, y: 520, from: [800, 500], to: hp.bar(r), circle: 26, bend: 0.3 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 40, y: 40, from: [150, 80], to: v((r.H.x + r.bar.x) / 2, r.H.y), bend: 0.3, gap: 10 },
      { lines: ['светится —', 'значит работает'], x: 40, y: 330, from: [140, 350], to: comb(r.H, [v(-1, 0), 0.08]), bend: -0.2, gap: 8 },
      { lines: ['таз уходит назад —', 'так ты не падаешь'], x: 40, y: 560, from: [150, 545], to: comb(r.H, [v(-1, 0), 0.12], [v(0, -1), 0.08]), bend: 0.3, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'lean', label: 'Наклон корпуса',
      pos: hp.lean, axis: (r) => perp(r.td),
      drag: (st, w, r) => { const d = sub(w, r.H); st.tau = Math.atan2(d.x, d.y); },
      step: (st, dir, k) => { st.tau += dir * 2 * DEG * k; },
      value: (r) => ({ text: `наклон ${Math.round(r.tau / DEG)}°`, now: r.tau / DEG, min: 5, max: 80 }),
      pausesPlay: true,
    },
    {
      key: 'bar', label: 'Штанга ближе или дальше от ног',
      pos: hp.bar, axis: () => v(1, 0),
      drag: (st, w, r) => {
        const span = r.xl - r.Sh.x;
        if (span > 0.02) st.g = (w.x - 0.14 - r.Sh.x) / span;
      },
      step: (st, dir, k) => { st.g -= dir * 0.05 * k; },
      value: (r) => ({ text: `штанга в ${Math.round(r.gap * 100)} см от ног`, now: r.g * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -10 1000 724',
    miniViewBox: '150 -10 700 724',
    mobileViewBox: '240 -10 560 724',
    period: 3.4,
    initial: () => ({ tau: 50 * DEG, g: 0.9 }),
    clamp(st) { st.tau = clamp(st.tau, TAU_MIN, TAU_MAX); st.g = clamp(st.g, 0, 1); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * (st.tau - 8 * DEG) / (64 * DEG), -1, 1)),
    animate(st, ph, { mini }) {
      st.tau = 8 * DEG + 64 * DEG * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.g = 0.55 + 0.45 * Math.sin(ph * 0.23);
    },
  };

  const page = {
    muscles: [
      { key: 'h', name: 'Ягодицы и бицепс бедра', c: 'm2' },
      { key: 'l', name: 'Поясница', c: 'm3' },
      { key: 's', name: 'Широчайшие', c: 'm1' },
    ],
    slider: {
      label: 'Где штанга', left: 'Далеко от ног · поясница', right: 'Вплотную к ногам', lc: 'm3', rc: 'm2',
      get: (r) => r.g * 100,
      set: (x) => ({ g: x / 100 }),
    },
    presets: [
      { label: 'Штанга скользит по ногам', c: 'm2', state: { g: 1, tau: 60 * DEG } },
      { label: 'Штанга отошла', c: 'm3', state: { g: 0.1, tau: 60 * DEG } },
      { label: 'Сбросить', state: { g: 0.9, tau: 50 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const main = r.gap > 0.08
        ? `Штанга отошла от ног на <b class="c-m3">${cm(r.gap)}</b> — плечо у таза и поясницы выросло. Тот же вес становится тяжелее для спины.`
        : 'Штанга идёт вдоль ног — рычаги короткие. Работают <b class="c-m2">ягодицы и бицепс бедра</b>, поясница держит корпус ровным.';
      const lats = r.Ms > 1
        ? '<b class="c-m1">Широчайшие</b> тянут руки назад и прижимают штангу к ногам — поэтому после румынской тяги «забита» спина.'
        : 'Руки висят вертикально — широчайшим нечего держать.';
      const depth = r.tau > 65 * DEG
        ? '<b>Глубокий наклон.</b> Таз далеко сзади, бицепс бедра сильно растянут.'
        : r.tau < 25 * DEG ? '<b>Верхняя часть движения</b> — рычаги короткие, отдых.' : 'Середина амплитуды.';
      const warnings = [];
      if (r.gap > 0.12 && r.tau > 35 * DEG) warnings.push('<strong>Штанга далеко от ног.</strong> Поясница держит лишний момент — так чаще всего и срывают спину.');
      return {
        loads: { h: r.Mh, l: r.Ml, s: r.Ms },
        nums: [
          ['Плечо у таза', cm(r.bar.x - r.H.x)],
          ['Штанга от ног', cm(r.gap)],
          ['Наклон корпуса', deg(r.tau)],
          ['Таз назад', cm(r.H.x - XM)],
        ],
        notes: [[r.gap > 0.08 ? 'm3' : 'm2', main], ['m1', lats], ['f', depth]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.rdl = { model, page };
})(window);
