/* Присед со штангой: вид сбоку, человек смотрит вправо (+x).
   Ты задаёшь глубину и наклон корпуса, а голени сами находят положение,
   при котором общий центр масс остаётся над серединой стопы. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, norm, perp, fromAngle, clamp, lerp, comb, ik2, angleAt, makeView } = global.Bio;

  const L = { shank: 0.43, thigh: 0.45, torso: 0.52, headR: 0.1, upperArm: 0.3, foreArm: 0.27 };
  const W = { torso: 0.25, neck: 0.08, thigh: 0.165, shank: 0.115, upperArm: 0.085, foreArm: 0.07 };
  const G = 9.81;
  const M = { bar: 100, upper: 48, thighs: 20 }; // кг
  const XM = 0.05;          // середина стопы
  const FLOOR = -0.08;
  const H_TOP = 0.85, H_LOW = 0.27; // высота таза: стоя → глубоко
  const TAU_MIN = 0, TAU_MAX = 70 * DEG;
  const B_MIN = -6 * DEG, B_MAX = 46 * DEG; // наклон голени (подвижность голеностопа)
  const A = v(0, 0);
  const REF = 0.3 * (M.bar + M.upper + M.thighs) * G;

  const VIEW = makeView(520, 622, 380);

  function pose(d, tau, beta) {
    const h = lerp(H_TOP, H_LOW, d);
    const K = add(A, mul(v(Math.sin(beta), Math.cos(beta)), L.shank));
    const sp = clamp((h - K.y) / L.thigh, -1, 1);
    const H = add(K, v(-Math.sqrt(1 - sp * sp) * L.thigh, sp * L.thigh));
    const td = v(Math.sin(tau), Math.cos(tau));
    const back = perp(td); // от груди к спине
    const S = add(H, mul(td, L.torso));
    const bar = comb(H, [td, 0.46], [back, 0.085]);
    const tc = add(H, mul(td, 0.31));
    const thc = mul(add(H, K), 0.5);
    const com = (bar.x * M.bar + tc.x * M.upper + thc.x * M.thighs) / (M.bar + M.upper + M.thighs);
    return { h, K, H, td, back, S, bar, tc, thc, com };
  }

  function solve(st) {
    let lo = B_MIN, hi = B_MAX, beta;
    const fLo = pose(st.d, st.tau, lo).com - XM;
    const fHi = pose(st.d, st.tau, hi).com - XM;
    let balance = 'ok';
    if (fLo > 0) { beta = lo; balance = 'forward'; }
    else if (fHi < 0) { beta = hi; balance = 'back'; }
    else {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (pose(st.d, st.tau, mid).com - XM > 0) hi = mid; else lo = mid;
      }
      beta = (lo + hi) / 2;
    }
    const p = pose(st.d, st.tau, beta);
    const { K, H, bar, tc, thc, td } = p;
    const w = (m) => m * G;
    const Mk = w(M.bar) * (K.x - bar.x) + w(M.upper) * (K.x - tc.x) + w(M.thighs) * (K.x - thc.x);
    const Mh = w(M.bar) * (bar.x - H.x) + w(M.upper) * (tc.x - H.x);
    const Lp = add(H, mul(td, 0.12));
    const Ml = w(M.bar) * (bar.x - Lp.x) + w(M.upper * 0.92) * (tc.x - Lp.x);
    return {
      ...p, d: st.d, tau: st.tau, beta, balance, Mk, Mh, Ml, Lp,
      knee: angleAt(H, K, A), hipA: angleAt(p.S, H, K),
      armK: K.x - bar.x, armH: bar.x - H.x,
      qI: clamp(Mk / REF, 0, 1), gI: clamp(Mh / REF, 0, 1), lI: clamp(Ml / REF, 0, 1),
    };
  }

  // ── Рисунок ──────────────────────────────────────────────────────
  function drawStatic({ D }) {
    return D.ln(v(-1.35, FLOOR - 0.02), v(1.3, FLOOR - 0.02), 'm-base', D.px(0.035)) +
      D.poly([v(XM, FLOOR + 0.005), v(XM - 0.025, FLOOR - 0.045), v(XM + 0.025, FLOOR - 0.045)], 'mid-mark');
  }

  function draw(r, { D, uid, mini }) {
    const { K, H, S, td, back, bar } = r;
    const head = comb(S, [td, 0.17], [back, -0.02]);
    const sh = comb(H, [td, 0.44], [back, -0.02]);
    const e1 = ik2(sh, bar, L.upperArm, L.foreArm, 1);
    const e2 = ik2(sh, bar, L.upperArm, L.foreArm, -1);
    const elbow = e1.y < e2.y ? e1 : e2;
    let out = '';
    // штанга (блин) — позади тела
    out += D.circ(bar, D.px(0.225), 'm-weight') + D.circ(bar, D.px(0.03), 'm-hub');
    const front = mul(back, -1);
    out += D.figure([
      [D.part('torso', comb(H, [td, -0.02]), S, front), D.part('neck', S, comb(S, [td, 0.12]), front), D.head(head, td, front)],
      [D.part('thigh', H, K, D.away(H, K, A)), D.part('shank', K, A, D.away(K, A, H)), D.footFlat(A, FLOOR)],
      [D.part('upperArm', sh, elbow, D.toward(sh, elbow, bar)), D.part('foreArm', elbow, bar, D.toward(elbow, bar, sh)), D.disc(bar, 0.042)],
    ]);
    const dT = norm(sub(K, H));
    const nT = perp(dT);
    out += D.muscleLens(H, K, nT, 0.12, 0.27, 0.15, 0.03, 'mu-m1', r.qI, uid);
    out += D.muscleEll(comb(H, [nT, -0.06], [dT, -0.03]), 0.1, 0.075, dT, 'mu-m2', r.gI, uid);
    out += D.muscleLens(comb(H, [td, 0.04]), comb(H, [td, 0.42]), back, 0.07, 0.05, 0.25, 0.055, 'mu-m3', r.lI, uid);
    out += D.bones([[H, S], [H, K], [K, A]]) + D.joints([H, K]) + D.joints([A], 5);
    if (!mini) {
      out += D.ln(v(bar.x, bar.y + 0.32), v(bar.x, FLOOR), 'fline');
      out += D.lever(K, bar, v(0, -1), r.armK, 'm1', { labelOff: 0.05 });
      out += D.lever(H, bar, v(0, -1), r.armH, 'm2', { labelOff: 0.05 });
    }
    out += D.arrow(comb(bar, [v(0, 1), 0.02]), comb(bar, [v(0, -1), 0.3]), 'ar-force', 6);
    out += D.arrow(v(XM, FLOOR - 0.15), v(XM, FLOOR - 0.03), 'ar-react', 6);
    return out;
  }

  const hp = {
    hip: (r) => comb(r.H, [v(-1, 0), 0.13]),
    lean: (r) => comb(r.S, [r.td, 0.36]),
  };

  function notes(r) {
    return [
      { lines: ['тяни: глубина', '(таз вверх / вниз)'], x: 40, y: 250, from: [120, 290], to: hp.hip(r), circle: 26, bend: 0.25 },
      { lines: ['тяни: наклон', 'корпуса'], x: 760, y: 40, from: [770, 70], to: hp.lean(r), circle: 26, bend: 0.3 },
      { lines: ['штанга всегда над', 'серединой стопы —', 'иначе упадёшь'], x: 780, y: 470, from: [790, 520], toXY: [VIEW.x(v(r.bar.x, 0.3)), VIEW.y(v(0, 0.3))], bend: -0.25, gap: 6 },
      { lines: ['цветные отрезки —', 'плечи рычагов:', 'длиннее → тяжелее'], x: 40, y: 40, from: [150, 112], to: mul(add(r.K, v(r.bar.x, r.K.y)), 0.5), bend: -0.3, gap: 10 },
      { lines: ['светится —', 'значит работает'], x: 40, y: 560, from: [150, 580], to: comb(r.H, [r.td, 0.25], [r.back, 0.12]), bend: 0.2, gap: 6 },
      { lines: ['опора: пол', 'давит в стопу'], x: 780, y: 620, from: [776, 630], toXY: [VIEW.x(v(XM + 0.03, 0)), VIEW.y(v(0, FLOOR - 0.15))], bend: 0.2, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'hip', label: 'Глубина приседа: таз выше или ниже', pausesPlay: true,
      pos: hp.hip, axis: () => v(0, 1),
      drag: (st, w) => { st.d = (H_TOP - w.y) / (H_TOP - H_LOW); },
      step: (st, dir, k) => { st.d -= dir * 0.02 * k; },
      value: (r) => ({ text: `глубина ${Math.round(r.d * 100)}%`, now: r.d * 100 }),
    },
    {
      key: 'lean', label: 'Наклон корпуса вперёд',
      pos: hp.lean, axis: (r) => perp(r.td),
      drag: (st, w, r) => { const d = sub(w, r.H); st.tau = Math.atan2(d.x, d.y); },
      step: (st, dir, k) => { st.tau += dir * 2 * DEG * k; },
      value: (r) => ({ text: `наклон ${Math.round(r.tau / DEG)}°`, now: r.tau / DEG, min: 0, max: 70 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 -10 1000 724',
    miniViewBox: '230 20 600 650',
    mobileViewBox: '250 -10 520 724',
    period: 3.4,
    initial: () => ({ d: 0.55, tau: 30 * DEG }),
    clamp(st) { st.d = clamp(st.d, 0, 1); st.tau = clamp(st.tau, TAU_MIN, TAU_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.d, -1, 1)),
    animate(st, ph, { mini }) {
      st.d = 0.04 + 0.86 * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.tau = (32 + 14 * Math.sin(ph * 0.21)) * DEG;
    },
  };

  const page = {
    muscles: [
      { key: 'q', name: 'Квадрицепсы', c: 'm1' },
      { key: 'g', name: 'Ягодичные', c: 'm2' },
      { key: 'l', name: 'Поясница', c: 'm3' },
    ],
    slider: {
      label: 'Наклон корпуса', left: 'Вертикально · квадрицепсы', right: 'Наклон · таз и поясница', lc: 'm1', rc: 'm2',
      get: (r) => (r.tau / TAU_MAX) * 100,
      set: (x) => ({ tau: (x / 100) * TAU_MAX }),
    },
    presets: [
      { label: 'Высокий гриф, корпус прямее', c: 'm1', state: { tau: 36 * DEG, d: 0.8 } },
      { label: 'Низкий гриф, наклон', c: 'm2', state: { tau: 50 * DEG, d: 0.75 } },
      { label: 'Сбросить', state: { tau: 30 * DEG, d: 0.55 } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = (a) => Math.round(a / DEG) + '°';
      const loads = { q: r.Mk, g: r.Mh, l: r.Ml };
      const pos = Object.values(loads).map((x) => Math.max(x, 0));
      const sum = pos.reduce((a, b) => a + b, 0) || 1;
      const q = pos[0] / sum;

      let muscle;
      if (q > 0.45) muscle = ['m1', 'Больше всех работают <b class="c-m1">квадрицепсы</b>: колени ушли далеко вперёд от линии штанги.'];
      else if (q < 0.25) muscle = ['m2', 'Работу забирают <b class="c-m2">ягодичные</b> и <b class="c-m3">поясница</b>: таз далеко позади штанги, колени почти над ней.'];
      else muscle = ['mix', 'Нагрузка делится между <b class="c-m1">квадрицепсами</b>, <b class="c-m2">ягодичными</b> и <b class="c-m3">поясницей</b>.'];

      const lean = r.tau < 33 * DEG
        ? '<b>Корпус почти вертикален.</b> Чтобы штанга осталась над стопой, колени уходят вперёд — квадрицепсам достаётся больше.'
        : r.tau > 45 * DEG
          ? '<b>Сильный наклон.</b> Таз уходит назад, у него длинный рычаг — работают ягодичные, а поясница держит корпус.'
          : '<b>Умеренный наклон</b> — классический присед, нагрузка распределена.';
      const knees = r.K.x > 0.2
        ? `Колени выходят за носки на ${cm(r.K.x - 0.2)}. Это нормально, если пятки стоят на полу.`
        : 'Колени не выходят за носки.';
      const bal = 'Штанга всегда <b>над серединой стопы</b> — это условие равновесия. Всё остальное подстраивается под него.';

      const warnings = [];
      if (r.balance === 'back') warnings.push('<strong>Не хватает подвижности голеностопа.</strong> Чтобы удержать штангу над стопой, колени должны уйти ещё дальше. Пятки оторвутся — или завалишься назад. Наклонись сильнее или подложи что-то под пятки.');
      if (r.balance === 'forward') warnings.push('<strong>Штанга ушла вперёд.</strong> Слишком сильный наклон для такой глубины — завалишься вперёд.');
      if (r.tau > 55 * DEG) warnings.push('<strong>Очень сильный наклон.</strong> Поясница держит огромный момент — легко округлить спину.');

      return {
        loads,
        nums: [
          ['Плечо в колене', cm(r.armK)],
          ['Плечо в тазу', cm(r.armH)],
          ['Наклон корпуса', deg(r.tau)],
          ['Наклон голени', deg(r.beta)],
        ],
        notes: [muscle, ['f', lean], ['f', knees], ['r', bal]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.squat = { model, page };
})(window);
