/* JWAudio — one shared AudioContext, synthesized SFX and an original generative soundtrack. No audio files. */
window.JWAudio = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, master, sfxBus, musBus, celBus, rev, dly;
  const cfg = { sfxOn: true, musicOn: false, sfx: 1, music: 0.35, cel: 0.7 };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const gain = (v) => {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  };

  function init() {
    if (ctx || !AC) return ctx;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = gain(0.9);
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = gain(1);
    musBus = gain(0);
    celBus = gain(1);
    [sfxBus, musBus, celBus].forEach((b) => b.connect(master));
    const len = ctx.sampleRate * 1.6,
      ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    rev = ctx.createConvolver();
    rev.buffer = ir;
    const rg = gain(0.4);
    rev.connect(rg);
    rg.connect(master);
    dly = ctx.createDelay(1);
    dly.delayTime.value = 0.36;
    const fb = gain(0.32);
    dly.connect(fb);
    fb.connect(dly);
    dly.connect(musBus);
    applyVol();
    return ctx;
  }
  function applyVol() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(cfg.sfxOn ? cfg.sfx : 0, t, 0.02);
    celBus.gain.setTargetAtTime(cfg.sfxOn ? cfg.cel : 0, t, 0.02);
    musBus.gain.setTargetAtTime(cfg.musicOn ? cfg.music * 1.5 : 0, t, 0.4);
  }
  function unlock() {
    init();
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
    if (cfg.musicOn) startSeq();
    return !!ctx;
  }

  // ---- primitives ----
  function tone(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t || 0),
      d = o.d || 0.2,
      bus = o.bus || sfxBus;
    const osc = ctx.createOscillator(),
      g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.v || 0.2), t + (o.a || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let n = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      osc.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(bus);
    if (o.wet) {
      const s = gain(o.wet);
      g.connect(s);
      s.connect(rev);
    }
    osc.start(t);
    osc.stop(t + d + 0.05);
  }
  function noise(o) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.t || 0),
      d = o.d || 0.3,
      len = Math.ceil(ctx.sampleRate * d);
    const b = ctx.createBuffer(1, len, ctx.sampleRate),
      x = b.getChannelData(0);
    for (let i = 0; i < len; i++) x[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.v || 0.2, t + (o.a || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f);
    f.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.wet) {
      const w = gain(o.wet);
      g.connect(w);
      w.connect(rev);
    }
    s.start(t);
  }
  const arp = (notes, step, o) => notes.forEach((f, i) => tone({ ...o, f, t: (o.t || 0) + i * step }));

  // ---- sound effects ----
  const SFX = {
    click: () => tone({ f: 700, to: 420, d: 0.06, v: 0.12, type: "triangle" }),
    hover: () => tone({ f: 1500, d: 0.03, v: 0.025, type: "sine" }),
    toggle: () => arp([660, 990], 0.05, { d: 0.08, v: 0.1, type: "triangle" }),
    open: () => {
      noise({ f: 400, to: 5000, d: 0.3, v: 0.18, q: 2 });
      arp([392, 523, 659, 784], 0.045, { d: 0.35, v: 0.14, type: "triangle", wet: 0.5 });
    },
    close: () => tone({ f: 600, to: 300, d: 0.14, v: 0.1, type: "triangle" }),
    reveal: () => {
      tone({ f: 660, to: 990, d: 0.25, v: 0.12, wet: 0.5 });
      tone({ f: 1980, t: 0.12, d: 0.5, v: 0.06, wet: 0.8 });
    },
    hint: () => {
      tone({ f: 1320, d: 0.7, v: 0.12, wet: 0.9 });
      tone({ f: 1980, t: 0.08, d: 0.6, v: 0.06, wet: 0.9 });
    },
    correct: () => {
      arp([523, 659, 784, 1047], 0.07, { d: 0.45, v: 0.16, type: "triangle", wet: 0.6 });
      arp([2093, 2637, 3136], 0.06, { t: 0.22, d: 0.4, v: 0.05, wet: 0.9 });
    },
    wrong: () => {
      tone({ f: 233, to: 110, d: 0.5, v: 0.2, type: "sawtooth", lp: 900 });
      tone({ f: 175, to: 82, d: 0.55, v: 0.16, type: "square", lp: 600 });
    },
    tick: (n) =>
      tone({ f: n <= 3 ? 1500 : 1000, d: 0.04, v: n <= 3 ? 0.13 : 0.07, type: "square", lp: 3000 }),
    buzzer: () => {
      tone({ f: 150, d: 0.8, v: 0.22, type: "sawtooth", lp: 1200 });
      tone({ f: 156, d: 0.8, v: 0.18, type: "square", lp: 900 });
    },
    buzz: (i = 0) => {
      const f = 440 * Math.pow(2, (i % 8) / 6);
      arp([f, f * 1.5], 0.07, { d: 0.18, v: 0.16, type: "square", lp: 2600 });
    },
    start: () => {
      noise({ f: 300, to: 7000, d: 0.5, v: 0.2, q: 1.5 });
      arp([262, 330, 392, 523], 0.08, { d: 0.5, v: 0.15, type: "triangle", wet: 0.6 });
    },
    flip: () => {
      noise({ f: 3500, d: 0.035, v: 0.1, q: 4 });
      tone({ f: 1800 + Math.random() * 600, d: 0.03, v: 0.04 });
    },
    whoosh: () => noise({ f: 300, to: 4500, d: 0.45, v: 0.16, q: 0.8, wet: 0.3 }),
    streak: () => {
      noise({ f: 500, to: 6000, d: 0.6, v: 0.16, q: 1, wet: 0.5 });
      arp([523, 659, 784, 1047, 1319], 0.06, { d: 0.4, v: 0.12, type: "sawtooth", lp: 3200, wet: 0.6 });
    },
    score: (n = 0) => tone({ f: 800 + n * 40, d: 0.05, v: 0.05, type: "triangle" }),
    impact: () => {
      tone({ f: 110, to: 32, d: 1.6, v: 0.6, wet: 0.4 });
      noise({ f: 1800, to: 120, d: 1.2, v: 0.3, type: "lowpass", wet: 0.6 });
      arp([262, 392, 523, 659], 0.01, { d: 1.8, v: 0.08, type: "sawtooth", lp: 2400, wet: 1 });
    },
    riser: () => {
      noise({ f: 200, to: 7000, d: 2.2, v: 0.12, q: 1.2, a: 1.6, wet: 0.4 });
      tone({ f: 110, to: 440, d: 2.2, v: 0.06, type: "sawtooth", lp: 1400, a: 1.8 });
    },
    fanfare: () => {
      const b = { type: "sawtooth", lp: 2800, wet: 0.6, bus: celBus };
      [
        [523, 0, 0.14],
        [523, 0.16, 0.14],
        [523, 0.32, 0.14],
        [659, 0.48, 0.22],
        [523, 0.74, 0.14],
        [659, 0.9, 0.14],
      ].forEach(([f, t, d]) => tone({ ...b, f, t, d: d + 0.1, v: 0.1 }));
      [
        [784, 1.1],
        [1047, 1.1],
        [659, 1.1],
        [523, 1.1],
      ].forEach(([f, t]) => tone({ ...b, f, t, d: 1.6, v: 0.07 }));
    },
    applause: () => {
      for (let i = 0; i < 70; i++)
        noise({
          t: Math.random() * 2.8,
          d: 0.05,
          v: 0.1 * (0.4 + Math.random()),
          f: 1500 + Math.random() * 3000,
          q: 0.8,
          bus: celBus,
        });
    },
    sparkle: () => arp([2093, 2637, 3136, 3951], 0.045, { d: 0.3, v: 0.05, wet: 0.9 }),
  };
  function sfx(name, arg) {
    if (!cfg.sfxOn || !ctx) return;
    try {
      (SFX[name] || SFX.click)(arg);
    } catch (e) {
      /* ignore */
    }
  }

  // ---- generative soundtrack (original chord loops, step sequencer with look-ahead) ----
  const MAJ = [0, 4, 7],
    MIN = [0, 3, 7];
  const MOODS = {
    menu: {
      bpm: 78,
      prog: [
        [48, MAJ],
        [45, MIN],
        [41, MAJ],
        [43, MAJ],
      ],
      pad: 0.5,
      bass: 0.5,
      arp: 0.5,
      kick: 0,
      hat: 0,
    },
    board: {
      bpm: 104,
      prog: [
        [48, MAJ],
        [43, MAJ],
        [45, MIN],
        [41, MAJ],
      ],
      pad: 0.4,
      bass: 0.8,
      arp: 0.6,
      kick: 0.7,
      hat: 0.5,
    },
    think: {
      bpm: 92,
      prog: [
        [45, MIN],
        [41, MAJ],
        [48, MAJ],
        [43, MAJ],
      ],
      pad: 0.25,
      bass: 0.9,
      arp: 0.35,
      kick: 0,
      hat: 0.8,
      tickOnly: true,
    },
    victory: {
      bpm: 122,
      prog: [
        [41, MAJ],
        [43, MAJ],
        [48, MAJ],
        [48, MAJ],
      ],
      pad: 0.5,
      bass: 0.9,
      arp: 0.8,
      kick: 0.9,
      hat: 0.7,
    },
  };
  let cur = MOODS.menu,
    pending = null,
    timer = null,
    step = 0,
    next = 0;
  function mood(name) {
    if (MOODS[name] && MOODS[name] !== cur) pending = MOODS[name];
  }
  function startSeq() {
    if (timer || !ctx) return;
    next = ctx.currentTime + 0.1;
    step = 0;
    timer = setInterval(sched, 30);
  }
  function stopSeq() {
    clearInterval(timer);
    timer = null;
  }
  function mv(f, t, d, type, v, send, lp) {
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      fl = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    fl.type = "lowpass";
    fl.frequency.value = lp || 2400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.04, d / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(fl);
    fl.connect(g);
    g.connect(musBus);
    if (send) {
      const s = gain(send);
      g.connect(s);
      s.connect(dly);
    }
    o.start(t);
    o.stop(t + d + 0.05);
  }
  function mnoise(t, d, v, f, hp) {
    const len = Math.ceil(ctx.sampleRate * d),
      b = ctx.createBuffer(1, len, ctx.sampleRate),
      x = b.getChannelData(0);
    for (let i = 0; i < len; i++) x[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(),
      fl = ctx.createBiquadFilter(),
      g = ctx.createGain();
    s.buffer = b;
    fl.type = hp ? "highpass" : "bandpass";
    fl.frequency.value = f;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl);
    fl.connect(g);
    g.connect(musBus);
    s.start(t);
  }
  function sched() {
    if (!ctx || !cfg.musicOn) return;
    if (next < ctx.currentTime - 0.2) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.15) {
      const sp = 60 / cur.bpm / 4,
        s = step % 64,
        bar = Math.floor(s / 16) % 4,
        p = s % 16,
        [root, ch] = cur.prog[bar];
      if (p === 0) {
        if (pending && s % 64 === 0) {
          cur = pending;
          pending = null;
        }
        ch.forEach((i) => {
          mv(mtof(root + 12 + i), next, sp * 16, "sawtooth", 0.022 * cur.pad, 0, 900);
          mv(mtof(root + 12 + i) * 1.004, next, sp * 16, "sawtooth", 0.018 * cur.pad, 0, 900);
        });
      }
      if ([0, 6, 8, 14].includes(p))
        mv(mtof(root - 12 + (p === 14 ? 7 : 0)), next, sp * 3, "triangle", 0.1 * cur.bass, 0, 500);
      if (!cur.tickOnly || p % 4 === 0) {
        const tones = [...ch, ...ch.map((i) => i + 12)],
          n = tones[((p / 2) | 0) % tones.length];
        if (p % 2 === 0) mv(mtof(root + 24 + n), next, sp * 3, "triangle", 0.05 * cur.arp, 0.4, 3200);
      }
      if (cur.kick && (p === 0 || p === 8)) {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.frequency.setValueAtTime(130, next);
        o.frequency.exponentialRampToValueAtTime(40, next + 0.16);
        g.gain.setValueAtTime(0.3 * cur.kick, next);
        g.gain.exponentialRampToValueAtTime(0.0001, next + 0.2);
        o.connect(g);
        g.connect(musBus);
        o.start(next);
        o.stop(next + 0.22);
      }
      if (cur.kick && (p === 4 || p === 12)) mnoise(next, 0.12, 0.12 * cur.kick, 1800);
      if (cur.hat && p % 2 === 1) mnoise(next, 0.04, 0.05 * cur.hat, 7000, true);
      next += sp;
      step++;
    }
  }

  return {
    unlock,
    sfx,
    mood,
    configure(o) {
      Object.assign(cfg, o);
      if (!AC) return;
      if (ctx) {
        applyVol();
        cfg.musicOn ? startSeq() : null;
      }
    },
    ctx: () => ctx,
  };
})();
