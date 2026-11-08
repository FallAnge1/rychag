/* Французский жим (разгибание руки с гантелью из-за головы): вид сбоку, лицом вправо (+x).
   Плечо смотрит вверх. Ты двигаешь гантель (угол в локте) и наклон плеча. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, perp, clamp, cross, openingMoment, makeView } = global.Bio;

  const L = { upperArm: 0.3, foreArm: 0.3 };
  const G = 9.81;
  const KG = 12;
  const W = KG * G;
  const Sh = v(0, 0);
  const BE_MIN = -20 * DEG, BE_MAX = 60 * DEG;   // плечо: за голову … вперёд
  const TH_MIN = 10 * DEG, TH_MAX = 150 * DEG;
  const REF = W * L.foreArm;

  const VIEW = makeView(400, 420, 440);
  const CH = { x: 650, y: 40, w: 320, h: 190 };
  const CHM = { x: 180, y: 850, w: 500, h: 150 };                 // график под фигурой на телефоне
  const box = (ctx) => (ctx && ctx.narrow ? CHM : CH);

  const udir = (be) => v(Math.sin(be), Math.cos(be));   // плечо смотрит вверх
  const rot = (a, t) => v(a.x * Math.cos(t) - a.y * Math.sin(t), a.x * Math.sin(t) + a.y * Math.cos(t));

  function arm(be, th) {
    const u = udir(be);
    const E = add(Sh, mul(u, L.upperArm));
    const fd = rot(u, th);                            // сгибание уводит кисть за голову
    const Hd = add(E, mul(fd, L.foreArm));
    return { u, E, fd, Hd };
  }
  const triceps = (be, th) => {
    const a = arm(be, th);
    return Math.max(-openingMoment(a.E, Sh, a.Hd, v(0, -W)), 0);
  };

  function solve(st) {
    const a = arm(st.be, st.th);
    const Mt = triceps(st.be, st.th);
    const Mlat = Math.max(W * (Sh.x - a.Hd.x), 0);   // гантель за плечом тянет руку назад
    const Md = Math.max(W * (a.Hd.x - Sh.x), 0);     // гантель впереди тянет руку вперёд-вниз
    const curve = [];
    let peak = 0, peakTh = 0;
    for (let t = TH_MIN; t <= TH_MAX + 1e-9; t += 3 * DEG) {
      const m = triceps(st.be, t);
      curve.push([t, m]);
      if (m > peak) { peak = m; peakTh = t; }
    }
    return {
      ...st, ...a, Mt, Mlat, Md, curve, peakTh,
      armE: Math.abs(a.Hd.x - a.E.x),
      stretch: clamp((st.th / TH_MAX) * (1 - (st.be - BE_MIN) / (BE_MAX - BE_MIN) * 0.6), 0, 1),
      tI: clamp(Mt / REF, 0, 1), lI: clamp(Mlat / (REF * 1.6), 0, 1), dI: clamp(Md / (REF * 1.6), 0, 1),
    };
  }

  function drawStatic({ D }) {
    const H = v(-0.04, -0.52), S = v(-0.03, 0.02), head = v(0.04, 0.2);
    const fr = v(1, 0), up = v(0, 1);
    return D.figure([[D.part('thigh', H, v(-0.02, -0.95), fr), D.part('torso', H, S, fr),
      D.part('neck', S, v(0.0, 0.15), fr), D.head(head, up, fr)]]);
  }

  function draw(r, ctx) {
    const { D, uid, mini } = ctx;
    const { E, Hd, u, fd } = r;
    let out = D.muscleLens(v(-0.07, -0.4), v(-0.07, -0.06), v(-1, 0), 0.07, 0.05, 0.05, 0.03, 'mu-m1', r.lI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, Hd)), D.part('foreArm', E, Hd, D.toward(E, Hd, Sh)), D.disc(Hd, 0.045)]]);
    let n = perp(u);
    if (dot(n, fd) > 0) n = mul(n, -1);               // задняя сторона плеча
    out += D.muscleLens(Sh, E, n, 0.07, 0.15, 0.1, 0.02, 'mu-m2', r.tI, uid);
    out += D.muscleEll(add(Sh, v(0.05, 0.0)), 0.035, 0.05, null, 'mu-m3', r.dI, uid);
    // гантель
    const g = perp(fd);
    out += D.ln(add(Hd, mul(g, -0.08)), add(Hd, mul(g, 0.08)), 'm-sled', D.px(0.03));
    out += D.ellipse(add(Hd, mul(g, -0.08)), 0.03, 0.07, g, 'm-weight') + D.ellipse(add(Hd, mul(g, 0.08)), 0.03, 0.07, g, 'm-weight');
    out += D.joints([Sh, E]);
    if (!mini) {
      out += D.ln(v(Hd.x, Hd.y + 0.2), v(Hd.x, Math.min(Hd.y, E.y) - 0.3), 'fline');
      out += D.lever(E, Hd, v(0, -1), r.armE, 'm2', { labelOff: 0.05 });
      out += D.chart({ ...box(ctx), title: 'нагрузка на трицепс', left: 'рука прямая', right: 'согнута', curve: r.curve, tMin: TH_MIN, tMax: TH_MAX, max: REF * 1.05, cur: [r.th, r.Mt], c: 'm2' });
    }
    out += D.arrow(add(Hd, v(0, -0.08)), add(Hd, v(0, -0.32)), 'ar-force', 6);
    return out;
  }

  const hp = {
    db: (r) => add(r.Hd, mul(r.fd, 0.12)),
    elbow: (r) => r.E,
  };

  function notes(r, ctx) {
    return [
      { lines: ['тяни: гантель', '(сгибай руку)'], x: 30, y: 60, from: [140, 95], to: hp.db(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: локоть', 'вперёд / назад'], x: 680, y: 330, from: [690, 355], to: hp.elbow(r), circle: 26, bend: 0.3 },
      { lines: ['график: где тяжелее всего.', 'точка — ты сейчас'], x: box(ctx).x, y: box(ctx).y - 22, from: null },
      { lines: ['светится —', 'значит работает'], x: 30, y: 520, from: [130, 505], to: add(Sh, mul(r.u, 0.15)), bend: -0.25, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'db', label: 'Угол в локте', pausesPlay: true,
      pos: hp.db, axis: (r) => perp(r.fd),
      drag: (st, w) => {
        const u = udir(st.be);
        const d = sub(w, add(Sh, mul(u, L.upperArm)));
        st.th = Math.atan2(cross(u, d), dot(u, d));
        if (st.th < 0) st.th = st.th < -Math.PI / 2 ? TH_MAX : TH_MIN;
      },
      step: (st, dir, k) => { st.th += dir * 3 * DEG * k; },
      value: (r) => ({ text: `сгибание ${Math.round(r.th / DEG)}°`, now: r.th / DEG, min: 10, max: 150 }),
    },
    {
      key: 'elbow', label: 'Наклон плеча: за голову или вперёд',
      pos: hp.elbow, axis: (r) => perp(r.u),
      drag: (st, w) => { st.be = Math.atan2(w.x - Sh.x, w.y - Sh.y); },
      step: (st, dir, k) => { st.be += dir * 3 * DEG * k; },
      value: (r) => ({ text: `плечо наклонено на ${Math.round(r.be / DEG)}°`, now: r.be / DEG, min: -20, max: 60 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '120 0 600 724',
    mobileViewBox: '160 110 540 900',
    period: 3,
    initial: () => ({ be: 5 * DEG, th: 90 * DEG }),
    clamp(st) { st.be = clamp(st.be, BE_MIN, BE_MAX); st.th = clamp(st.th, TH_MIN, TH_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * (st.th - TH_MIN) / (TH_MAX - TH_MIN), -1, 1)),
    animate(st, ph, { mini }) {
      st.th = TH_MIN + 6 * DEG + (TH_MAX - TH_MIN - 12 * DEG) * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.be = (10 + 20 * Math.sin(ph * 0.21)) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 't', name: 'Трицепс', c: 'm2' },
      { key: 'l', name: 'Широчайшие (держат руку)', c: 'm1' },
      { key: 'd', name: 'Передняя дельта', c: 'm3' },
    ],
    slider: {
      label: 'Где локоть', left: 'Строго вверх · растяжение', right: 'Вперёд · легче внизу', lc: 'm2', rc: 'm3',
      get: (r) => ((r.be - BE_MIN) / (BE_MAX - BE_MIN)) * 100,
      set: (x) => ({ be: BE_MIN + (x / 100) * (BE_MAX - BE_MIN) }),
    },
    presets: [
      { label: 'Из-за головы стоя', c: 'm2', state: { be: 0, th: 110 * DEG } },
      { label: 'Как лёжа (локоть вперёд)', c: 'm3', state: { be: 45 * DEG, th: 90 * DEG } },
      { label: 'Сбросить', state: { be: 5 * DEG, th: 90 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const peak = Math.round(r.peakTh / DEG);
      const where = peak > 110 ? 'в нижней точке, когда гантель глубоко за головой' : peak < 60 ? 'ближе к выпрямлению' : 'в середине движения';
      const main = `Тяжелее всего для <b class="c-m2">трицепса</b> — ${where} (${peak}°).`;
      const stretch = r.be < 20 * DEG && r.th > 100 * DEG
        ? '<b>Плечо над головой, локоть согнут</b> — длинная головка трицепса максимально растянута и нагружена. За это французский жим и ценят.'
        : r.be > 35 * DEG
          ? '<b>Локоть вынесен вперёд</b>, как в жиме лёжа. Длинная головка растянута меньше, а пик нагрузки сдвигается.'
          : 'Длинная головка трицепса растянута, потому что плечо поднято вверх.';
      const sh = r.Mlat > r.Md
        ? 'Гантель за плечом тянет руку назад — <b class="c-m1">широчайшие</b> растягиваются и держат плечо.'
        : 'Гантель впереди плеча — руку удерживает <b class="c-m3">передняя дельта</b>.';
      const warnings = [];
      if (r.be < -10 * DEG && r.th > 130 * DEG) warnings.push('<strong>Очень глубоко за головой.</strong> Локоть и плечо под сильным растяжением — не бросай вес внизу.');
      return {
        loads: { t: r.Mt, l: r.Mlat, d: r.Md },
        nums: [
          ['Плечо у локтя', cm(r.armE)],
          ['Угол в локте', `${Math.round(180 - r.th / DEG)}°`],
          ['Пик нагрузки', `при ${peak}°`],
          ['Наклон плеча', `${Math.round(r.be / DEG)}°`],
        ],
        notes: [['m2', main], ['f', stretch], ['f', sh]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['overhead-extension'] = { model, page };
})(window);
