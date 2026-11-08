/* Гиперэкстензия на тренажёре под 45°: вид сбоку, лицом вниз.
   Ты двигаешь корпус (наклон вниз) и валик. Валик ниже тазобедренного сустава — движение в тазу,
   работают ягодицы и бицепс бедра. Валик на животе — таз зажат, сгибается поясница. */
(function (global) {
  'use strict';
  const { DEG, v, add, sub, mul, dot, perp, clamp, comb, fromAngle, makeView } = global.Bio;

  const G = 9.81;
  const WU = 45 * G;                         // корпус с руками и головой
  const TORSO = 0.52;
  const H = v(0, 0);
  const UB = fromAngle(45 * DEG);            // от таза к голове, когда тело прямое
  const LF = mul(UB, -1);                    // к ногам
  const ANT = v(UB.y, -UB.x);                // перед тела (смотрит вниз)
  const POST = mul(ANT, -1);
  const K = add(H, mul(LF, 0.45));
  const A = add(H, mul(LF, 0.88));
  const S_MIN = -0.12, S_MAX = 0.14;         // валик: ниже таза … на животе
  const PHI_MAX = 120 * DEG;
  const REF = WU * 0.4;

  const VIEW = makeView(470, 380, 420);
  const rot = (a, t) => v(a.x * Math.cos(t) - a.y * Math.sin(t), a.x * Math.sin(t) + a.y * Math.cos(t));

  // точка на корпусе на расстоянии d от таза (с учётом изгиба у валика)
  function onBody(r, d) {
    return d <= r.piv ? add(H, mul(UB, d)) : add(r.Pv, mul(r.td, d - r.piv));
  }

  function solve(st) {
    const piv = Math.max(st.s, 0);          // где сгибается тело: в тазу или у валика
    const Pv = add(H, mul(UB, piv));
    const td = rot(UB, -st.phi);             // корпус опускается вперёд-вниз
    const ant = rot(ANT, -st.phi);
    const r = { ...st, piv, Pv, td, ant };
    r.S = onBody(r, TORSO);
    r.com = onBody(r, 0.31);
    r.Lp = onBody(r, 0.12);
    // часть корпуса выше поясницы и её центр масс
    const comL = onBody(r, 0.12 + (0.31 - 0.12) * 1.15);
    const hipLock = clamp(st.s / 0.08, 0, 1); // валик выше таза зажимает таз
    r.Mh = WU * Math.max(r.com.x - H.x, 0) * (1 - hipLock);
    r.Ml = WU * 0.85 * Math.max(comL.x - r.Lp.x, 0);
    r.pad = comb(H, [UB, st.s], [ANT, 0.135]);
    r.hI = clamp(r.Mh / REF, 0, 1);
    r.lI = clamp(r.Ml / (REF * 0.7), 0, 1);
    return r;
  }

  function drawStatic({ D }) {
    const { ln, px } = D;
    const roller = comb(A, [POST, 0.08], [UB, 0.03]);
    const plate = add(A, mul(LF, 0.07));
    return [
      ln(v(-0.85, -0.82), v(0.9, -0.82), 'm-base', px(0.03)),
      ln(comb(plate, [ANT, -0.1]), comb(plate, [ANT, 0.12]), 'm-pad', px(0.035)),
      ln(comb(plate, [ANT, 0.05]), v(plate.x + 0.15, -0.82), 'm-frame', px(0.035)),
      D.circ(roller, px(0.045), 'm-weight'),
      ln(v(-0.3, -0.82), v(0.08, -0.25), 'm-frame', px(0.04)),
    ].join('');
  }

  function draw(r, { D, uid, mini }) {
    const { td, ant, S } = r;
    let out = D.ln(r.pad, v(0.08, -0.25), 'm-frame', D.px(0.035));
    const head = add(S, mul(td, 0.17));
    const foot = [comb(A, [LF, 0.06], [ANT, 0.02]), comb(A, [LF, 0.07], [ANT, 0.18]), comb(A, [LF, 0.03], [ANT, 0.17]),
      comb(A, [ANT, 0.06]), comb(A, [POST, 0.05]), comb(A, [LF, 0.05], [POST, 0.04])];
    // корпус: до валика прямо, дальше — по направлению td
    const trunk = r.piv > 0.01
      ? [D.limb(add(H, mul(UB, -0.03)), r.Pv, ANT, [0.1, 0.1], [0.13, 0.11]),
        D.limb(r.Pv, S, ant, [0.1, 0.105, 0.122, 0.1], [0.11, 0.108, 0.124, 0.106])]
      : [D.part('torso', add(H, mul(td, -0.02)), S, ant)];
    const sh = onBody(r, 0.46);
    const elbow = comb(sh, [td, -0.2], [ant, 0.1]);
    const hand = comb(sh, [td, 0.02], [ant, 0.12]);
    out += D.farLeg(H, K, A, () => D.blob(foot.map((p) => add(p, v(-0.03, 0.02)))), v(-0.03, 0.02));
    out += D.figure([[D.part('thigh', H, K, ANT), D.part('shank', K, A, ANT), D.blob(foot),
      ...trunk, D.part('neck', S, add(S, mul(td, 0.12)), ant), D.head(head, td, ant)]]);
    // валик поверх тела
    out += D.ellipse(r.pad, 0.085, 0.05, UB, 'm-bench');
    // мышцы
    out += D.muscleEll(comb(H, [POST, 0.07], [LF, 0.03]), 0.1, 0.075, UB, 'mu-m2', r.hI, uid);
    out += D.muscleLens(H, K, POST, 0.07, 0.2, 0.15, 0.03, 'mu-m2', r.hI, uid);
    const back = mul(ant, -1);
    out += D.muscleLens(onBody(r, 0.03), onBody(r, 0.38), r.piv > 0.01 ? POST : back, 0.07, 0.05, 0.25, 0.055, 'mu-m3', r.lI, uid);
    out += D.figure([[D.part('upperArm', sh, elbow, ant), D.part('foreArm', elbow, hand, mul(td, -1)), D.disc(hand, 0.04)]]);
    out += D.joints([H, r.Lp]);
    if (!mini) {
      out += D.ln(v(r.com.x, r.com.y + 0.15), v(r.com.x, r.com.y - 0.45), 'fline');
      if (r.Mh > 1) out += D.lever(H, r.com, v(0, -1), r.com.x - H.x, 'm2', { labelOff: -0.05 });
      out += D.lever(r.Lp, r.com, v(0, -1), r.com.x - r.Lp.x, 'm3', { labelOff: 0.05 });
    }
    out += D.arrow(r.com, add(r.com, v(0, -0.26)), 'ar-force', 6);
    return out;
  }

  const hp = {
    torso: (r) => add(r.S, mul(r.td, 0.32)),
    pad: (r) => comb(r.pad, [ANT, 0.13]),
  };

  function notes(r) {
    return [
      { lines: ['тяни: опустить', 'или поднять корпус'], x: 700, y: 40, from: [740, 80], to: hp.torso(r), circle: 26, bend: 0.3 },
      { lines: ['тяни: валик', 'ниже или выше таза'], x: 640, y: 560, from: [650, 545], to: hp.pad(r), circle: 26, bend: 0.3 },
      { lines: ['цветные отрезки —', 'плечи рычагов'], x: 30, y: 40, from: [140, 80], to: r.Lp, bend: -0.3, gap: 12 },
      { lines: ['светится —', 'значит работает'], x: 30, y: 300, from: [140, 320], to: comb(H, [POST, 0.08]), bend: 0.2, gap: 8 },
    ];
  }

  const handles = [
    {
      key: 'torso', label: 'Наклон корпуса вниз', pausesPlay: true,
      pos: hp.torso, axis: (r) => perp(r.td),
      drag: (st, w) => {
        const piv = Math.max(st.s, 0);
        const d = sub(w, add(H, mul(UB, piv)));
        st.phi = Math.atan2(UB.x * d.y - UB.y * d.x, dot(UB, d)) * -1;
      },
      step: (st, dir, k) => { st.phi -= dir * 3 * DEG * k; },
      value: (r) => ({ text: `корпус опущен на ${Math.round(r.phi / DEG)}°`, now: r.phi / DEG, min: 0, max: 120 }),
    },
    {
      key: 'pad', label: 'Положение валика',
      pos: hp.pad, axis: () => UB,
      drag: (st, w) => { st.s = dot(sub(w, H), UB); },
      step: (st, dir, k) => { st.s += dir * 0.01 * k; },
      value: (r) => ({ text: r.s > 0.02 ? 'валик на животе' : 'валик ниже таза', now: ((r.s - S_MIN) / (S_MAX - S_MIN)) * 100 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '100 20 760 700',
    mobileViewBox: '140 90 720 650',
    period: 3.2,
    initial: () => ({ s: -0.08, phi: 40 * DEG }),
    clamp(st) { st.s = clamp(st.s, S_MIN, S_MAX); st.phi = clamp(st.phi, 0, PHI_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * st.phi / (110 * DEG), -1, 1)),
    animate(st, ph, { mini }) {
      st.phi = 110 * DEG * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.s = 0.01 + 0.11 * Math.sin(ph * 0.21);
    },
  };

  const page = {
    muscles: [
      { key: 'h', name: 'Ягодицы и бицепс бедра', c: 'm2' },
      { key: 'l', name: 'Поясница', c: 'm3' },
    ],
    slider: {
      label: 'Где валик', left: 'Ниже таза · ягодицы', right: 'На животе · поясница', lc: 'm2', rc: 'm3',
      get: (r) => ((r.s - S_MIN) / (S_MAX - S_MIN)) * 100,
      set: (x) => ({ s: S_MIN + (x / 100) * (S_MAX - S_MIN) }),
    },
    presets: [
      { label: 'Валик под тазом', c: 'm2', state: { s: -0.1, phi: 45 * DEG } },
      { label: 'Валик на животе', c: 'm3', state: { s: 0.12, phi: 45 * DEG } },
      { label: 'Сбросить', state: { s: -0.08, phi: 40 * DEG } },
    ],
    read(r) {
      const deg = Math.round(r.phi / DEG);
      const main = r.s <= 0.0
        ? 'Валик ниже тазобедренного сустава — тело сгибается в тазу. Корпус поднимают <b class="c-m2">ягодицы и бицепс бедра</b>, поясница держит спину ровной.'
        : r.s > 0.07
          ? 'Валик на животе — таз зажат и сгибаться не может. Двигается позвоночник, работает <b class="c-m3">поясница</b>.'
          : 'Валик на уровне таза — работа делится между тазом и поясницей.';
      const depth = deg > 95
        ? '<b>Корпус почти вертикально вниз</b> — центр масс близко к опоре, нагрузка меньше всего.'
        : deg < 15
          ? '<b>Корпус на одной линии с ногами</b> — плечи рычагов самые длинные, это самая тяжёлая точка.'
          : 'Чем ближе корпус к линии ног, тем длиннее рычаг и тем тяжелее.';
      const warnings = [];
      if (r.phi < 3 * DEG && r.s > 0.05) warnings.push('<strong>Не переразгибайся.</strong> Поднимайся до прямой линии с ногами — выше поясница прогибается под нагрузкой.');
      return {
        loads: { h: r.Mh, l: r.Ml },
        nums: [
          ['Плечо у таза', r.Mh > 1 ? Math.round((r.com.x - H.x) * 100) + ' см' : 'таз зажат'],
          ['Плечо у поясницы', Math.round(Math.max(r.com.x - r.Lp.x, 0) * 100) + ' см'],
          ['Корпус опущен', `${deg}°`],
          ['Валик', r.s > 0.02 ? 'на животе' : 'ниже таза'],
        ],
        notes: [[r.s > 0.04 ? 'm3' : 'm2', main], ['f', depth]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES['back-extension'] = { model, page };
})(window);
