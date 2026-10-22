/* JWFX — canvas particles (confetti, sparks, fireworks, ambient glow) + shake/flash/popups. */
window.JWFX = (() => {
  // Web Animations API with a no-op fallback for browsers/environments without element.animate
  const anim = (el, keyframes, options) =>
    el.animate ? el.animate(keyframes, options) : { finished: new Promise((r) => setTimeout(r, options.duration)) };
  const cv = document.createElement("canvas");
  cv.id = "fxCanvas";
  document.body.appendChild(cv);
  const c = cv.getContext("2d");
  let W = 0,
    H = 0,
    dpr = 1,
    parts = [],
    raf = 0,
    ambientOn = false,
    amb = [];
  const COLORS = ["#3d8bff", "#ff5f6d", "#4be495", "#a36cff", "#ff9c4a", "#ff69b4", "#ffd84d", "#4de3ff"];
  const rnd = (a, b) => a + Math.random() * (b - a),
    pick = (a) => a[(Math.random() * a.length) | 0];
  const opts = { on: () => true };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ok = () => opts.on() && !reduced();

  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", size);
  size();

  function add(p) {
    parts.push(
      Object.assign(
        {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          g: 600,
          life: 1.2,
          age: 0,
          s: 4,
          shape: "dot",
          col: "#fff",
          rot: 0,
          vr: 0,
          drag: 0.99,
          glow: 0,
        },
        p,
      ),
    );
    kick();
  }
  function kick() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  let last = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    c.clearRect(0, 0, W, H);
    if (ambientOn && ok()) drawAmbient(dt);
    parts = parts.filter((p) => (p.age += dt) < p.life);
    for (const p of parts) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const a = Math.max(0, 1 - Math.pow(p.age / p.life, 2.2));
      c.globalAlpha = a;
      c.fillStyle = p.col;
      c.shadowBlur = p.glow;
      c.shadowColor = p.col;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      if (p.shape === "rect") c.fillRect(-p.s / 2, -p.s * 0.9, p.s, p.s * 1.8);
      else if (p.shape === "star") {
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? p.s * 0.4 : p.s;
          c.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r);
        }
        c.fill();
      } else {
        c.beginPath();
        c.arc(0, 0, p.s, 0, 7);
        c.fill();
      }
      c.restore();
    }
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    raf = parts.length || (ambientOn && ok() && !document.hidden) ? requestAnimationFrame(loop) : 0;
  }
  function drawAmbient(dt) {
    while (amb.length < 38)
      amb.push({
        x: rnd(0, W),
        y: rnd(0, H),
        r: rnd(1.5, 5),
        vy: rnd(-14, -4),
        vx: rnd(-6, 6),
        ph: rnd(0, 6),
        col: pick(COLORS),
      });
    for (const o of amb) {
      o.y += o.vy * dt;
      o.x += o.vx * dt + Math.sin((o.ph += dt * 0.6)) * 0.15;
      if (o.y < -10) {
        o.y = H + 10;
        o.x = rnd(0, W);
      }
      c.globalAlpha = 0.22 + Math.sin(o.ph * 2) * 0.12;
      c.fillStyle = o.col;
      c.shadowBlur = 14;
      c.shadowColor = o.col;
      c.beginPath();
      c.arc(o.x, o.y, o.r, 0, 7);
      c.fill();
    }
    c.shadowBlur = 0;
  }
  const center = (el) => {
    if (!el) return { x: W / 2, y: H / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const api = {
    configure(o) {
      Object.assign(opts, o);
    },
    ambient(on) {
      ambientOn = !!on;
      if (on) kick();
      else amb = [];
    },
    burst(x, y, o = {}) {
      if (!ok()) return;
      const n = o.n || 36,
        cols = o.colors || COLORS;
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.28),
          sp = rnd(80, o.speed || 420);
        add({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          g: o.g ?? 500,
          s: rnd(2, 5),
          col: pick(cols),
          shape: pick(["dot", "star", "dot"]),
          life: rnd(0.6, 1.2),
          glow: 10,
          vr: rnd(-8, 8),
        });
      }
    },
    burstAt(el, o) {
      const p = center(el);
      api.burst(p.x, p.y, o);
    },
    confetti(n = 150) {
      if (!ok()) return;
      for (let i = 0; i < n; i++)
        add({
          x: rnd(0, W),
          y: rnd(-80, -10),
          vx: rnd(-90, 90),
          vy: rnd(60, 260),
          g: 260,
          drag: 0.985,
          s: rnd(5, 9),
          shape: "rect",
          col: pick(COLORS),
          rot: rnd(0, 6),
          vr: rnd(-9, 9),
          life: rnd(2.6, 4.6),
        });
    },
    fireworks(count = 6) {
      if (!ok()) return;
      for (let k = 0; k < count; k++)
        setTimeout(() => {
          const x = rnd(W * 0.15, W * 0.85),
            y = rnd(H * 0.12, H * 0.5),
            cols = [pick(COLORS), pick(COLORS), "#fff"];
          window.JWAudio?.sfx("sparkle");
          for (let i = 0; i < 70; i++) {
            const a = (i / 70) * 6.28,
              sp = rnd(120, 300);
            add({
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              g: 160,
              drag: 0.96,
              s: rnd(1.8, 3.2),
              col: pick(cols),
              life: rnd(1, 1.7),
              glow: 12,
            });
          }
        }, k * 380);
    },
    rain(col = "#ff6073") {
      if (!ok()) return;
      for (let i = 0; i < 40; i++)
        add({
          x: rnd(0, W),
          y: -10,
          vx: 0,
          vy: rnd(200, 500),
          g: 500,
          s: rnd(1.5, 3),
          col,
          life: rnd(0.7, 1.2),
        });
    },
    // Effects below use the Web Animations API (element.animate) instead of CSS classes.
    shake(el = document.body, ms = 420) {
      if (!ok()) return;
      const k = [0, -9, 9, -9, 9, -5, 5, 0].map((x) => ({ transform: `translate3d(${x}px, ${x ? -1 : 0}px, 0)` }));
      anim(el, k, { duration: ms, easing: "cubic-bezier(.36,.07,.19,.97)" });
    },
    flash(col = "#fff", ms = 350) {
      if (!ok()) return;
      const f = document.createElement("div");
      f.className = "fx-flash";
      f.style.cssText = `background:${col};animation:none`;
      document.body.appendChild(f);
      anim(f, [{ opacity: 0.75 }, { opacity: 0 }], { duration: ms, easing: "ease-out" }).finished.then(() => f.remove());
    },
    popup(el, text, cls = "") {
      if (!opts.on()) return;
      const p = center(el),
        d = document.createElement("div");
      d.className = "fx-popup " + cls;
      d.textContent = text;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;animation:none;opacity:0`;
      document.body.appendChild(d);
      anim(d, 
        [
          { opacity: 0, transform: "translate(-50%,-30%) scale(.5)" },
          { opacity: 1, transform: "translate(-50%,-60%) scale(1.25)", offset: 0.18 },
          { opacity: 0, transform: "translate(-50%,-190%) scale(1)" },
        ],
        { duration: 1400, easing: "cubic-bezier(.2,.8,.2,1)" },
      ).finished.then(() => d.remove());
    },
    ripple(el, e) {
      if (!ok() || !el) return;
      const r = el.getBoundingClientRect(),
        d = document.createElement("span");
      d.className = "fx-ripple";
      d.style.cssText = `left:${(e?.clientX ?? r.left + r.width / 2) - r.left}px;top:${(e?.clientY ?? r.top + r.height / 2) - r.top}px;animation:none`;
      el.appendChild(d);
      anim(d, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(26)", opacity: 0 }], { duration: 650, easing: "ease-out" }).finished.then(() => d.remove());
    },
    countUp(el, from, to, ms = 700) {
      if (!el || from === to || !ok()) return;
      const t0 = performance.now();
      const tick = (n) => {
        const k = Math.min(1, (n - t0) / ms),
          e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    colors: COLORS,
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ambientOn) kick();
  });
  return api;
})();
