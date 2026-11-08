/* Жим лёжа: вид со стороны головы (фронтальная плоскость).
   На каждую руку — половина веса штанги, сила тяжести тянет строго вниз.
   Грудь держит плечо, если кисть шире плеча; трицепс — если кисть внутри локтя. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, clamp, lerp, comb, ik2, angleAt, makeView, len } = global.Bio;

  const L = { upperArm: 0.3, foreArm: 0.27 };
  const W = { upperArm: 0.09, foreArm: 0.075 };
  const G = 9.81;
  const BAR_KG = 80;
  const SH = 0.19;              // половина ширины плеч
  const GW_MIN = 0.2, GW_MAX = 0.46;
  const Y_LOW = 0.135;          // штанга на груди
  const FLOOR = -0.62;
  const REACH = L.upperArm + L.foreArm - 0.005;
  const REF = 0.22 * BAR_KG * G / 2;

  const VIEW = makeView(500, 382, 440);
  const yTop = (gw) => Math.sqrt(Math.max(REACH * REACH - (gw - SH) ** 2, 0.04));

  function arm(side, gw, y) {
    const S = v(side * SH, 0);
    const Hd = v(side * gw, y);
    const e1 = ik2(S, Hd, L.upperArm, L.foreArm, 1);
    const e2 = ik2(S, Hd, L.upperArm, L.foreArm, -1);
    const E = side * e1.x > side * e2.x ? e1 : e2; // локоть снаружи
    return { S, E, Hd };
  }

  function solve(st) {
    const top = yTop(st.gw);
    const y = lerp(top, Y_LOW, st.d);
    const R = arm(1, st.gw, y);
    const Lf = arm(-1, st.gw, y);
    const w = (BAR_KG * G) / 2;
    const Ms = w * (R.Hd.x - R.S.x);   // грудь + передняя дельта
    const Me = w * (R.E.x - R.Hd.x);   // трицепс
    return {
      ...st, y, R, Lf, Ms, Me,
      elbow: angleAt(R.S, R.E, R.Hd),
      forearmTilt: Math.atan2(R.Hd.x - R.E.x, R.Hd.y - R.E.y),
      cI: clamp(Ms / REF, 0, 1), tI: clamp(Me / REF, 0, 1),
    };
  }

  function drawStatic({ D }) {
    const { ln, px } = D;
    return [
      ln(v(-1.05, FLOOR), v(1.05, FLOOR), 'm-base', px(0.03)),
      ln(v(-0.12, -0.2), v(-0.16, FLOOR), 'm-frame', px(0.04)),
      ln(v(0.12, -0.2), v(0.16, FLOOR), 'm-frame', px(0.04)),
      D.poly([v(-0.16, -0.13), v(0.16, -0.13), v(0.15, -0.21), v(-0.15, -0.21)], 'm-bench'),
    ].join('');
  }

  function barbell(y, D) {
    const { ln, px } = D;
    let s = ln(v(-0.98, y), v(0.98, y), 'm-sled', px(0.03));
    for (const sd of [-1, 1]) {
      s += D.poly([v(sd * 0.66, y - 0.225), v(sd * 0.66, y + 0.225), v(sd * 0.73, y + 0.225), v(sd * 0.73, y - 0.225)], 'm-weight');
      s += D.poly([v(sd * 0.74, y - 0.16), v(sd * 0.74, y + 0.16), v(sd * 0.78, y + 0.16), v(sd * 0.78, y - 0.16)], 'm-weight');
      s += ln(v(sd * 0.62, y - 0.05), v(sd * 0.62, y + 0.05), 'm-sled', px(0.03));
    }
    return s;
  }

  function draw(r, { D, uid, mini }) {
    const { R, Lf } = r;
    let out = '';
    // корпус в разрезе, голова, руки
    const torso = D.blob([
      v(0, 0.105), v(0.17, 0.085), v(0.25, 0.02), v(0.235, -0.07), v(0.15, -0.14),
      v(0, -0.155), v(-0.15, -0.14), v(-0.235, -0.07), v(-0.25, 0.02), v(-0.17, 0.085),
    ]);
    const arms = [];
    for (const A of [Lf, R]) {
      arms.push(D.part('upperArm', A.S, A.E, D.toward(A.S, A.E, A.Hd)), D.part('foreArm', A.E, A.Hd, D.toward(A.E, A.Hd, A.S)), D.disc(A.Hd, 0.045));
    }
    out += D.figure([[torso, D.disc(R.S, 0.075), D.disc(Lf.S, 0.075)], arms, [D.disc(v(0, -0.035), 0.1)]]);
    // мышцы
    for (const sd of [-1, 1]) {
      out += D.muscleEll(v(sd * 0.115, 0.02), 0.1, 0.055, null, 'mu-m1', r.cI, uid);
      const A = sd > 0 ? R : Lf;
      const dU = norm(sub(A.E, A.S));
      let n = perp(dU);
      if (n.y > 0) n = mul(n, -1); // нижняя / внешняя сторона плеча
      out += D.muscleLens(A.S, A.E, n, 0.07, 0.22, 0.08, 0.02, 'mu-m2', r.tI, uid);
    }
    out += barbell(r.y, D);
    out += D.bones([[R.S, R.E], [R.E, R.Hd], [Lf.S, Lf.E], [Lf.E, Lf.Hd]]);
    out += D.joints([R.S, R.E, Lf.S, Lf.E]);
    if (!mini) {
      out += D.ln(v(R.Hd.x, r.y + 0.1), v(R.Hd.x, Math.min(R.E.y, R.S.y) - 0.12), 'fline');
      out += D.lever(R.S, R.Hd, v(0, -1), R.Hd.x - R.S.x, 'm1', { labelOff: 0.045 });
      out += D.lever(R.E, R.Hd, v(0, -1), R.E.x - R.Hd.x, 'm2', { labelOff: 0.045 });
    }
    for (const A of [R, Lf]) out += D.arrow(add(A.Hd, v(0, 0.05)), add(A.Hd, v(0, -0.22)), 'ar-force', 6);
    out += D.arrow(v(0, -0.45), v(0, -0.22), 'ar-react', 6);
    return out;
  }

  const hp = {
    grip: (r) => v(r.R.Hd.x + 0.1, r.y),
    bar: (r) => v(0, r.y),
  };

  function notes(r) {
    return [
      { lines: ['тяни: хват', 'уже / шире'], x: 800, y: 470, from: [850, 450], to: hp.grip(r), circle: 26, bend: 0.25 },
      { lines: ['тяни: штанга', 'вверх / вниз'], x: 30, y: 30, from: [160, 60], to: hp.bar(r), circle: 26, bend: -0.25 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 690, y: 610, from: [700, 600], to: v((r.R.S.x + r.R.Hd.x) / 2, r.R.S.y), bend: -0.3, gap: 8 },
      { lines: ['светится —', 'значит работает'], x: 30, y: 560, from: [130, 545], to: v(-0.16, 0.0), bend: -0.3, gap: 8 },
      { lines: ['скамья держит спину'], x: 250, y: 680, from: [400, 660], toXY: [VIEW.x(v(-0.02, 0)), VIEW.y(v(0, -0.4))], bend: -0.3, gap: 6 },
    ];
  }

  const handles = [
    {
      key: 'grip', label: 'Ширина хвата',
      pos: hp.grip, axis: () => v(1, 0),
      drag: (st, w) => { st.gw = w.x - 0.1; },
      step: (st, dir, k) => { st.gw += dir * 0.01 * k; },
      value: (r) => ({ text: `хват ${Math.round(r.gw * 200)} см`, now: ((r.gw - GW_MIN) / (GW_MAX - GW_MIN)) * 100 }),
    },
    {
      key: 'bar', label: 'Высота штанги', pausesPlay: true,
      pos: hp.bar, axis: () => v(0, 1),
      drag: (st, w) => { const t = yTop(st.gw); st.d = (t - w.y) / (t - Y_LOW); },
      step: (st, dir, k) => { st.d -= dir * 0.03 * k; },
      value: (r) => ({ text: `штанга на ${Math.round((1 - r.d) * 100)}% от груди до верха`, now: (1 - r.d) * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '40 0 920 700',
    period: 3,
    initial: () => ({ gw: 0.36, d: 0.55 }),
    clamp(st) { st.gw = clamp(st.gw, GW_MIN, GW_MAX); st.d = clamp(st.d, 0, 1); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.d, -1, 1)),
    animate(st, ph, { mini }) {
      st.d = 0.03 + 0.94 * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.gw = 0.33 + 0.11 * Math.sin(ph * 0.23);
    },
  };

  const page = {
    muscles: [
      { key: 'c', name: 'Грудь и передняя дельта', c: 'm1' },
      { key: 't', name: 'Трицепс', c: 'm2' },
    ],
    slider: {
      label: 'Ширина хвата', left: 'Узкий · трицепс', right: 'Широкий · грудь', lc: 'm2', rc: 'm1',
      get: (r) => ((r.gw - GW_MIN) / (GW_MAX - GW_MIN)) * 100,
      set: (x) => ({ gw: GW_MIN + (x / 100) * (GW_MAX - GW_MIN) }),
    },
    presets: [
      { label: 'Узкий хват', c: 'm2', state: { gw: 0.22, d: 0.7 } },
      { label: 'Предплечья вертикально', c: 'm1', state: { gw: 0.4, d: 0.8 } },
      { label: 'Сбросить', state: { gw: 0.36, d: 0.55 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const tilt = (r.R.Hd.x - r.R.E.x);
      const forearm = Math.abs(tilt) < 0.025
        ? '<b>Предплечья вертикальны.</b> Вес давит прямо вдоль них — локтю нечего сгибать, <b class="c-m2">трицепс</b> почти отдыхает.'
        : tilt < 0
          ? '<b>Кисти внутри локтей.</b> Вес сгибает локти — работает <b class="c-m2">трицепс</b>.'
          : '<b>Кисти шире локтей.</b> Вес раскрывает руку наружу. Так руку держать неудобно — обычно локти сами уходят шире.';
      const chest = r.Ms < 0.05 * BAR_KG * G
        ? 'Кисть почти над плечом — <b class="c-m1">груди</b> в этой плоскости нечего держать.'
        : `Кисть на ${cm(r.R.Hd.x - r.R.S.x)} шире плеча — это плечо рычага для <b class="c-m1">груди</b>.`;
      const depth = r.d > 0.85
        ? 'Внизу локти уходят ниже скамьи — грудь сильнее растянута.'
        : r.d < 0.15 ? 'Наверху руки почти прямые: плечи рычагов минимальны, держать вес легче всего.'
          : 'Середина амплитуды.';
      const warnings = [];
      if (r.gw > 0.43) warnings.push('<strong>Очень широкий хват.</strong> Плечевой сустав под большой нагрузкой — плечам это часто не нравится.');
      return {
        loads: { c: r.Ms, t: r.Me },
        nums: [
          ['Плечо у плечевого сустава', cm(r.R.Hd.x - r.R.S.x)],
          ['Плечо у локтя', r.Me < 0 ? 'с другой стороны' : cm(r.R.E.x - r.R.Hd.x)],
          ['Ширина хвата', Math.round(r.gw * 200) + ' см'],
          ['Угол в локте', deg(r.elbow)],
        ],
        notes: [['m1', chest], ['m2', forearm], ['f', depth]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['bench-press'] = { model, page };
})(window);
