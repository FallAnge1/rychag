/* Жим ногами: модель для общего движка сцены.
   Плоская модель (вид сбоку), кости жёсткие, движение медленное.
   Работа мышцы = момент силы в суставе: сила × плечо рычага. */
(function (global) {
  'use strict';
  const {
    DEG, v, add, sub, mul, dot, cross, len, norm, perp, fromAngle, clamp, comb,
    ik2, armIK, angleAt, project, makeView,
  } = global.Bio;

  // ── Тело, м ──────────────────────────────────────────────────────
  const BODY = {
    thigh: 0.45, shank: 0.43, torso: 0.52, headR: 0.1,
    upperArm: 0.3, foreArm: 0.28, ankleH: 0.075,
    w: { torso: 0.25, neck: 0.08, thigh: 0.165, shank: 0.115, upperArm: 0.085, foreArm: 0.07 },
  };

  // ── Тренажёр ─────────────────────────────────────────────────────
  const SLED_ANGLE = 45 * DEG;
  const U = fromAngle(SLED_ANGLE); // ход салазок, от человека
  const T = perp(U);               // вдоль платформы, к её верхнему краю
  const TD = fromAngle(148 * DEG); // спина: от таза к плечам
  const BACK = perp(TD);           // от спины к спинке сиденья
  const NB = mul(BACK, -1);        // куда давит спинка
  const HIP = v(0, 0);
  const HANDLE = v(0.0, -0.13);
  const PLATE = { e0: 0.1, half: 0.3, thick: 0.045 };
  const RAIL = -0.4;
  const MU = 0.55;                 // трение подошвы
  const PHI_MAX = Math.atan(MU);   // сильнее наклонить толчок — стопа поедет
  const E_MIN = PLATE.e0 - PLATE.half + 0.17;
  const E_MAX = PLATE.e0 + PLATE.half - 0.17;
  const LIM = { kneeMin: 50 * DEG, kneeMax: 172 * DEG, hipMin: 40 * DEG };
  const LOAD_KG = 150;
  const FN = LOAD_KG * 9.81 * Math.sin(SLED_ANGLE);
  const REF_ARM = 0.3;

  const VIEW = makeView(392, 446, 470);

  // ── Кинематика ───────────────────────────────────────────────────
  function kin(s, e) {
    const C = comb(HIP, [U, s], [T, e]);
    const A = comb(C, [U, -BODY.ankleH], [T, -0.035]);
    const K = ik2(HIP, A, BODY.thigh, BODY.shank, +1);
    const S = mul(TD, BODY.torso);
    return { s, e, C, A, K, S, knee: angleAt(HIP, K, A), hip: angleAt(S, HIP, K), reach: len(A) };
  }
  const valid = (k) => k.reach < BODY.thigh + BODY.shank - 0.004 &&
    k.knee >= LIM.kneeMin && k.knee <= LIM.kneeMax && k.hip >= LIM.hipMin;

  const rangeCache = new Map();
  function sRange(e) {
    const key = e.toFixed(3);
    if (rangeCache.has(key)) return rangeCache.get(key);
    let lo = null, hi = null;
    for (let s = 0.25; s <= 1.0; s += 0.002) {
      if (valid(kin(s, e))) { if (lo === null) lo = s; hi = s; }
    }
    const r = { lo: lo ?? 0.5, hi: hi ?? 0.8 };
    rangeCache.set(key, r);
    return r;
  }

  // ── Статика ──────────────────────────────────────────────────────
  function solve(st) {
    const k = kin(st.s, st.e);
    const range = sRange(st.e);
    const Fdir = fromAngle(SLED_ANGLE + st.phi);
    const Fmag = FN / Math.cos(st.phi);
    const F = mul(Fdir, Fmag);
    const armK = cross(Fdir, sub(k.K, k.C));   // + → квадрицепсы
    const armH = cross(sub(HIP, k.C), Fdir);   // + → ягодичные
    const Mk = armK * Fmag, Mh = armH * Fmag;
    const N = dot(F, NB);
    const tau = dot(F, TD);
    const backRaw = N > 1 ? Mh / N : 0;
    return {
      ...k, phi: st.phi, range, Fdir, Fmag, armK, armH, Mk, Mh, N, tau, backRaw,
      back: clamp(backRaw, 0, BODY.torso - 0.06),
      footK: project(k.K, k.C, Fdir),
      qI: clamp(Mk / (FN * REF_ARM), 0, 1),
      gI: clamp(Mh / (FN * REF_ARM), 0, 1),
      depth: (range.hi - k.s) / (range.hi - range.lo),
    };
  }

  // ── Рисунок ──────────────────────────────────────────────────────
  function drawStatic({ D }) {
    const { ln, px } = D;
    const corner = comb(HIP, [BACK, 0.16], [TD, -0.06]);
    const railLo = comb(HIP, [U, 0.05], [T, RAIL]);
    const railHi = comb(HIP, [U, 1.25], [T, RAIL]);
    const railMid = comb(HIP, [U, 0.75], [T, RAIL]);
    const f = (x) => v(x, -0.47);
    const backMid = comb(HIP, [BACK, 0.2], [TD, 0.36]);
    return [
      ln(f(-0.72), f(1.22), 'm-base', px(0.04)),
      ln(railHi, f(railHi.x), 'm-frame', px(0.04)),
      ln(railLo, f(railLo.x), 'm-frame', px(0.04)),
      ln(railMid, f(railMid.x + 0.1), 'm-frame', px(0.03)),
      ln(comb(corner, [BACK, 0.04]), f(corner.x - 0.02), 'm-frame', px(0.04)),
      ln(backMid, f(backMid.x), 'm-frame', px(0.035)),
      ln(railLo, railHi, 'm-rail', px(0.05)),
      ln(corner, comb(HIP, [BACK, 0.16], [TD, 0.72]), 'm-pad', px(0.07)),
      ln(corner, add(corner, mul(fromAngle(50 * DEG), 0.16)), 'm-pad', px(0.07)),
      ln(HANDLE, comb(corner, [BACK, 0.03]), 'm-frame', px(0.025)),
      ln(add(HANDLE, v(-0.045, 0.012)), add(HANDLE, v(0.045, -0.012)), 'm-grip', px(0.035)),
    ].join('');
  }

  function carriage(s, D) {
    const { ln, circ, px, text } = D;
    const at = (u, t) => comb(HIP, [U, u], [T, t]);
    const c = at(s + 0.33, -0.1);
    return [
      ln(at(s + 0.04, PLATE.e0 - 0.12), at(s + 0.16, RAIL), 'm-frame', px(0.035)),
      ln(at(s + 0.04, PLATE.e0 + 0.22), at(s + 0.36, RAIL), 'm-frame', px(0.035)),
      ln(at(s + 0.1, RAIL), at(s + 0.42, RAIL), 'm-sled', px(0.08)),
      circ(c, px(0.155), 'm-weight'),
      circ(c, px(0.03), 'm-hub'),
      text(c, `${LOAD_KG} кг`, 'm-kg', 0, 34),
      ln(at(s + PLATE.thick / 2, PLATE.e0 - PLATE.half), at(s + PLATE.thick / 2, PLATE.e0 + PLATE.half), 'm-plate', px(PLATE.thick)),
    ].join('');
  }

  function body(r, D) {
    const { C, A, K, S } = r;
    const head = comb(S, [TD, 0.18], [BACK, 0.01]);
    const shoulder = comb(HIP, [TD, 0.44], [BACK, -0.03]);
    const elbow = armIK(shoulder, HANDLE, BODY.upperArm, BODY.foreArm, TD, NB);
    const foot = [
      comb(C, [T, -0.085], [U, -0.005]), comb(C, [T, 0.06]), comb(C, [T, 0.155], [U, -0.01]),
      comb(C, [T, 0.14], [U, -0.045]), comb(A, [T, 0.06], [U, 0.01]), comb(A, [T, 0.0], [U, -0.035]),
      comb(A, [T, -0.05]), comb(C, [T, -0.1], [U, -0.04]),
    ];
    const off = comb(v(0, 0), [T, 0.035], [U, -0.01]);
    return D.farLeg(HIP, K, A, () => D.blob(foot.map((p) => add(p, off))), off) + D.figure([
      [D.part('torso', comb(HIP, [TD, -0.02]), S, NB), D.part('neck', S, comb(S, [TD, 0.13]), NB), D.head(head, TD, NB)],
      [D.part('upperArm', shoulder, elbow, D.toward(shoulder, elbow, HANDLE)),
        D.part('foreArm', elbow, HANDLE, D.toward(elbow, HANDLE, shoulder)), D.disc(HANDLE, 0.042)],
      [D.part('thigh', HIP, K, D.away(HIP, K, A)), D.part('shank', K, A, D.away(K, A, HIP)), D.blob(foot)],
    ]);
  }

  function muscles(r, D, uid) {
    const dT = norm(sub(r.K, HIP));
    const nT = perp(dT); // передняя поверхность бедра
    return D.muscleLens(HIP, r.K, nT, 0.12, 0.27, 0.16, 0.03, 'mu-m1', r.qI, uid) +
      D.muscleEll(comb(HIP, [nT, -0.06], [dT, -0.025]), 0.1, 0.072, dT, 'mu-m2', r.gI, uid);
  }

  function forces(r, D) {
    const { C, Fdir, Fmag } = r;
    let out = D.arrow(comb(C, [Fdir, 0.06]), comb(C, [Fdir, 0.06 + 0.3 * Fmag / FN]), 'ar-force', 7);
    const pb = comb(HIP, [TD, r.back], [BACK, BODY.w.torso / 2]);
    out += D.ellipse(pb, 0.09, 0.03, TD, 'press');
    out += D.arrow(comb(pb, [BACK, 0.2 * r.N / FN + 0.05]), comb(pb, [BACK, 0.01]), 'ar-react', 6);
    if (Math.abs(r.tau) / FN > 0.06) {
      out += D.arrow(HANDLE, comb(HANDLE, [TD, Math.sign(r.tau) * 0.26 * Math.abs(r.tau) / FN]), 'ar-react', 5);
    }
    return out;
  }

  function draw(r, { D, uid, mini }) {
    let out = carriage(r.s, D) + body(r, D) + muscles(r, D, uid) +
      D.bones([[HIP, r.S], [HIP, r.K], [r.K, r.A]]) + D.joints([HIP, r.K]) + D.joints([r.A], 5);
    if (!mini) {
      out += D.ln(comb(r.C, [r.Fdir, -1.3]), comb(r.C, [r.Fdir, 0.5]), 'fline');
      out += D.lever(r.K, r.C, r.Fdir, r.armK, 'm1');
      out += D.lever(HIP, r.C, r.Fdir, r.armH, 'm2');
    }
    return out + forces(r, D);
  }

  // ── Пометки ручкой (координаты сцены, viewBox 1000×724) ─────────
  const handlePos = {
    sled: (r) => comb(HIP, [U, r.s + 0.26], [T, RAIL]),
    foot: (r) => comb(r.C, [U, 0.1]),
    push: (r) => comb(r.C, [r.Fdir, 0.43 * r.Fmag / FN]),
  };

  function notes(r) {
    const pb = comb(HIP, [TD, r.back], [BACK, BODY.w.torso / 2 + 0.12]);
    const dT = norm(sub(r.K, HIP));
    return [
      { lines: ['цветные отрезки —', 'плечи рычагов:', 'длиннее → тяжелее'], x: 24, y: -6,
        from: [196, 46], to: mul(add(r.K, r.footK), 0.5), bend: -0.2, gap: 8 },
      { lines: ['тяни: стопы', 'выше / ниже'], x: 24, y: 104,
        from: [150, 118], to: handlePos.foot(r), circle: 26, bend: -0.28 },
      { lines: ['стрелка — твой толчок.', 'тяни: куда давишь'], x: 540, y: -10,
        from: [690, 32], to: handlePos.push(r), circle: 26, bend: -0.3 },
      { lines: ['тяни:', 'глубина'], x: 840, y: 470,
        from: [858, 436], to: handlePos.sled(r), circle: 26, bend: 0.25 },
      { lines: ['спинка держит', 'спину. пятно —', 'где давит'], x: 18, y: 506,
        from: [120, 490], to: pb, bend: -0.3, gap: 6 },
      { lines: ['ручки не дают', 'уехать вверх'], x: 404, y: 606,
        from: [430, 584], to: HANDLE, bend: 0.3, gap: 14 },
      { lines: ['светится —', 'значит работает'], x: 572, y: 600,
        from: [590, 576], to: comb(HIP, [dT, 0.06], [perp(dT), -0.1]), bend: 0.25, gap: 6 },
    ];
  }

  // ── Ручки ────────────────────────────────────────────────────────
  const handles = [
    {
      key: 'sled', label: 'Глубина: двигай платформу вдоль хода салазок', pausesPlay: true,
      pos: handlePos.sled, axis: () => U,
      drag: (st, w) => { st.s = dot(w, U) - 0.26; },
      step: (st, dir, k) => { st.s -= dir * 0.01 * k; },
      value: (r) => ({ text: `глубина ${Math.round(r.depth * 100)}%`, now: r.depth * 100 }),
    },
    {
      key: 'foot', label: 'Постановка стоп: выше или ниже на платформе',
      pos: handlePos.foot, axis: () => T,
      drag: (st, w) => { st.e = dot(w, T); },
      step: (st, dir, k) => { st.e += dir * 0.01 * k; },
      value: (r) => ({ text: `стопы ${r.e > 0.15 ? 'высоко' : r.e < 0.03 ? 'низко' : 'по центру'}`, now: ((r.e - E_MIN) / (E_MAX - E_MIN)) * 100 }),
    },
    {
      key: 'push', label: 'Направление толчка: вверх или вниз по платформе',
      pos: handlePos.push, axis: (r) => perp(r.Fdir),
      drag: (st, w) => {
        const d = sub(w, comb(HIP, [U, st.s], [T, st.e]));
        st.phi = Math.atan2(dot(d, T), dot(d, U));
      },
      step: (st, dir, k) => { st.phi += dir * 2 * DEG * k; },
      value: (r) => ({ text: `наклон толчка ${Math.round(r.phi / DEG)}°`, now: r.phi / DEG, min: Math.round(-PHI_MAX / DEG), max: Math.round(PHI_MAX / DEG) }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -34 1000 724',
    miniViewBox: '30 -70 960 770',
    period: 3.2,
    initial() {
      const r = sRange(0.07);
      return { e: 0.07, phi: 0, s: r.lo + 0.55 * (r.hi - r.lo) };
    },
    clamp(st) {
      st.e = clamp(st.e, E_MIN, E_MAX);
      st.phi = clamp(st.phi, -PHI_MAX, PHI_MAX);
      const r = sRange(st.e);
      if (st.depth != null) { st.s = r.hi - st.depth * (r.hi - r.lo); delete st.depth; }
      st.s = clamp(st.s, r.lo, r.hi);
    },
    solve, drawStatic, draw, notes, handles,
    phaseOf(st) {
      const r = sRange(st.e), m = 0.02 * (r.hi - r.lo);
      return Math.acos(clamp(2 * ((st.s - r.lo - m) / (r.hi - r.lo - 2 * m)) - 1, -1, 1));
    },
    animate(st, phase, { mini }) {
      const r = sRange(st.e), m = 0.02 * (r.hi - r.lo);
      st.s = r.lo + m + (r.hi - r.lo - 2 * m) * (0.5 + 0.5 * Math.cos(phase));
      if (mini) st.phi = -0.42 * Math.sin(phase * 0.23);
    },
  };

  // ── Тексты для панели ────────────────────────────────────────────
  const pct = (x) => Math.round(x * 100) + '%';
  const page = {
    muscles: [
      { key: 'quad', name: 'Квадрицепсы', c: 'm1' },
      { key: 'glute', name: 'Ягодичные', c: 'm2' },
    ],
    slider: {
      label: 'Куда давишь стопами', left: 'Вверх · квадрицепсы', right: 'Вдоль голени · ягодичные', lc: 'm1', rc: 'm2',
      get: (r) => ((PHI_MAX - r.phi) / (2 * PHI_MAX)) * 100,
      set: (x) => ({ phi: PHI_MAX - (x / 100) * 2 * PHI_MAX }),
    },
    presets: [
      { label: 'На квадрицепсы', c: 'm1', state: { e: E_MIN, phi: 0.15, depth: 0.5 } },
      { label: 'На ягодичные', c: 'm2', state: { e: 0.18, phi: -0.15, depth: 0.55 } },
      { label: 'Сбросить', state: { e: 0.07, phi: 0, depth: 0.45 } },
    ],
    read(r) {
      const q = Math.max(r.Mk, 0), g = Math.max(r.Mh, 0);
      const share = q + g > 1e-6 ? q / (q + g) : 0.5;
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const nm = (M) => Math.round(Math.abs(M)) + ' Н·м';
      const deg = (a) => Math.round(a / DEG) + '°';

      let muscle;
      if (r.Mh < 0) muscle = ['m1', 'Работают только <b class="c-m1">квадрицепсы</b>. Линия толчка проходит выше таза, и ягодичным нечего разгибать.'];
      else if (r.Mk < 0) muscle = ['m2', 'Работают только <b class="c-m2">ягодичные</b>. Линия толчка ушла по другую сторону колена, квадрицепсы выключились.'];
      else if (share >= 0.72) muscle = ['m1', 'Работают в основном <b class="c-m1">квадрицепсы</b>. Колено далеко от линии толчка — у него длинный рычаг, а таз почти на линии.'];
      else if (share <= 0.32) muscle = ['m2', 'Основная работа — <b class="c-m2">ягодичные</b> вместе с задней поверхностью бедра. Линия толчка проходит рядом с коленом, но далеко от таза.'];
      else muscle = ['mix', `Нагрузка делится: <b class="c-m1">квадрицепсы ${pct(share)}</b>, <b class="c-m2">ягодичные ${pct(1 - share)}</b>.`];

      const d = r.phi / DEG;
      const push = d > 6 ? 'Давишь <b>вверх по платформе</b>, к носкам. Будь платформа скользкой — стопы уехали бы вверх.'
        : d < -6 ? 'Давишь <b>вниз, вдоль голеней</b>, будто вбиваешь их в платформу. На скользкой платформе стопы уехали бы к пяткам.'
          : 'Давишь <b>прямо по ходу салазок</b>. Трению подошвы почти нечего держать.';
      const feet = r.e > 0.15 ? '<b>Стопы высоко.</b> Колени меньше уходят вперёд, таз сильнее сгибается внизу — нагрузка смещается к ягодичным.'
        : r.e < 0.03 ? '<b>Стопы низко.</b> Колени уходят далеко вперёд — больше работы квадрицепсам и больше нагрузки на колени.'
          : '<b>Стопы в середине платформы</b> — нейтральная постановка.';
      let back = r.backRaw < 0.05 ? 'В спинку давишь <b>тазом и поясницей</b>, верх спины почти свободен.'
        : r.backRaw < 0.2 ? 'Спинка держит тебя <b>на уровне поясницы</b>.'
          : r.backRaw < 0.4 ? 'Сильнее всего давишь на спинку <b>серединой спины</b>.'
            : 'Давишь на спинку <b>лопатками</b>.';
      if (r.tau < -0.35 * r.N) back += ' Ноги выталкивают тебя вверх по сиденью — крепко держись за ручки.';

      const warnings = [];
      if (r.hip < 50 * DEG) warnings.push('<strong>Слишком глубоко.</strong> Таз подкручивается и отрывается от сиденья, поясница округляется. Опускайся, пока таз прижат.');
      if (r.knee > 165 * DEG) warnings.push('<strong>Колени почти выпрямлены.</strong> Не «замыкай» их в верхней точке под большим весом.');
      if (Math.abs(r.phi) > 0.92 * PHI_MAX) warnings.push('<strong>На грани проскальзывания.</strong> Ещё чуть-чуть — и трения подошвы не хватит.');

      return {
        loads: { quad: r.Mk, glute: r.Mh },
        nums: [
          ['Плечо в колене', r.Mk < 0 ? 'с другой стороны' : `${cm(r.armK)} · ${nm(r.Mk)}`],
          ['Плечо в тазу', r.Mh < 0 ? 'с другой стороны' : `${cm(r.armH)} · ${nm(r.Mh)}`],
          ['Угол в колене', deg(r.knee)],
          ['Угол в тазу', deg(r.hip)],
        ],
        notes: [muscle, ['f', push], ['f', feet], ['r', back]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['leg-press'] = { model, page };
})(window);
