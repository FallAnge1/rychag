/* Ягодичный мост со штангой: вид сбоку.
   Лопатки лежат на краю скамьи (точка B), стопы стоят на полу (точка F).
   Вес делится между двумя опорами, как на рычажных весах. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, cross, fromAngle, clamp, comb, ik2, armIK, angleAt, makeView, len } = global.Bio;

  const L = { thigh: 0.45, shank: 0.43, torso: 0.45, headR: 0.1, upperArm: 0.3, foreArm: 0.27 };
  const W = { torso: 0.25, neck: 0.08, thigh: 0.165, shank: 0.115, upperArm: 0.085, foreArm: 0.07 };
  const G = 9.81;
  const M = { bar: 100, torso: 35, thighs: 20 };
  const B = v(0, 0);
  const FLOOR = -0.47;
  const TH_MIN = -40 * DEG, TH_TOP = 10 * DEG;
  const XF_MIN = 0.5, XF_MAX = 0.98;
  const REF = 0.35 * (M.bar + M.torso) * G;
  const PHI_MAX = 22 * DEG;      // сильнее наклонить толчок — стопы поедут по полу

  const VIEW = makeView(290, 393, 440);

  function kin(th, xf) {
    const H = add(B, mul(fromAngle(th), L.torso));
    const F = v(xf, FLOOR);
    const A = v(xf - 0.03, FLOOR + 0.08);
    const K = ik2(H, A, L.thigh, L.shank, 1);
    return { th, xf, H, F, A, K, reach: len(sub(A, H)) };
  }
  const valid = (k) => k.reach < L.thigh + L.shank - 0.01 && angleAt(k.H, k.K, k.A) > 45 * DEG;
  function thMax(xf) {
    for (let th = TH_TOP; th > TH_MIN; th -= 0.5 * DEG) if (valid(kin(th, xf))) return th;
    return TH_MIN;
  }

  function solve(st) {
    const k = kin(st.th, st.xf);
    const { H, F, K, A } = k;
    const bar = add(H, v(0, 0.12));
    const tm = mul(add(B, H), 0.5);
    const thm = mul(add(H, K), 0.5);
    const w = (m) => m * G;
    const total = w(M.bar) + w(M.torso) + w(M.thighs);
    // толчок стопами: phi > 0 — пятки тянешь к себе (пол толкает стопы от скамьи)
    const t = Math.tan(st.phi);
    const Mg = w(M.bar) * (bar.x - B.x) + w(M.torso) * (tm.x - B.x) + w(M.thighs) * (thm.x - B.x);
    const RF = Mg / ((F.x - B.x) - (F.y - B.y) * t);   // вертикальная часть опоры пола
    const Rx = RF * t;                                  // горизонтальная, её держит трение
    const RB = total - RF;
    const Rdir = v(Math.sin(st.phi), Math.cos(st.phi));
    const Mh = RB * (H.x - B.x) - (B.y - H.y) * Rx - w(M.torso) * (H.x - tm.x);
    const Mk = cross(sub(K, F), v(Rx, RF));            // + квадрицепсы, − задняя поверхность бедра
    const armK = cross(sub(K, F), Rdir);
    const top = thMax(st.xf);
    return {
      ...k, bar, RF, RB, Rx, Rdir, Rmag: Math.hypot(RF, Rx), armK, total, Mh, Mk, phi: st.phi,
      knee: angleAt(H, K, A),
      hip: Math.PI - Math.abs(Math.atan2(K.y - H.y, K.x - H.x) - st.th),
      lift: (st.th - TH_MIN) / (top - TH_MIN),
      gI: clamp(Mh / REF, 0, 1), qI: clamp(Mk / (REF * 0.4), 0, 1), hI: clamp(-Mk / (REF * 0.4), 0, 1),
    };
  }

  function drawStatic({ D }) {
    const top = -0.035;
    return D.ln(v(-0.7, FLOOR - 0.015), v(1.3, FLOOR - 0.015), 'm-base', D.px(0.03)) +
      D.poly([v(-0.62, FLOOR), v(-0.62, top), v(0.02, top), v(0.035, top - 0.02), v(0.035, FLOOR)], 'm-bench');
  }

  function draw(r, { D, uid, mini }) {
    const { H, K, A, bar } = r;
    const dirHB = norm(sub(B, H));          // от таза к лопаткам
    const S = add(B, mul(dirHB, 0.06));
    const up = perp(mul(dirHB, -1));        // сторона живота
    const head = comb(S, [dirHB, 0.17], [up, 0.03]);
    const sh = comb(S, [dirHB, -0.02]);
    const elbow = armIK(sh, bar, L.upperArm, L.foreArm, dirHB, up);
    let out = D.farLeg(H, K, A, (a) => D.footFlat(a, FLOOR), v(-0.05, 0)) + D.circ(bar, D.px(0.225), 'm-weight') + D.circ(bar, D.px(0.03), 'm-hub');
    out += D.figure([
      [D.part('upperArm', sh, elbow, D.toward(sh, elbow, bar)), D.part('foreArm', elbow, bar, D.toward(elbow, bar, sh)), D.disc(bar, 0.042)],
      [D.part('torso', H, S, up), D.part('neck', S, comb(S, [dirHB, 0.12]), up), D.head(head, dirHB, up)],
      [D.part('thigh', H, K, D.away(H, K, A)), D.part('shank', K, A, D.away(K, A, H)), D.footFlat(A, FLOOR)],
    ]);
    const dT = norm(sub(K, H));
    const nT = perp(dT); // верх бедра
    out += D.muscleLens(H, K, nT, 0.11, 0.25, 0.15, 0.03, 'mu-m1', r.qI, uid);
    out += D.muscleLens(H, K, mul(nT, -1), 0.1, 0.3, 0.12, 0.03, 'mu-m3', r.hI, uid);
    out += D.muscleEll(comb(H, [nT, -0.07], [dT, -0.02]), 0.11, 0.08, dT, 'mu-m2', r.gI, uid);
    out += D.bones([[H, S], [H, K], [K, A]]) + D.joints([H, K]) + D.joints([A], 5);
    if (!mini) {
      out += D.ln(v(B.x, 0.3), v(B.x, FLOOR), 'fline') + D.ln(r.F, comb(r.F, [r.Rdir, 1.05]), 'fline');
      out += D.lever(H, B, v(0, 1), H.x - B.x, 'm2', { labelOff: -0.05 });
      out += D.lever(K, r.F, r.Rdir, Math.abs(r.armK), r.Mk >= 0 ? 'm1' : 'm3', { labelOff: -0.05 });
    }
    // стрелка — твой толчок стопами в пол
    out += D.arrow(comb(r.F, [r.Rdir, 0.98]), comb(r.F, [r.Rdir, 0.74]), 'ar-force', 7);
    out += D.arrow(comb(bar, [v(0, 1), 0.02]), comb(bar, [v(0, -1), 0.28]), 'ar-force', 6);
    const k = 0.26 / (r.total);
    out += D.arrow(v(B.x, -0.035 - 0.05 - r.RB * k), v(B.x, -0.045), 'ar-react', 6);
    out += D.arrow(comb(r.F, [r.Rdir, -0.03 - r.Rmag * k]), comb(r.F, [r.Rdir, -0.01]), 'ar-react', 6);
    return out;
  }

  const hp = {
    hip: (r) => add(r.H, v(0.02, -0.15)),
    feet: (r) => v(r.A.x + 0.28, FLOOR + 0.05),
    push: (r) => comb(r.F, [r.Rdir, 1.03]),
  };
  const pushText = (phi) => (phi > 4 * DEG ? 'пятки тянешь к себе' : phi < -4 * DEG ? 'стопы толкаешь от себя' : 'давишь прямо в пол');

  function notes(r) {
    return [
      { lines: ['тяни: таз', 'выше / ниже'], x: 40, y: 60, from: [150, 100], to: hp.hip(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: стопы', 'ближе / дальше'], x: 790, y: 380, from: [840, 410], to: hp.feet(r), circle: 26, bend: -0.25 },
      { lines: ['скамья и пол делят', 'вес между собой'], x: 24, y: 650, from: [200, 640], toXY: [VIEW.x(B) - 6, VIEW.y(v(0, -0.2))], bend: 0.3, gap: 6 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 410, y: 30, from: [470, 64], to: v((B.x + r.H.x) / 2, r.H.y), bend: -0.2, gap: 10 },
      { lines: ['стрелка — твой толчок.', 'тяни: пятки к себе', 'или от себя'], x: 690, y: 200, from: [690, 215], to: hp.push(r), circle: 26, bend: 0.3 },
      { lines: ['светится —', 'значит работает'], x: 30, y: 200, from: [120, 240], to: comb(r.H, [v(0, -1), 0.05], [v(-1, 0), 0.06]), bend: -0.25, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'hip', label: 'Высота таза', pausesPlay: true,
      pos: hp.hip, axis: () => v(0, 1),
      drag: (st, w) => { st.th = Math.asin(clamp((w.y + 0.15) / L.torso, -1, 1)); },
      step: (st, dir, k) => { st.th += dir * 2 * DEG * k; },
      value: (r) => ({ text: `таз поднят на ${Math.round(r.lift * 100)}%`, now: r.lift * 100 }),
    },
    {
      key: 'feet', label: 'Стопы ближе или дальше от таза',
      pos: hp.feet, axis: () => v(1, 0),
      drag: (st, w) => { st.xf = w.x - 0.25; },
      step: (st, dir, k) => { st.xf += dir * 0.01 * k; },
      value: (r) => ({ text: `стопы на ${Math.round(r.xf * 100)} см от скамьи`, now: ((r.xf - XF_MIN) / (XF_MAX - XF_MIN)) * 100 }),
    },
    {
      key: 'push', label: 'Куда давишь стопами: пятки к себе или от себя',
      pos: hp.push, axis: (r) => perp(r.Rdir),
      drag: (st, w) => { const d = sub(w, v(st.xf, FLOOR)); st.phi = Math.atan2(d.x, d.y); },
      step: (st, dir, k) => { st.phi -= dir * 2 * DEG * k; },
      value: (r) => ({ text: pushText(r.phi), now: r.phi / DEG, min: -22, max: 22 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -10 1000 724',
    miniViewBox: '60 120 900 560',
    mobileViewBox: '0 100 880 590',
    period: 2.8,
    initial: () => ({ th: 2 * DEG, xf: 0.72, phi: 0 }),
    clamp(st) {
      st.xf = clamp(st.xf, XF_MIN, XF_MAX);
      st.phi = clamp(st.phi || 0, -PHI_MAX, PHI_MAX);
      st.th = clamp(st.th, TH_MIN, thMax(st.xf));
    },
    solve, drawStatic, draw, notes, handles,
    phaseOf(st) { const t = thMax(st.xf); return Math.acos(clamp(2 * (st.th - TH_MIN) / (t - TH_MIN) - 1, -1, 1)); },
    animate(st, ph, { mini }) {
      if (mini) st.xf = 0.72 + 0.16 * Math.sin(ph * 0.23);
      const t = thMax(st.xf);
      st.th = TH_MIN + 4 * DEG + (t - TH_MIN - 4 * DEG) * (0.5 + 0.5 * Math.cos(ph));
    },
  };

  const page = {
    muscles: [
      { key: 'g', name: 'Ягодичные', c: 'm2' },
      { key: 'q', name: 'Квадрицепсы', c: 'm1' },
      { key: 'h', name: 'Бицепс бедра', c: 'm3' },
    ],
    slider: {
      label: 'Где стоят стопы', left: 'Ближе · квадрицепсы', right: 'Дальше · бицепс бедра', lc: 'm1', rc: 'm3',
      get: (r) => ((r.xf - XF_MIN) / (XF_MAX - XF_MIN)) * 100,
      set: (x) => ({ xf: XF_MIN + (x / 100) * (XF_MAX - XF_MIN) }),
    },
    presets: [
      { label: 'Голени вертикально', c: 'm2', state: { xf: 0.74, th: 6 * DEG, phi: 0 } },
      { label: 'Стопы близко', c: 'm1', state: { xf: 0.56, th: 6 * DEG, phi: 0 } },
      { label: 'Стопы далеко', c: 'm3', state: { xf: 0.95, th: 0, phi: 0 } },
      { label: 'Пятки к себе', c: 'm3', state: { xf: 0.85, th: 6 * DEG, phi: 20 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const loads = { g: r.Mh, q: Math.max(r.Mk, 0), h: Math.max(-r.Mk, 0) };
      const knee = Math.abs(r.armK) < 0.04
        ? '<b>Линия толчка проходит через колено.</b> Колену нечего держать — почти вся работа у <b class="c-m2">ягодичных</b>.'
        : r.Mk > 0
          ? '<b>Колено впереди линии толчка.</b> Пол сгибает колено — его держат <b class="c-m1">квадрицепсы</b>.'
          : '<b>Колено позади линии толчка.</b> Пол разгибает колено — его держит <b class="c-m3">бицепс бедра</b> (задняя поверхность).';
      const d = r.phi / DEG;
      const push = d > 4
        ? 'Тянешь <b>пятки к себе</b>, будто сгибаешь ноги. Линия толчка уходит за колено — сильнее работает <b class="c-m3">бицепс бедра</b>.'
        : d < -4
          ? 'Толкаешь <b>стопы от себя</b>, будто разгибаешь ноги. Линия толчка уходит перед коленом — включаются <b class="c-m1">квадрицепсы</b>.'
          : 'Давишь <b>прямо в пол</b>. Трению подошвы нечего держать.';
      const glute = r.lift > 0.85
        ? 'В верхней точке таз далеко от скамьи по горизонтали — у <b class="c-m2">ягодичных</b> длинный рычаг. Задержись тут.'
        : r.lift < 0.3
          ? 'Таз внизу. Ягодичные растянуты, но рычаг у них короче.'
          : 'Ягодичные держат корпус между скамьёй и стопами.';
      const supp = `Скамья держит <b>${Math.round((r.RB / r.total) * 100)}%</b> веса, пол — <b>${Math.round((r.RF / r.total) * 100)}%</b>. Ближе таз к стопам — больше веса уходит на ноги.`;
      const warnings = [];
      if (Math.abs(r.phi) > 0.92 * PHI_MAX) warnings.push('<strong>На грани проскальзывания.</strong> Ещё чуть-чуть — и стопы поедут по полу.');
      if (r.knee > 150 * DEG) warnings.push('<strong>Ноги почти прямые.</strong> Бицепс бедра работает на пределе — может свести судорогой.');
      return {
        loads,
        nums: [
          ['Плечо таза', cm(r.H.x - B.x)],
          ['Плечо колена', cm(r.armK)],
          ['Угол в колене', deg(r.knee)],
          ['Наклон толчка', `${Math.round(Math.abs(d))}° ${d > 1 ? 'к себе' : d < -1 ? 'от себя' : ''}`.trim()],
        ],
        notes: [['m2', glute], ['f', knee], ['f', push], ['r', supp]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['hip-thrust'] = { model, page };
})(window);
