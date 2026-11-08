/* Разгибание рук на трицепс у верхнего блока (канат): вид сбоку, лицом к блоку (+x).
   Трос тянет кисть к блоку. Ты двигаешь кисть (угол в локте) и положение локтя. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, norm, perp, clamp, cross, openingMoment, makeView } = global.Bio;

  const L = { upperArm: 0.3, foreArm: 0.3 };
  const G = 9.81;
  const KG = 15;
  const T = KG * G;
  const Sh = v(0, 0);
  const P = v(0.46, 0.78);                       // верхний блок
  const AL_MIN = -15 * DEG, AL_MAX = 50 * DEG;   // локоть: чуть позади … впереди
  const TH_MIN = 5 * DEG, TH_MAX = 135 * DEG;    // сгибание в локте
  const REF = T * L.foreArm;

  const VIEW = makeView(330, 300, 500);
  const CH = { x: 650, y: 400, w: 320, h: 190 };
  const CHM = { x: 150, y: 830, w: 520, h: 160 };                 // график под фигурой на телефоне
  const box = (ctx) => (ctx && ctx.narrow ? CHM : CH);

  const udir = (al) => v(Math.sin(al), -Math.cos(al));
  const rot = (a, t) => v(a.x * Math.cos(t) - a.y * Math.sin(t), a.x * Math.sin(t) + a.y * Math.cos(t));

  function arm(al, th) {
    const u = udir(al);
    const E = add(Sh, mul(u, L.upperArm));
    const fd = rot(u, th);
    const Hd = add(E, mul(fd, L.foreArm));
    const dir = norm(sub(P, Hd));
    return { u, E, fd, Hd, dir, F: mul(dir, T) };
  }
  const triceps = (al, th) => {
    const a = arm(al, th);
    return Math.max(-openingMoment(a.E, Sh, a.Hd, a.F), 0);
  };

  function solve(st) {
    const a = arm(st.al, st.th);
    const Mt = triceps(st.al, st.th);
    const Ms = Math.max(openingMoment(Sh, add(Sh, v(0, -1)), a.Hd, a.F), 0); // трос тянет руку вперёд-вверх
    const curve = [];
    let peak = 0, peakTh = 0;
    for (let t = TH_MIN; t <= TH_MAX + 1e-9; t += 3 * DEG) {
      const m = triceps(st.al, t);
      curve.push([t, m]);
      if (m > peak) { peak = m; peakTh = t; }
    }
    return {
      ...st, ...a, Mt, Ms, curve, peakTh,
      armE: Math.abs(cross(a.dir, sub(a.E, a.Hd))),
      tI: clamp(Mt / REF, 0, 1), sI: clamp(Ms / (REF * 1.4), 0, 1),
    };
  }

  function drawStatic({ D }) {
    const H = v(-0.04, -0.52), S = v(-0.03, 0.02), head = v(0.0, 0.2);
    const fr = v(1, 0), up = v(0, 1);
    return D.ln(v(0.62, -1.2), v(0.62, P.y), 'm-frame', D.px(0.03)) +
      D.ln(v(0.62, P.y), P, 'm-frame', D.px(0.03)) +
      D.circ(P, D.px(0.045), 'm-weight') +
      D.figure([[D.part('thigh', H, v(-0.02, -0.95), fr), D.part('torso', H, S, fr),
        D.part('neck', S, v(-0.01, 0.15), fr), D.head(head, up, fr)]]);
  }

  function draw(r, ctx) {
    const { D, uid, mini } = ctx;
    const { E, Hd, u, fd } = r;
    let out = D.ln(P, Hd, 'cable');
    out += D.muscleLens(v(-0.07, -0.42), v(-0.07, -0.08), v(-1, 0), 0.07, 0.05, 0.05, 0.03, 'mu-m1', r.sI, uid);
    out += D.figure([[D.part('upperArm', Sh, E, D.toward(Sh, E, Hd)), D.part('foreArm', E, Hd, D.toward(E, Hd, Sh)), D.disc(Hd, 0.045)]]);
    let n = perp(u);
    if (dot(n, fd) > 0) n = mul(n, -1);            // задняя сторона плеча
    out += D.muscleLens(Sh, E, n, 0.065, 0.2, 0.1, 0.02, 'mu-m2', r.tI, uid);
    // канат: два хвоста вниз от кисти
    out += D.ln(Hd, add(Hd, v(-0.035, -0.09)), 'cable') + D.ln(Hd, add(Hd, v(0.035, -0.09)), 'cable');
    out += D.joints([Sh, E]);
    if (!mini) {
      out += D.ln(add(Hd, mul(r.dir, -0.25)), P, 'fline');
      out += D.lever(E, Hd, r.dir, r.armE, 'm2', { labelOff: 0.05 });
      out += D.chart({ ...box(ctx), title: 'нагрузка на трицепс', left: 'рука прямая', right: 'согнута', curve: r.curve, tMin: TH_MIN, tMax: TH_MAX, max: REF * 1.05, cur: [r.th, r.Mt], c: 'm2' });
    }
    out += D.arrow(add(Hd, mul(r.dir, 0.05)), add(Hd, mul(r.dir, 0.28)), 'ar-force', 6);
    return out;
  }

  const hp = {
    hand: (r) => add(r.Hd, mul(r.fd, 0.12)),
    elbow: (r) => r.E,
  };

  function notes(r, ctx) {
    return [
      { lines: ['тяни: канат', 'вниз / вверх'], x: 700, y: 250, from: [710, 275], to: hp.hand(r), circle: 26, bend: 0.3 },
      { lines: ['тяни: локоть', 'вперёд / назад'], x: 30, y: 560, from: [130, 545], to: hp.elbow(r), circle: 26, bend: -0.3 },
      { lines: ['трос тянет', 'кисть к блоку'], x: 700, y: 60, from: [700, 90], to: mul(add(P, r.Hd), 0.5), bend: -0.3, gap: 8 },
      { lines: ['график: где тяжелее всего.', 'точка — ты сейчас'], x: box(ctx).x, y: box(ctx).y - 22, from: null },
      { lines: ['светится —', 'значит работает'], x: 30, y: 40, from: [110, 70], to: comb2(r), bend: 0.25, gap: 8 },
    ];
  }
  const comb2 = (r) => add(Sh, mul(r.u, 0.15));

  const handles = [
    {
      key: 'hand', label: 'Угол в локте', pausesPlay: true,
      pos: hp.hand, axis: (r) => perp(r.fd),
      drag: (st, w) => {
        const u = udir(st.al);
        const d = sub(w, add(Sh, mul(u, L.upperArm)));
        st.th = Math.atan2(cross(u, d), dot(u, d));
        if (st.th < 0) st.th = st.th < -Math.PI / 2 ? TH_MAX : TH_MIN;
      },
      step: (st, dir, k) => { st.th += dir * 3 * DEG * k; },
      value: (r) => ({ text: `сгибание ${Math.round(r.th / DEG)}°`, now: r.th / DEG, min: 5, max: 135 }),
    },
    {
      key: 'elbow', label: 'Положение локтя',
      pos: hp.elbow, axis: (r) => perp(r.u),
      drag: (st, w) => { st.al = Math.atan2(w.x - Sh.x, Sh.y - w.y); },
      step: (st, dir, k) => { st.al += dir * 3 * DEG * k; },
      value: (r) => ({ text: `локоть ${r.al > 8 * DEG ? 'впереди' : r.al < -6 * DEG ? 'позади' : 'у корпуса'}`, now: r.al / DEG, min: -15, max: 50 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '60 -20 640 720',
    mobileViewBox: '130 -40 560 1070',
    period: 2.6,
    initial: () => ({ al: 5 * DEG, th: 80 * DEG }),
    clamp(st) { st.al = clamp(st.al, AL_MIN, AL_MAX); st.th = clamp(st.th, TH_MIN, TH_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(2 * (st.th - TH_MIN) / (TH_MAX - TH_MIN) - 1, -1, 1)),
    animate(st, ph, { mini }) {
      st.th = TH_MIN + 4 * DEG + (TH_MAX - TH_MIN - 14 * DEG) * (0.5 + 0.5 * Math.cos(ph));
      if (mini) st.al = (10 + 15 * Math.sin(ph * 0.21)) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 't', name: 'Трицепс', c: 'm2' },
      { key: 's', name: 'Широчайшие (держат локоть)', c: 'm1' },
    ],
    slider: {
      label: 'Где локти', left: 'Прижаты к корпусу', right: 'Вынесены вперёд', lc: 'm2', rc: 'm1',
      get: (r) => ((r.al - AL_MIN) / (AL_MAX - AL_MIN)) * 100,
      set: (x) => ({ al: AL_MIN + (x / 100) * (AL_MAX - AL_MIN) }),
    },
    presets: [
      { label: 'Локти прижаты', c: 'm2', state: { al: 0, th: 90 * DEG } },
      { label: 'Локти вперёд', c: 'm1', state: { al: 40 * DEG, th: 90 * DEG } },
      { label: 'Сбросить', state: { al: 5 * DEG, th: 80 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const peak = Math.round(r.peakTh / DEG);
      const where = peak < 50 ? 'внизу, почти у прямой руки' : peak > 100 ? 'вверху, когда локоть сильно согнут' : 'в середине движения';
      const main = `Тяжелее всего для <b class="c-m2">трицепса</b> — ${where} (${peak}°): там трос тянет поперёк предплечья.`;
      const elbow = r.al > 20 * DEG
        ? '<b>Локти вынесены вперёд.</b> Трос тянет плечо вверх — <b class="c-m1">широчайшие</b> работают, чтобы удержать локоть. Часть веса уходит со спины, а не с трицепса.'
        : '<b>Локти прижаты к корпусу.</b> Плечо почти не двигается — нагрузка идёт в трицепс.';
      const now = r.Mt < 0.05 * REF
        ? 'Сейчас трос тянет почти вдоль предплечья — трицепсу нечего держать.'
        : `Сейчас плечо рычага у локтя ${cm(r.armE)}.`;
      return {
        loads: { t: r.Mt, s: r.Ms },
        nums: [
          ['Плечо у локтя', cm(r.armE)],
          ['Угол в локте', `${Math.round(180 - r.th / DEG)}°`],
          ['Пик нагрузки', `при ${peak}°`],
          ['Положение плеча', `${Math.round(r.al / DEG)}°`],
        ],
        notes: [['m2', main], ['f', elbow], ['f', now]],
        warnings: [],
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.pushdown = { model, page };
})(window);
