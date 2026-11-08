/* Ягодичный мост со штангой: вид сбоку.
   Лопатки лежат на краю скамьи (точка B), стопы стоят на полу (точка F).
   Вес делится между двумя опорами, как на рычажных весах. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, fromAngle, clamp, comb, ik2, armIK, angleAt, makeView, len } = global.Bio;

  const L = { thigh: 0.45, shank: 0.43, torso: 0.45, headR: 0.1, upperArm: 0.3, foreArm: 0.27 };
  const W = { torso: 0.25, neck: 0.08, thigh: 0.165, shank: 0.115, upperArm: 0.085, foreArm: 0.07 };
  const G = 9.81;
  const M = { bar: 100, torso: 35, thighs: 20 };
  const B = v(0, 0);
  const FLOOR = -0.47;
  const TH_MIN = -40 * DEG, TH_TOP = 10 * DEG;
  const XF_MIN = 0.5, XF_MAX = 0.98;
  const REF = 0.35 * (M.bar + M.torso) * G;

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
    const RF = (w(M.bar) * (bar.x - B.x) + w(M.torso) * (tm.x - B.x) + w(M.thighs) * (thm.x - B.x)) / (F.x - B.x);
    const RB = total - RF;
    const Mh = RB * (H.x - B.x) - w(M.torso) * (H.x - tm.x);
    const Mk = RF * (K.x - F.x); // + квадрицепсы, − задняя поверхность бедра
    const top = thMax(st.xf);
    return {
      ...k, bar, RF, RB, total, Mh, Mk,
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
      out += D.ln(v(B.x, 0.3), v(B.x, FLOOR), 'fline') + D.ln(v(r.F.x, 0.3), v(r.F.x, FLOOR), 'fline');
      out += D.lever(H, B, v(0, 1), H.x - B.x, 'm2', { labelOff: -0.05 });
      out += D.lever(K, r.F, v(0, 1), r.Mk >= 0 ? K.x - r.F.x : r.F.x - K.x, r.Mk >= 0 ? 'm1' : 'm3', { labelOff: -0.05 });
    }
    out += D.arrow(comb(bar, [v(0, 1), 0.02]), comb(bar, [v(0, -1), 0.28]), 'ar-force', 6);
    const k = 0.26 / (r.total);
    out += D.arrow(v(B.x, -0.035 - 0.05 - r.RB * k), v(B.x, -0.045), 'ar-react', 6);
    out += D.arrow(v(r.F.x, FLOOR - 0.03 - r.RF * k), v(r.F.x, FLOOR - 0.01), 'ar-react', 6);
    return out;
  }

  const hp = {
    hip: (r) => add(r.H, v(0.02, -0.15)),
    feet: (r) => v(r.A.x + 0.28, FLOOR + 0.05),
  };

  function notes(r) {
    return [
      { lines: ['тяни: таз', 'выше / ниже'], x: 40, y: 60, from: [150, 100], to: hp.hip(r), circle: 26, bend: -0.3 },
      { lines: ['тяни: стопы', 'ближе / дальше'], x: 790, y: 380, from: [840, 410], to: hp.feet(r), circle: 26, bend: -0.25 },
      { lines: ['скамья и пол делят', 'вес между собой'], x: 24, y: 650, from: [200, 640], toXY: [VIEW.x(B) - 6, VIEW.y(v(0, -0.2))], bend: 0.3, gap: 6 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 410, y: 30, from: [470, 64], to: v((B.x + r.H.x) / 2, r.H.y), bend: -0.2, gap: 10 },
      { lines: ['светится —', 'значит работает'], x: 640, y: 120, from: [650, 150], to: comb(r.H, [v(0, -1), 0.05], [v(1, 0), 0.04]), bend: 0.25, gap: 8 },
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
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -10 1000 724',
    miniViewBox: '60 120 900 560',
    mobileViewBox: '0 100 880 590',
    period: 2.8,
    initial: () => ({ th: 2 * DEG, xf: 0.72 }),
    clamp(st) {
      st.xf = clamp(st.xf, XF_MIN, XF_MAX);
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
      { label: 'Голени вертикально', c: 'm2', state: { xf: 0.74, th: 6 * DEG } },
      { label: 'Стопы близко', c: 'm1', state: { xf: 0.56, th: 6 * DEG } },
      { label: 'Стопы далеко', c: 'm3', state: { xf: 0.95, th: 0 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const loads = { g: r.Mh, q: Math.max(r.Mk, 0), h: Math.max(-r.Mk, 0) };
      const shin = r.K.x - r.F.x;
      const knee = Math.abs(shin) < 0.04
        ? '<b>Голень почти вертикальна.</b> Пол давит вдоль голени — колену нечего держать, почти вся работа у <b class="c-m2">ягодичных</b>.'
        : shin > 0
          ? '<b>Стопы близко к тазу.</b> Колено ушло вперёд за стопу — пол сгибает колено, и его держат <b class="c-m1">квадрицепсы</b>.'
          : '<b>Стопы далеко.</b> Стопа впереди колена — пол разгибает колено, его держит <b class="c-m3">бицепс бедра</b> (задняя поверхность).';
      const glute = r.lift > 0.85
        ? 'В верхней точке таз далеко от скамьи по горизонтали — у <b class="c-m2">ягодичных</b> длинный рычаг. Задержись тут.'
        : r.lift < 0.3
          ? 'Таз внизу. Ягодичные растянуты, но рычаг у них короче.'
          : 'Ягодичные держат корпус между скамьёй и стопами.';
      const supp = `Скамья держит <b>${Math.round((r.RB / r.total) * 100)}%</b> веса, пол — <b>${Math.round((r.RF / r.total) * 100)}%</b>. Ближе таз к стопам — больше веса уходит на ноги.`;
      const warnings = [];
      if (r.knee > 150 * DEG) warnings.push('<strong>Ноги почти прямые.</strong> Бицепс бедра работает на пределе — может свести судорогой.');
      return {
        loads,
        nums: [
          ['Плечо таза', cm(r.H.x - B.x)],
          ['Плечо колена', cm(shin)],
          ['Угол в колене', deg(r.knee)],
          ['Таз поднят', Math.round(r.lift * 100) + '%'],
        ],
        notes: [['m2', glute], ['f', knee], ['r', supp]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['hip-thrust'] = { model, page };
})(window);
