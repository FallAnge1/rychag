/* Горизонтальная тяга нижнего блока: вид сбоку, сидя лицом к блоку (+x).
   Трос тянет руки к блоку. Наклон корпуса вперёд — поясница держит и трос, и собственный вес;
   отклон назад — корпус помогает своим весом. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, norm, perp, clamp, comb, cross, armIK, openingMoment, makeView } = global.Bio;

  const L = { torso: 0.52, upperArm: 0.3, foreArm: 0.27 };
  const G = 9.81;
  const KG = 45;
  const T = KG * G;
  const WU = 45 * G;                         // корпус с руками и головой
  const H = v(0, 0);
  const K = v(0.42, 0.16);
  const A = v(0.8, 0.02);
  const FLOOR = -0.42;
  const P = v(1.18, 0.33);                   // нижний блок
  const TAU_MIN = -25 * DEG, TAU_MAX = 35 * DEG;   // − назад, + вперёд
  const REACH = L.upperArm + L.foreArm - 0.005;
  const REF = T * 0.35;

  const VIEW = makeView(330, 470, 450);

  function solve(st) {
    const td = v(Math.sin(st.tau), Math.cos(st.tau));
    const front = v(Math.cos(st.tau), -Math.sin(st.tau));
    const back = mul(front, -1);
    const S = add(H, mul(td, L.torso));
    const Sh = comb(H, [td, 0.47], [front, 0.01]);
    const far = add(Sh, mul(norm(sub(P, Sh)), REACH));
    const belly = comb(H, [td, 0.2], [front, 0.17]);
    const hand = add(mul(far, 1 - st.p), mul(belly, st.p));
    const dir = norm(sub(P, hand));
    const F = mul(dir, T);
    const E = armIK(Sh, hand, L.upperArm, L.foreArm, td, front);
    const Ms = Math.max(openingMoment(Sh, H, hand, F), 0);       // спина тянет плечо назад
    const Mb = Math.max(openingMoment(E, Sh, hand, F), 0);       // бицепс
    const Lp = add(H, mul(td, 0.12));
    const tc = add(H, mul(td, 0.31));
    // всё, что выше поясницы: трос через руки + вес корпуса. Минус — тянет вперёд, держат разгибатели спины
    const tq = cross(sub(hand, Lp), F) + cross(sub(tc, Lp), v(0, -WU * 0.92));
    const Ml = Math.max(-tq, 0);
    return {
      ...st, td, front, back, S, Sh, far, belly, hand, dir, E, Ms, Mb, Ml, Lp, tc,
      armL: Math.abs(cross(dir, sub(Lp, hand))),
      sI: clamp(Ms / REF, 0, 1), bI: clamp(Mb / (REF * 0.6), 0, 1), lI: clamp(Ml / (REF * 1.4), 0, 1),
    };
  }

  function drawStatic({ D }) {
    const { ln, px } = D;
    return [
      ln(v(-0.6, FLOOR), v(1.35, FLOOR), 'm-base', px(0.03)),
      D.poly([v(-0.35, -0.05), v(0.3, -0.05), v(0.3, -0.12), v(-0.35, -0.12)], 'm-bench'),
      ln(v(0, -0.12), v(0, FLOOR), 'm-frame', px(0.04)),
      ln(v(0.9, FLOOR), v(0.92, 0.22), 'm-pad', px(0.035)),
      ln(v(1.24, FLOOR), v(1.24, 0.42), 'm-frame', px(0.04)),
      D.circ(P, px(0.045), 'm-weight'),
    ].join('');
  }

  function draw(r, { D, uid, mini }) {
    const { S, td, front, back, Sh, E, hand } = r;
    const head = comb(S, [td, 0.17], [back, 0.02]);
    const foot = [v(0.77, -0.03), v(0.885, -0.04), v(0.905, 0.12), v(0.89, 0.17), v(0.85, 0.1), v(0.77, 0.06)];
    let out = D.ln(P, hand, 'cable');
    out += D.farLeg(H, K, A, (a) => D.blob(foot.map((p) => add(p, v(-0.03, 0)))), v(-0.03, 0.01));
    out += D.figure([
      [D.part('thigh', H, K, D.away(H, K, A)), D.part('shank', K, A, D.away(K, A, H)), D.blob(foot),
        D.part('torso', comb(H, [td, -0.02]), S, front), D.part('neck', S, comb(S, [td, 0.12]), front), D.head(head, td, front)],
    ]);
    out += D.muscleLens(comb(H, [td, 0.04]), comb(H, [td, 0.4]), back, 0.07, 0.05, 0.25, 0.055, 'mu-m3', r.lI, uid);
    out += D.muscleLens(comb(H, [td, 0.2]), comb(H, [td, 0.5]), back, 0.07, 0.05, 0.05, 0.05, 'mu-m1', r.sI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, hand)), D.part('foreArm', E, hand, D.toward(E, hand, Sh)), D.disc(hand, 0.042)]]);
    let n = perp(norm(sub(E, Sh)));
    if (dot(n, sub(hand, E)) < 0) n = mul(n, -1);
    out += D.muscleLens(Sh, E, n, 0.055, 0.3, 0.08, 0.02, 'mu-m2', r.bI, uid);
    out += D.joints([H, Sh, E]);
    if (!mini) {
      out += D.ln(add(hand, mul(r.dir, -0.6)), P, 'fline');
      out += D.lever(r.Lp, hand, r.dir, r.armL, 'm3', { labelOff: 0.05 });
    }
    out += D.arrow(add(hand, mul(r.dir, 0.05)), add(hand, mul(r.dir, 0.28)), 'ar-force', 6);
    return out;
  }

  const hp = {
    lean: (r) => comb(r.S, [r.td, 0.36]),
    bar: (r) => add(r.hand, v(0, 0.13)),
  };

  function notes(r) {
    return [
      { lines: ['тяни: наклон', 'корпуса'], x: 30, y: 40, from: [140, 75], to: hp.lean(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: рукоять', 'к себе / от себя'], x: 700, y: 130, from: [710, 160], to: hp.bar(r), circle: 26, bend: 0.3 },
      { lines: ['трос тянет', 'руки к блоку'], x: 760, y: 560, from: [790, 540], to: mul(add(P, r.hand), 0.5), bend: 0.3, gap: 8 },
      { lines: ['отрезок — плечо рычага', 'для поясницы'], x: 30, y: 600, from: [150, 585], to: r.Lp, bend: -0.3, gap: 12 },
      { lines: ['светится —', 'значит работает'], x: 30, y: 300, from: [130, 320], to: comb(H, [r.td, 0.35], [r.back, 0.1]), bend: 0.2, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'lean', label: 'Наклон корпуса вперёд или назад',
      pos: hp.lean, axis: (r) => perp(r.td),
      drag: (st, w) => { st.tau = Math.atan2(w.x - H.x, w.y - H.y); },
      step: (st, dir, k) => { st.tau += dir * 2 * DEG * k; },
      value: (r) => ({ text: `наклон ${Math.round(r.tau / DEG)}°`, now: r.tau / DEG, min: -25, max: 35 }),
    },
    {
      key: 'bar', label: 'Рукоять: от вытянутых рук до живота', pausesPlay: true,
      pos: hp.bar, axis: (r) => norm(sub(r.belly, r.far)),
      drag: (st, w, r) => {
        const seg = sub(r.belly, r.far);
        st.p = dot(sub(sub(w, v(0, 0.13)), r.far), seg) / dot(seg, seg);
      },
      step: (st, dir, k) => { st.p -= dir * 0.05 * k; },
      value: (r) => ({ text: `рукоять подтянута на ${Math.round(r.p * 100)}%`, now: r.p * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '80 40 820 620',
    mobileViewBox: '60 20 760 660',
    period: 2.8,
    initial: () => ({ tau: 0, p: 0.8 }),
    clamp(st) { st.tau = clamp(st.tau, TAU_MIN, TAU_MAX); st.p = clamp(st.p, 0, 1); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.p, -1, 1)),
    animate(st, ph, { mini }) {
      st.p = 0.5 - 0.5 * Math.cos(ph);
      if (mini) st.tau = 18 * Math.sin(ph) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 's', name: 'Спина', c: 'm1' },
      { key: 'l', name: 'Поясница', c: 'm3' },
      { key: 'b', name: 'Бицепс', c: 'm2' },
    ],
    slider: {
      label: 'Корпус', left: 'Отклон назад', right: 'Наклон вперёд · поясница', lc: 'm1', rc: 'm3',
      get: (r) => ((r.tau - TAU_MIN) / (TAU_MAX - TAU_MIN)) * 100,
      set: (x) => ({ tau: TAU_MIN + (x / 100) * (TAU_MAX - TAU_MIN) }),
    },
    presets: [
      { label: 'Корпус ровно', c: 'm1', state: { tau: 0, p: 0.9 } },
      { label: 'Тянусь вперёд', c: 'm3', state: { tau: 30 * DEG, p: 0.2 } },
      { label: 'Откидываюсь назад', state: { tau: -22 * DEG, p: 0.95 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = Math.round(r.tau / DEG);
      const main = r.p > 0.6
        ? 'Рукоять у живота — <b class="c-m1">спина</b> держит плечи отведёнными назад, лопатки сведены.'
        : 'Руки вытянуты к блоку — спина растянута, плечо рычага у плеча маленькое.';
      const lean = deg > 12
        ? `<b>Наклон вперёд на ${deg}°.</b> <b class="c-m3">Поясница</b> держит и трос, и вес корпуса. Растяжка широчайших приятная, но тянуть так тяжёлый вес — риск для спины.`
        : deg < -10
          ? `<b>Отклон назад на ${-deg}°.</b> Корпус своим весом помогает тянуть — это читинг. Поясница отдыхает, работа уходит из спины.`
          : '<b>Корпус ровно.</b> Трос тянет на высоте живота — поясница держит небольшой момент.';
      const warnings = [];
      if (deg > 25 && r.p < 0.4) warnings.push('<strong>Сильный наклон к блоку.</strong> Следи, чтобы поясница не округлялась.');
      return {
        loads: { s: r.Ms, l: r.Ml, b: r.Mb },
        nums: [
          ['Плечо для поясницы', cm(r.armL)],
          ['Наклон корпуса', `${deg}°`],
          ['Рукоять', `${Math.round(r.p * 100)}%`],
          ['Вес на тросе', `${KG} кг`],
        ],
        notes: [['m1', main], ['m3', lean]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['cable-row'] = { model, page };
})(window);
