/* Сгибания на бицепс с гантелью: вид сбоку, человек смотрит вправо (+x).
   Ты двигаешь гантель (угол в локте) и сам локоть (положение плеча).
   График справа — нагрузка на бицепс по всей амплитуде. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, clamp, comb, angleAt, openingMoment, makeView, fromAngle } = global.Bio;

  const L = { upperArm: 0.3, foreArm: 0.3, torso: 0.52, headR: 0.1 };
  const W = { torso: 0.25, neck: 0.08, thigh: 0.165, upperArm: 0.09, foreArm: 0.075 };
  const G = 9.81;
  const KG = 15;
  const Sh = v(0, 0);
  const AL_MIN = -40 * DEG, AL_MAX = 70 * DEG;   // плечо: назад … вперёд
  const TH_MIN = 8 * DEG, TH_MAX = 150 * DEG;    // сгибание в локте
  const REF = KG * G * L.foreArm;

  const VIEW = makeView(330, 300, 520);
  const CH = { x: 640, y: 40, w: 330, h: 190 }; // график, координаты сцены

  // Направление плеча: вниз, повернуть на alpha вперёд
  const udir = (al) => v(Math.sin(al), -Math.cos(al));
  const rot = (a, t) => v(a.x * Math.cos(t) - a.y * Math.sin(t), a.x * Math.sin(t) + a.y * Math.cos(t));

  function arm(al, th) {
    const u = udir(al);
    const E = add(Sh, mul(u, L.upperArm));
    const fd = rot(u, th);
    const Hd = add(E, mul(fd, L.foreArm));
    return { E, Hd, u, fd };
  }
  const biceps = (al, th) => {
    const { E, Hd } = arm(al, th);
    return Math.max(openingMoment(E, Sh, Hd, v(0, -KG * G)), 0);
  };

  function solve(st) {
    const a = arm(st.al, st.th);
    const Mb = biceps(st.al, st.th);
    const Md = KG * G * (a.Hd.x - Sh.x);
    let peak = 0, peakTh = 0;
    const curve = [];
    for (let t = TH_MIN; t <= TH_MAX + 1e-9; t += 2 * DEG) {
      const m = biceps(st.al, t);
      curve.push([t, m]);
      if (m > peak) { peak = m; peakTh = t; }
    }
    return {
      ...st, ...a, Mb, Md, curve, peakTh, armB: Mb / (KG * G),
      bI: clamp(Mb / REF, 0, 1), dI: clamp(Md / (REF * 1.4), 0, 1),
    };
  }

  function drawStatic({ D }) {
    // корпус и голова неподвижны
    const H = v(-0.04, -L.torso);
    const S = v(-0.03, 0.02);
    const head = v(0.0, 0.2);
    const fr = v(1, 0), up = v(0, 1);
    return D.figure([[
      D.part('thigh', H, v(-0.02, -0.95), fr), D.part('torso', H, S, fr),
      D.part('neck', S, v(-0.01, 0.15), fr), D.head(head, up, fr),
    ]]);
  }

  function chart(r) {
    const { x, y, w, h } = CH;
    const max = REF * 1.02;
    const px = (t) => x + 34 + ((t - TH_MIN) / (TH_MAX - TH_MIN)) * (w - 50);
    const py = (m) => y + h - 30 - (m / max) * (h - 60);
    const pts = r.curve.map(([t, m]) => `${px(t).toFixed(1)},${py(m).toFixed(1)}`).join(' ');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" class="chart-bg"/>` +
      `<line x1="${x + 34}" y1="${y + h - 30}" x2="${x + w - 14}" y2="${y + h - 30}" class="chart-axis"/>` +
      `<line x1="${x + 34}" y1="${y + 24}" x2="${x + 34}" y2="${y + h - 30}" class="chart-axis"/>` +
      `<text x="${x + 34}" y="${y + 17}" class="chart-lbl">нагрузка на бицепс</text>` +
      `<text x="${x + 34}" y="${y + h - 10}" class="chart-lbl">рука прямая</text>` +
      `<text x="${x + w - 14}" y="${y + h - 10}" class="chart-lbl" text-anchor="end">согнута</text>` +
      `<polyline points="${pts}" class="chart-curve"/>` +
      `<circle cx="${px(r.th).toFixed(1)}" cy="${py(r.Mb).toFixed(1)}" r="8" class="chart-dot"/>`;
  }

  function draw(r, { D, uid, mini }) {
    const { E, Hd, u, fd } = r;
    let n = perp(u);
    if (n.x * fd.x + n.y * fd.y < 0) n = mul(n, -1); // передняя сторона плеча
    let out = D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, Hd)), D.part('foreArm', E, Hd, D.toward(E, Hd, Sh)), D.disc(Hd, 0.045)]]);
    out += D.muscleLens(Sh, E, n, 0.07, 0.25, 0.1, 0.025, 'mu-m1', r.bI, uid);
    out += D.muscleEll(comb(Sh, [v(1, 0), 0.045], [v(0, 1), -0.01]), 0.035, 0.055, null, 'mu-m2', r.dI, uid);
    // гантель
    const g = perp(fd);
    out += D.ln(add(Hd, mul(g, -0.09)), add(Hd, mul(g, 0.09)), 'm-sled', D.px(0.03));
    out += D.ellipse(add(Hd, mul(g, -0.09)), 0.035, 0.075, g, 'm-weight') + D.ellipse(add(Hd, mul(g, 0.09)), 0.035, 0.075, g, 'm-weight');
    out += D.bones([[Sh, E], [E, Hd]]) + D.joints([Sh, E]);
    if (!mini) {
      out += D.ln(v(Hd.x, Hd.y + 0.25), v(Hd.x, Math.min(Hd.y, E.y) - 0.25), 'fline');
      out += D.lever(E, Hd, v(0, -1), r.armB, 'm1', { labelOff: 0.05 });
      out += chart(r);
    }
    out += D.arrow(add(Hd, v(0, -0.06)), add(Hd, v(0, -0.3)), 'ar-force', 6);
    return out;
  }

  const hp = {
    db: (r) => add(r.Hd, mul(r.fd, 0.12)),
    elbow: (r) => add(r.E, mul(r.u, 0.0)),
  };

  function notes(r) {
    return [
      { lines: ['тяни: гантель', '(сгибай руку)'], x: 700, y: 345, from: [705, 365], to: hp.db(r), circle: 26, bend: 0.3 },
      { lines: ['тяни: локоть', 'вперёд / назад'], x: 30, y: 560, from: [130, 545], to: hp.elbow(r), circle: 26, bend: -0.3 },
      { lines: ['цветной отрезок —', 'плечо рычага у локтя'], x: 640, y: 560, from: [660, 545], to: v((r.E.x + r.Hd.x) / 2, r.E.y), bend: 0.3, gap: 8 },
      { lines: ['график: где тяжелее всего.', 'точка — ты сейчас'], x: 640, y: 258, from: null },
      { lines: ['светится —', 'значит работает'], x: 30, y: 40, from: [110, 70], to: comb(r.E, [r.u, -0.12]), bend: 0.25, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'db', label: 'Угол сгибания в локте', pausesPlay: true,
      pos: hp.db, axis: (r) => perp(r.fd),
      drag: (st, w) => {
        const E = add(Sh, mul(udir(st.al), L.upperArm));
        const d = sub(w, E);
        const u = udir(st.al);
        st.th = Math.atan2(u.x * d.y - u.y * d.x, u.x * d.x + u.y * d.y);
        if (st.th < 0) st.th = st.th < -Math.PI / 2 ? TH_MAX : TH_MIN;
      },
      step: (st, dir, k) => { st.th += dir * 3 * DEG * k; },
      value: (r) => ({ text: `сгибание ${Math.round(r.th / DEG)}°`, now: r.th / DEG, min: 8, max: 150 }),
    },
    {
      key: 'elbow', label: 'Положение локтя: впереди или позади корпуса',
      pos: hp.elbow, axis: (r) => perp(r.u),
      drag: (st, w) => { st.al = Math.atan2(w.x - Sh.x, Sh.y - w.y); },
      step: (st, dir, k) => { st.al += dir * 3 * DEG * k; },
      value: (r) => ({ text: `локоть ${r.al > 8 * DEG ? 'впереди' : r.al < -8 * DEG ? 'позади' : 'у корпуса'}`, now: r.al / DEG, min: -40, max: 70 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '40 20 680 600',
    period: 3,
    initial: () => ({ al: 0, th: 80 * DEG }),
    clamp(st) { st.al = clamp(st.al, AL_MIN, AL_MAX); st.th = clamp(st.th, TH_MIN, TH_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * (st.th - TH_MIN) / (TH_MAX - TH_MIN), -1, 1)),
    animate(st, ph, { mini }) {
      st.th = TH_MIN + 6 * DEG + (TH_MAX - TH_MIN - 12 * DEG) * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.al = 20 * Math.sin(ph * 0.21) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 'b', name: 'Бицепс', c: 'm1' },
      { key: 'd', name: 'Передняя дельта', c: 'm2' },
    ],
    slider: {
      label: 'Где локоть', left: 'Позади · наклонная скамья', right: 'Впереди · скамья Скотта', lc: 'm1', rc: 'm2',
      get: (r) => ((r.al - AL_MIN) / (AL_MAX - AL_MIN)) * 100,
      set: (x) => ({ al: AL_MIN + (x / 100) * (AL_MAX - AL_MIN) }),
    },
    presets: [
      { label: 'Наклонная скамья', c: 'm1', state: { al: -35 * DEG, th: 60 * DEG } },
      { label: 'Скамья Скотта', c: 'm2', state: { al: 50 * DEG, th: 40 * DEG } },
      { label: 'Стоя, локоть у корпуса', state: { al: 0, th: 80 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const peakDeg = Math.round(r.peakTh / DEG);
      const where = peakDeg < 55 ? 'в нижней части' : peakDeg > 110 ? 'в верхней части' : 'в середине';
      const curve = `Тяжелее всего — <b class="c-m1">${where} движения</b> (локоть согнут на ${peakDeg}°): там предплечье горизонтально, и плечо рычага максимальное.`;
      const pos = r.al > 25 * DEG
        ? '<b>Локоть впереди</b>, как на скамье Скотта. Пик нагрузки смещается вниз, а вверху бицепс почти отдыхает.'
        : r.al < -15 * DEG
          ? '<b>Локоть позади корпуса</b>, как на наклонной скамье. Внизу бицепс сильно растянут, пик нагрузки — в середине и выше.'
          : '<b>Локоть у корпуса</b> — классические сгибания стоя. Пик ровно посередине.';
      const now = r.Mb < 0.02 * REF
        ? 'Сейчас гантель висит почти под локтем — бицепсу нечего держать.'
        : `Сейчас плечо рычага ${cm(r.armB)} — бицепс держит ${Math.round((r.Mb / REF) * 100)}% от максимума.`;
      const warnings = [];
      if (r.al > 45 * DEG && r.th < 25 * DEG) warnings.push('<strong>Внизу на скамье Скотта</strong> бицепс растянут и нагружен одновременно. Не бросай вес в нижней точке.');
      return {
        loads: { b: r.Mb, d: Math.max(r.Md, 0) },
        nums: [
          ['Плечо у локтя', cm(r.armB)],
          ['Угол в локте', deg(Math.PI - r.th)],
          ['Пик нагрузки', `при ${peakDeg}°`],
          ['Положение плеча', `${Math.round(r.al / DEG)}°`],
        ],
        notes: [['m1', curve], ['f', pos], ['f', now]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.curl = { model, page };
})(window);
