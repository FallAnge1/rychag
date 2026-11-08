/* Тяга штанги в наклоне: вид сбоку, человек смотрит вправо (+x).
   Ты задаёшь наклон корпуса и высоту штанги; таз сам уходит назад,
   чтобы общий центр масс остался над серединой стопы. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, clamp, lerp, comb, ik2, angleAt, openingMoment, makeView } = global.Bio;

  const L = { shank: 0.43, thigh: 0.45, torso: 0.52, headR: 0.1, upperArm: 0.3, foreArm: 0.27 };
  const W = { torso: 0.25, neck: 0.08, thigh: 0.165, shank: 0.115, upperArm: 0.085, foreArm: 0.07 };
  const G = 9.81;
  const M = { bar: 60, upper: 45, thighs: 20 };
  const XM = 0.05, FLOOR = -0.08;
  const BETA = 14 * DEG;                    // колени слегка согнуты
  const TAU_MIN = 15 * DEG, TAU_MAX = 85 * DEG;
  const A = v(0, 0);
  const K = v(Math.sin(BETA) * L.shank, Math.cos(BETA) * L.shank);
  const REACH = L.upperArm + L.foreArm - 0.005;
  const REF = 0.3 * M.bar * G;

  const VIEW = makeView(470, 600, 380);

  function pose(tau, p, psi) {
    const H = add(K, mul(v(-Math.sin(psi), Math.cos(psi)), L.thigh));
    const td = v(Math.sin(tau), Math.cos(tau));
    const back = perp(td);
    const front = mul(back, -1);
    const S = add(H, mul(td, L.torso));
    const Sh = comb(H, [td, 0.47], [front, 0.01]);
    const hang = add(Sh, v(0, -REACH));
    const belly = comb(H, [td, 0.16], [front, 0.17]);
    const Hd = add(mul(hang, 1 - p), mul(belly, p));
    const tc = add(H, mul(td, 0.31));
    const thc = mul(add(H, K), 0.5);
    const com = (Hd.x * M.bar + tc.x * M.upper + thc.x * M.thighs) / (M.bar + M.upper + M.thighs);
    return { H, td, back, front, S, Sh, hang, belly, Hd, tc, thc, com };
  }

  function solve(st) {
    let lo = -15 * DEG, hi = 70 * DEG;
    // больше psi — таз дальше назад, центр масс левее
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pose(st.tau, st.p, mid).com - XM > 0) lo = mid; else hi = mid;
    }
    const psi = (lo + hi) / 2;
    const P = pose(st.tau, st.p, psi);
    const { H, td, Sh, Hd, tc } = P;
    const e1 = ik2(Sh, Hd, L.upperArm, L.foreArm, 1);
    const e2 = ik2(Sh, Hd, L.upperArm, L.foreArm, -1);
    const E = e1.y > e2.y ? e1 : e2;
    const Wb = M.bar * G;
    const Ms = Wb * (Sh.x - Hd.x);                         // широчайшие (разгибание плеча)
    const Mb = Math.max(openingMoment(E, Sh, Hd, v(0, -Wb)), 0); // бицепс
    const Lp = add(H, mul(td, 0.12));
    const Ml = Wb * (Hd.x - Lp.x) + M.upper * 0.92 * G * (tc.x - Lp.x);
    return {
      ...P, ...st, psi, E, Lp, Ms, Mb, Ml,
      elbow: angleAt(Sh, E, Hd),
      sI: clamp(Ms / REF, 0, 1), bI: clamp(Mb / (REF * 0.5), 0, 1), lI: clamp(Ml / (REF * 2.4), 0, 1),
    };
  }

  function drawStatic({ D }) {
    return D.ln(v(-1.2, FLOOR - 0.02), v(1.4, FLOOR - 0.02), 'm-base', D.px(0.035));
  }

  function draw(r, { D, uid, mini }) {
    const { H, S, td, back, Sh, E, Hd } = r;
    const head = comb(S, [td, 0.17], [back, -0.03]);
    let out = D.circ(Hd, D.px(0.225), 'm-weight') + D.circ(Hd, D.px(0.03), 'm-hub');
    const front = mul(back, -1);
    out += D.figure([
      [D.part('thigh', H, K, D.away(H, K, A)), D.part('shank', K, A, D.away(K, A, H)), D.footFlat(A, FLOOR)],
      [D.part('torso', comb(H, [td, -0.02]), S, front), D.part('neck', S, comb(S, [td, 0.12]), front), D.head(head, td, front)],
    ]);
    out += D.muscleLens(comb(H, [td, 0.04]), comb(H, [td, 0.42]), back, 0.07, 0.05, 0.25, 0.055, 'mu-m3', r.lI, uid);
    out += D.muscleLens(comb(H, [td, 0.18]), comb(H, [td, 0.48]), back, 0.07, 0.05, 0.05, 0.05, 'mu-m1', r.sI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, Hd)), D.part('foreArm', E, Hd, D.toward(E, Hd, Sh)), D.disc(Hd, 0.042)]]);
    const dU = norm(sub(E, Sh));
    let n = perp(dU);
    if (n.x * (Hd.x - E.x) + n.y * (Hd.y - E.y) < 0) n = mul(n, -1); // к предплечью
    out += D.muscleLens(Sh, E, n, 0.06, 0.3, 0.08, 0.02, 'mu-m2', r.bI, uid);
    out += D.bones([[H, S], [H, K], [K, A], [Sh, E], [E, Hd]]) + D.joints([H, K, Sh, E]) + D.joints([A], 5);
    if (!mini) {
      out += D.ln(v(Hd.x, Hd.y + 0.4), v(Hd.x, FLOOR), 'fline');
      out += D.lever(Sh, Hd, v(0, -1), r.Sh.x - Hd.x, 'm1', { labelOff: 0.05 });
      out += D.lever(r.Lp, Hd, v(0, -1), Hd.x - r.Lp.x, 'm3', { labelOff: 0.05 });
    }
    out += D.arrow(add(Hd, v(0, 0.02)), add(Hd, v(0, -0.28)), 'ar-force', 6);
    return out;
  }

  const hp = {
    lean: (r) => comb(r.S, [r.td, 0.36]),
    bar: (r) => add(r.Hd, v(0.13, 0.0)),
  };

  function notes(r) {
    const mid = mul(add(r.hang, r.belly), 0.5);
    return [
      { lines: ['тяни: наклон', 'корпуса'], x: 790, y: 60, from: [800, 90], to: hp.lean(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: штанга', 'к поясу'], x: 800, y: 480, from: [810, 500], to: hp.bar(r), circle: 26, bend: -0.3 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 40, y: 40, from: [150, 80], to: v((r.Lp.x + r.Hd.x) / 2, r.Lp.y), bend: 0.3, gap: 10 },
      { lines: ['поясница держит', 'наклонённый корпус'], x: 40, y: 560, from: [120, 545], to: comb(r.H, [r.td, 0.22], [r.back, 0.14]), bend: 0.3, gap: 6 },
      mid && { lines: ['светится —', 'значит работает'], x: 40, y: 300, from: [140, 330], to: comb(r.H, [r.td, 0.34], [r.back, 0.14]), bend: -0.2, gap: 6 },
    ];
  }

  const handles = [
    {
      key: 'lean', label: 'Наклон корпуса',
      pos: hp.lean, axis: (r) => perp(r.td),
      drag: (st, w, r) => { const d = sub(w, r.H); st.tau = Math.atan2(d.x, d.y); },
      step: (st, dir, k) => { st.tau += dir * 2 * DEG * k; },
      value: (r) => ({ text: `наклон ${Math.round(r.tau / DEG)}°`, now: r.tau / DEG, min: 15, max: 85 }),
    },
    {
      key: 'bar', label: 'Высота штанги: от прямых рук до пояса', pausesPlay: true,
      pos: hp.bar, axis: (r) => norm(sub(r.belly, r.hang)),
      drag: (st, w, r) => {
        const seg = sub(r.belly, r.hang);
        st.p = ((w.x - 0.13 - r.hang.x) * seg.x + (w.y - r.hang.y) * seg.y) / (seg.x * seg.x + seg.y * seg.y);
      },
      step: (st, dir, k) => { st.p += dir * 0.05 * k; },
      value: (r) => ({ text: `штанга поднята на ${Math.round(r.p * 100)}%`, now: r.p * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -10 1000 724',
    miniViewBox: '150 -10 700 724',
    mobileViewBox: '240 -10 560 724',
    period: 2.6,
    initial: () => ({ tau: 55 * DEG, p: 0.6 }),
    clamp(st) { st.tau = clamp(st.tau, TAU_MIN, TAU_MAX); st.p = clamp(st.p, 0, 1); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.p, -1, 1)),
    animate(st, ph, { mini }) {
      st.p = 0.5 - 0.5 * Math.cos(ph);
      if (mini) st.tau = (55 + 18 * Math.sin(ph * 0.21)) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 's', name: 'Широчайшие', c: 'm1' },
      { key: 'l', name: 'Поясница', c: 'm3' },
      { key: 'b', name: 'Бицепс', c: 'm2' },
    ],
    slider: {
      label: 'Наклон корпуса', left: 'Выше · легче пояснице', right: 'Ниже · больше широчайшим', lc: 'm3', rc: 'm1',
      get: (r) => ((r.tau - TAU_MIN) / (TAU_MAX - TAU_MIN)) * 100,
      set: (x) => ({ tau: TAU_MIN + (x / 100) * (TAU_MAX - TAU_MIN) }),
    },
    presets: [
      { label: 'Почти параллельно полу', c: 'm1', state: { tau: 80 * DEG, p: 0.9 } },
      { label: 'Корпус под 45°', c: 'm3', state: { tau: 45 * DEG, p: 0.9 } },
      { label: 'Сбросить', state: { tau: 55 * DEG, p: 0.6 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const lats = r.p < 0.15
        ? 'Руки висят прямо под плечами — <b class="c-m1">широчайшим</b> нечего держать. Работа начинается, когда тянешь штангу назад, к поясу.'
        : `Штанга на ${cm(r.Sh.x - r.Hd.x)} позади плечевого сустава — это рычаг для <b class="c-m1">широчайших</b>. Чем ниже корпус, тем дальше назад уходит пояс и тем длиннее рычаг.`;
      const lower = r.tau > 65 * DEG
        ? '<b class="c-m3">Поясница</b> держит почти горизонтальный корпус и штангу далеко впереди — это самая тяжёлая часть упражнения.'
        : r.tau < 35 * DEG
          ? '<b class="c-m3">Пояснице</b> легко, но и широчайшие работают меньше — получается больше похоже на шраги.'
          : '<b class="c-m3">Поясница</b> держит наклон — следи, чтобы спина оставалась ровной.';
      const bic = r.Mb < 0.03 * M.bar * G
        ? '<b class="c-m2">Бицепс</b> почти не держит вес: предплечье висит вертикально, вес тянет вдоль него.'
        : '<b class="c-m2">Бицепс</b> подключается: предплечье отклонилось от вертикали.';
      const warnings = [];
      if (r.tau > 75 * DEG) warnings.push('<strong>Корпус почти горизонтален.</strong> Поясница держит большой момент — с большим весом легко округлить спину.');
      return {
        loads: { s: r.Ms, l: r.Ml, b: r.Mb },
        nums: [
          ['Плечо у плеча', cm(r.Sh.x - r.Hd.x)],
          ['Плечо у поясницы', cm(r.Hd.x - r.Lp.x)],
          ['Наклон корпуса', deg(r.tau)],
          ['Угол в локте', deg(r.elbow)],
        ],
        notes: [['m1', lats], ['m3', lower], ['m2', bic]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.row = { model, page };
})(window);
