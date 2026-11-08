/* Махи гантелями в стороны: вид спереди.
   Ты поднимаешь руку (угол от вертикали) и сгибаешь локоть.
   Согнутый локоть уводит предплечье вперёд — в плоскости рисунка рычаг короче. */
(function (global) {
  'use strict';
  const { DEG, v, add, mul, perp, clamp, makeView } = global.Bio;

  const L = { upperArm: 0.3, foreArm: 0.27 };
  const G = 9.81;
  const KG = 8;
  const SH = 0.19;
  const TH_MAX = 120 * DEG, PHI_MAX = 75 * DEG;
  const REF = KG * G * (L.upperArm + L.foreArm);

  const VIEW = makeView(500, 290, 420);
  const CH = { x: 690, y: 440, w: 290, h: 190 };
  const CHM = { x: 180, y: 800, w: 640, h: 170 };                 // график под фигурой на телефоне
  const box = (ctx) => (ctx && ctx.narrow ? CHM : CH);

  function arm(side, th, phi) {
    const S = v(side * SH, 0);
    const u = v(side * Math.sin(th), -Math.cos(th));
    const E = add(S, mul(u, L.upperArm));
    const Hd = add(E, mul(u, L.foreArm * Math.cos(phi)));
    return { S, E, Hd, u };
  }
  const delt = (th, phi) => KG * G * (L.upperArm + L.foreArm * Math.cos(phi)) * Math.sin(th);

  function solve(st) {
    const R = arm(1, st.th, st.phi);
    const Lf = arm(-1, st.th, st.phi);
    const Md = delt(st.th, st.phi);
    const t = clamp((st.th - 70 * DEG) / (40 * DEG), 0, 1);
    const Mt = 0.55 * t * KG * G * (L.upperArm + L.foreArm * Math.cos(st.phi));
    const curve = [];
    for (let a = 0; a <= TH_MAX + 1e-9; a += 3 * DEG) curve.push([a, delt(a, st.phi)]);
    return { ...st, R, Lf, Md, Mt, curve, arm: R.Hd.x - R.S.x, dI: clamp(Md / REF, 0, 1), tI: clamp(Mt / (REF * 0.55), 0, 1) };
  }

  function drawStatic({ D }) {
    const torso = D.blob([
      v(0, 0.07), v(0.09, 0.07), v(0.2, 0.035), v(0.23, -0.04), v(0.17, -0.16), v(0.15, -0.3), v(0.14, -0.4),
      v(0.18, -0.52), v(0.12, -0.6), v(0, -0.62), v(-0.12, -0.6), v(-0.18, -0.52), v(-0.14, -0.4), v(-0.15, -0.3),
      v(-0.17, -0.16), v(-0.23, -0.04), v(-0.2, 0.035), v(-0.09, 0.07),
    ]);
    const up = v(0, 1), fr = v(1, 0);
    return D.figure([[
      D.part('thigh', v(0.1, -0.55), v(0.11, -1.0), fr), D.part('thigh', v(-0.1, -0.55), v(-0.11, -1.0), mul(fr, -1)),
      torso, D.part('neck', v(0, 0.03), v(0, 0.15), fr), D.head(v(0, 0.22), up, fr),
    ]]);
  }

  function chart(r, B) {
    const { x, y, w, h } = B;
    const max = REF * 1.02;
    const px = (a) => x + 30 + (a / TH_MAX) * (w - 44);
    const py = (m) => y + h - 30 - (m / max) * (h - 56);
    const pts = r.curve.map(([a, m]) => `${px(a).toFixed(1)},${py(m).toFixed(1)}`).join(' ');
    const x90 = px(90 * DEG).toFixed(1);
    return `<line x1="${x + 30}" y1="${y + h - 30}" x2="${x + w - 10}" y2="${y + h - 30}" class="chart-axis"/>` +
      `<line x1="${x + 30}" y1="${y + 22}" x2="${x + 30}" y2="${y + h - 30}" class="chart-axis"/>` +
      `<line x1="${x90}" y1="${y + 22}" x2="${x90}" y2="${y + h - 30}" class="chart-axis" stroke-dasharray="3 5"/>` +
      `<text x="${x + 30}" y="${y + 14}" class="chart-lbl">нагрузка на дельту</text>` +
      `<text x="${x + 30}" y="${y + h - 10}" class="chart-lbl">руки внизу</text>` +
      `<text x="${x90}" y="${y + h - 10}" class="chart-lbl" text-anchor="middle">90°</text>` +
      `<polyline points="${pts}" class="chart-curve"/>` +
      `<circle cx="${px(r.th).toFixed(1)}" cy="${py(r.Md).toFixed(1)}" r="8" class="chart-dot"/>`;
  }

  function draw(r, ctx) {
    const { D, uid, mini } = ctx;
    let out = '';
    // мышцы под руками: трапеция и дельта на плечах
    for (const A of [r.R, r.Lf]) {
      const sd = Math.sign(A.S.x);
      out += D.muscleLens(v(sd * 0.05, 0.11), v(sd * 0.2, 0.03), v(0, 1), 0.06, 0.05, 0.05, 0.0, 'mu-m3', r.tI, uid);
    }
    const arms = [];
    for (const A of [r.Lf, r.R]) {
      const fr = perp(A.u);
      arms.push(D.part('upperArm', A.S, A.E, fr), D.part('foreArm', A.E, A.Hd, fr), D.disc(A.Hd, 0.042));
    }
    out += D.figure([arms]);
    for (const A of [r.R, r.Lf]) {
      out += D.muscleEll(add(A.S, mul(A.u, 0.05)), 0.075, 0.06, A.u, 'mu-m1', r.dI, uid);
      out += D.circ(A.Hd, D.px(0.065), 'm-weight') + D.circ(A.Hd, D.px(0.018), 'm-hub');
    }
    out += D.joints([r.R.S, r.Lf.S, r.R.E, r.Lf.E]);
    if (!mini) {
      out += D.ln(v(r.R.Hd.x, r.R.Hd.y + 0.2), v(r.R.Hd.x, Math.min(r.R.Hd.y, 0) - 0.3), 'fline');
      out += D.lever(r.R.S, r.R.Hd, v(0, -1), r.arm, 'm1', { labelOff: 0.05 });
      out += chart(r, box(ctx));
    }
    for (const A of [r.R, r.Lf]) out += D.arrow(add(A.Hd, v(0, -0.07)), add(A.Hd, v(0, -0.28)), 'ar-force', 5);
    return out;
  }

  const hp = { db: (r) => add(r.R.Hd, mul(r.R.u, 0.12)) };

  function notes(r, ctx) {
    return [
      { lines: ['тяни: поднять', 'или опустить руку'], x: 760, y: 40, from: [800, 80], to: hp.db(r), circle: 26, bend: 0.3 },
      { lines: ['цветной отрезок —', 'плечо рычага'], x: 40, y: 40, from: [150, 80], to: v(r.R.S.x + r.arm / 2, 0), bend: -0.3, gap: 10 },
      { lines: ['светится —', 'значит работает'], x: 40, y: 330, from: [150, 340], to: add(r.Lf.S, mul(r.Lf.u, 0.06)), bend: 0.2, gap: 10 },
      { lines: ['график: где тяжелее всего.', 'точка — ты сейчас'], x: box(ctx).x, y: box(ctx).y - 22, from: null },
    ];
  }

  const handles = [
    {
      key: 'db', label: 'Поднять или опустить руку', pausesPlay: true,
      pos: hp.db, axis: (r) => perp(r.R.u),
      drag: (st, w) => { st.th = Math.atan2(w.x - SH, -w.y); },
      step: (st, dir, k) => { st.th += dir * 3 * DEG * k; },
      value: (r) => ({ text: `рука поднята на ${Math.round(r.th / DEG)}°`, now: r.th / DEG, min: 0, max: 120 }),
    },
  ];

  const model = {
    view: VIEW,
    viewBox: '0 0 1000 724',
    miniViewBox: '120 60 760 660',
    mobileViewBox: '120 110 770 880',
    period: 3,
    initial: () => ({ th: 70 * DEG, phi: 15 * DEG }),
    clamp(st) { st.th = clamp(st.th, 0, TH_MAX); st.phi = clamp(st.phi, 0, PHI_MAX); },
    solve, drawStatic, draw, notes, handles,
    phaseOf: (st) => Math.acos(clamp(1 - 2 * (st.th - 5 * DEG) / (95 * DEG), -1, 1)),
    animate(st, ph, { mini }) {
      st.th = 5 * DEG + 95 * DEG * (0.5 - 0.5 * Math.cos(ph));
      if (mini) st.phi = 30 * DEG + 25 * DEG * Math.sin(ph * 0.21);
    },
  };

  const page = {
    muscles: [
      { key: 'd', name: 'Средняя дельта', c: 'm1' },
      { key: 't', name: 'Трапеция', c: 'm3' },
    ],
    slider: {
      label: 'Локоть', left: 'Прямая рука · тяжелее', right: 'Согнутый · легче', lc: 'm1', rc: 'm3',
      get: (r) => (r.phi / PHI_MAX) * 100,
      set: (x) => ({ phi: (x / 100) * PHI_MAX }),
    },
    presets: [
      { label: 'Прямые руки', c: 'm1', state: { phi: 0, th: 90 * DEG } },
      { label: 'Локти согнуты', state: { phi: 60 * DEG, th: 90 * DEG } },
      { label: 'Выше плеч', c: 'm3', state: { phi: 15 * DEG, th: 115 * DEG } },
    ],
    read(r) {
      const cm = (m) => Math.round(Math.abs(m) * 100) + ' см';
      const deg = Math.round(r.th / DEG);
      const pct = Math.round((r.Md / delt(90 * DEG, r.phi)) * 100);
      const main = deg < 25
        ? 'Руки внизу — гантель почти под плечом, <b class="c-m1">дельте</b> нечего держать. Нагрузка растёт по мере подъёма.'
        : deg <= 100
          ? `Рука поднята на ${deg}° — <b class="c-m1">дельта</b> держит ${pct}% от максимума. Тяжелее всего, когда рука горизонтальна.`
          : 'Выше плеч рычаг снова короче, а поднимать руку помогает <b class="c-m3">трапеция</b>: лопатка поворачивается вверх.';
      const bend = r.phi > 35 * DEG
        ? `<b>Локоть согнут.</b> Гантель ближе к плечу — плечо рычага ${cm(r.arm)} вместо ${cm((L.upperArm + L.foreArm) * Math.sin(r.th))}. Можно взять вес больше.`
        : '<b>Рука почти прямая</b> — максимальный рычаг. Тот же вес ощущается тяжелее.';
      const warnings = [];
      if (r.th > 110 * DEG) warnings.push('<strong>Руки выше плеч.</strong> Если плечо дискомфортно — останавливайся на уровне плеч.');
      return {
        loads: { d: r.Md, t: r.Mt },
        nums: [
          ['Плечо рычага', cm(r.arm)],
          ['Подъём руки', `${deg}°`],
          ['Сгибание локтя', `${Math.round(r.phi / DEG)}°`],
          ['Нагрузка дельты', `${pct}% от пика`],
        ],
        notes: [['m1', main], ['f', bend]],
        warnings,
      };
    },
  };

  global.EXERCISES = global.EXERCISES || {};
  global.EXERCISES.raise = { model, page };
})(window);
