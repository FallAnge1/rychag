/* Тяга верхнего блока: вид сбоку, человек сидит лицом вправо (+x).
   Сила здесь не вертикальная: трос тянет руки к блоку.
   Отклоняешь корпус назад — тяга становится похожей на горизонтальную, работает середина спины. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, norm, perp, clamp, lerp, comb, ik2, cross, openingMoment, makeView, len } = global.Bio;

  const L = { thigh: 0.45, shank: 0.43, torso: 0.52, upperArm: 0.3, foreArm: 0.27 };
  const G = 9.81;
  const KG = 50;
  const H = v(0, 0);
  const K = v(0.45, 0.02);
  const A = v(0.5, -0.4);
  const FLOOR = -0.48;
  const P = v(0.12, 1.58);                 // блок
  const TAU_MAX = 40 * DEG;
  const REACH = L.upperArm + L.foreArm - 0.005;
  const T = KG * G;
  const REF = T * 0.32;

  const VIEW = makeView(470, 543, 320);

  function solve(st) {
    const td = v(-Math.sin(st.tau), Math.cos(st.tau));   // корпус отклоняется назад
    const front = v(Math.cos(st.tau), Math.sin(st.tau));
    const back = mul(front, -1);
    const S = add(H, mul(td, L.torso));
    const Sh = comb(H, [td, 0.47], [front, 0.01]);
    const top = add(Sh, mul(norm(sub(P, Sh)), REACH));
    const chest = comb(H, [td, 0.42], [front, 0.17]);
    const hand = add(mul(top, 1 - st.p), mul(chest, st.p));
    const dir = norm(sub(P, hand));                      // куда трос тянет руки
    const F = mul(dir, T);
    const e1 = ik2(Sh, hand, L.upperArm, L.foreArm, 1);
    const e2 = ik2(Sh, hand, L.upperArm, L.foreArm, -1);
    const E = e1.y < e2.y ? e1 : e2;
    const Ms = Math.max(openingMoment(Sh, H, hand, F), 0);   // трос задирает руку — держит спина
    const Mb = Math.max(openingMoment(E, Sh, hand, F), 0);   // бицепс
    // Насколько тяга идёт вдоль корпуса (широчайшие) или поперёк (середина спины)
    const c = Math.abs(dot(dir, td));
    const fl = c * c;
    return {
      ...st, td, front, back, S, Sh, top, chest, hand, dir, E, Ms, Mb, fl,
      Mlat: Ms * fl, Mmid: Ms * (1 - fl),
      armS: Math.abs(cross(dir, sub(Sh, hand))),
      latI: clamp((Ms * fl) / REF, 0, 1), midI: clamp((Ms * (1 - fl)) / REF, 0, 1), bI: clamp(Mb / (REF * 0.6), 0, 1),
    };
  }

  function drawStatic({ D }) {
    const { ln, px } = D;
    return [
      ln(v(-0.75, FLOOR), v(1.0, FLOOR), 'm-base', px(0.03)),
      ln(v(-0.55, FLOOR), v(-0.55, 1.66), 'm-frame', px(0.04)),
      ln(v(-0.55, 1.66), v(P.x, 1.66), 'm-frame', px(0.04)),
      ln(v(0.05, -0.1), v(0.05, FLOOR), 'm-frame', px(0.04)),
      ln(v(0.42, 0.14), v(-0.3, 0.6), 'm-frame', px(0.03)),
      D.poly([v(-0.2, -0.05), v(0.3, -0.05), v(0.3, -0.13), v(-0.2, -0.13)], 'm-bench'),
      D.circ(P, px(0.055), 'm-weight'),
    ].join('');
  }

  function draw(r, { D, uid, mini }) {
    const { S, td, front, back, Sh, E, hand } = r;
    const head = comb(S, [td, 0.17], [back, 0.02]);
    let out = D.ln(P, hand, 'cable');
    out += D.figure([
      [D.part('torso', comb(H, [td, -0.02]), S, front), D.part('neck', S, comb(S, [td, 0.12]), front), D.head(head, td, front),
        D.part('thigh', H, K, v(0, 1)), D.part('shank', K, A, v(1, 0)), D.footFlat(A, FLOOR)],
    ]);
    // накладка на бёдра поверх ног
    out += D.circ(v(0.42, 0.14), D.px(0.06), 'm-weight');
    out += D.muscleLens(comb(H, [td, 0.12]), comb(H, [td, 0.46]), back, 0.07, 0.05, 0.08, 0.06, 'mu-m1', r.latI, uid);
    out += D.muscleEll(comb(H, [td, 0.4], [back, 0.08]), 0.06, 0.08, td, 'mu-m3', r.midI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, hand)), D.part('foreArm', E, hand, D.toward(E, hand, Sh)), D.disc(hand, 0.042)]]);
    const dU = norm(sub(E, Sh));
    let n = perp(dU);
    if (dot(n, sub(hand, E)) < 0) n = mul(n, -1);
    out += D.muscleLens(Sh, E, n, 0.055, 0.3, 0.08, 0.02, 'mu-m2', r.bI, uid);
    out += D.circ(hand, D.px(0.025), 'm-hub');
    out += D.joints([H, Sh, E]);
    if (!mini) {
      out += D.ln(add(hand, mul(r.dir, -0.35)), P, 'fline');
      out += D.lever(Sh, hand, r.dir, r.armS, 'm1', { labelOff: 0.05 });
    }
    out += D.arrow(add(hand, mul(r.dir, 0.05)), add(hand, mul(r.dir, 0.3)), 'ar-force', 6);
    return out;
  }

  const hp = {
    lean: (r) => comb(r.S, [r.td, 0.36]),
    bar: (r) => add(r.hand, mul(r.front, 0.14)),
  };

  function notes(r) {
    return [
      { lines: ['тяни: отклонить', 'корпус назад'], x: 40, y: 60, from: [150, 100], to: hp.lean(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: рукоять', 'вниз / вверх'], x: 760, y: 230, from: [770, 260], to: hp.bar(r), circle: 26, bend: 0.3 },
      { lines: ['трос тянет', 'руки к блоку'], x: 560, y: 30, from: [600, 60], to: mul(add(P, r.hand), 0.5), bend: -0.3, gap: 8 },
      { lines: ['светится —', 'значит работает'], x: 40, y: 430, from: [140, 440], to: comb(H, [r.td, 0.3], [r.back, 0.1]), bend: 0.2, gap: 8 },
      { lines: ['цветной отрезок —', 'плечо рычага у плеча'], x: 700, y: 560, from: [710, 545], to: r.Sh, bend: 0.3, gap: 14 },
    ];
  }

  const handles = [
    {
      key: 'lean', label: 'Отклонение корпуса назад',
      pos: hp.lean, axis: (r) => perp(r.td),
      drag: (st, w) => { st.tau = Math.atan2(-(w.x - H.x), w.y - H.y); },
      step: (st, dir, k) => { st.tau -= dir * 2 * DEG * k; },
      value: (r) => ({ text: `отклонение ${Math.round(r.tau / DEG)}°`, now: r.tau / DEG, min: 0, max: 40 }),
    },
    {
      key: 'bar', label: 'Рукоять: от вытянутых рук до груди', pausesPlay: true,
      pos: hp.bar, axis: (r) => norm(sub(r.chest, r.top)),
      drag: (st, w, r) => {
        const seg = sub(r.chest, r.top);
        const q = sub(sub(w, mul(r.front, 0.14)), r.top);
        st.p = dot(q, seg) / dot(seg, seg);
      },
      step: (st, dir, k) => { st.p -= dir * 0.05 * k; },
      value: (r) => ({ text: `рукоять опущена на ${Math.round(r.p * 100)}%`, now: r.p * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '160 0 640 724',
    mobileViewBox: '220 0 560 724',
    period: 2.8,
    initial: () => ({ tau: 15 * DEG, p: 0.75 }),
    clamp(st) { st.tau = clamp(st.tau, 0, TAU_MAX); st.p = clamp(st.p, 0, 1); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.p, -1, 1)),
    animate(st, ph, { mini }) {
      st.p = 0.5 - 0.5 * Math.cos(ph);
      if (mini) st.tau = (18 + 16 * Math.sin(ph * 0.21)) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 'l', name: 'Широчайшие', c: 'm1' },
      { key: 'm', name: 'Середина спины', c: 'm3' },
      { key: 'b', name: 'Бицепс', c: 'm2' },
    ],
    slider: {
      label: 'Корпус', left: 'Вертикально · широчайшие', right: 'Отклонение · середина спины', lc: 'm1', rc: 'm3',
      get: (r) => (r.tau / TAU_MAX) * 100,
      set: (x) => ({ tau: (x / 100) * TAU_MAX }),
    },
    presets: [
      { label: 'Корпус вертикально', c: 'm1', state: { tau: 3 * DEG, p: 0.8 } },
      { label: 'Сильно назад', c: 'm3', state: { tau: 38 * DEG, p: 0.9 } },
      { label: 'Сбросить', state: { tau: 15 * DEG, p: 0.75 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const lat = Math.round(r.fl * 100);
      const main = r.fl > 0.65
        ? `Трос тянет почти вдоль корпуса — работают <b class="c-m1">широчайшие</b> (${lat}% работы спины): они тянут плечо вниз, к поясу.`
        : r.fl < 0.4
          ? 'Корпус отклонён, трос тянет поперёк спины — это уже похоже на тягу к поясу. Работает <b class="c-m3">середина спины</b>: она сводит лопатки.'
          : 'Тяга идёт по диагонали — работают и <b class="c-m1">широчайшие</b>, и <b class="c-m3">середина спины</b>.';
      const phase = r.p < 0.2
        ? 'Руки вытянуты к блоку — трос тянет почти через плечо, рычаг короткий.'
        : `Плечо рычага у плечевого сустава — ${cm(r.armS)}. Чем ниже рукоять, тем он длиннее.`;
      const bic = r.Mb > 0.05 * T * 0.3
        ? '<b class="c-m2">Бицепс</b> держит согнутый локоть: трос пытается его разогнуть.'
        : '<b class="c-m2">Бицепс</b> почти отдыхает: трос тянет вдоль предплечья.';
      const warnings = [];
      if (r.tau > 32 * DEG) warnings.push('<strong>Сильный отклон.</strong> Корпус раскачивается и помогает инерцией — нагрузка на спину становится непредсказуемой.');
      return {
        loads: { l: r.Mlat, m: r.Mmid, b: r.Mb },
        nums: [
          ['Плечо у плеча', cm(r.armS)],
          ['Отклонение', deg(r.tau)],
          ['Вдоль корпуса', `${lat}%`],
          ['Рукоять опущена', `${Math.round(r.p * 100)}%`],
        ],
        notes: [[r.fl > 0.5 ? 'm1' : 'm3', main], ['f', phase], ['m2', bic]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.pulldown = { model, page };
})(window);
