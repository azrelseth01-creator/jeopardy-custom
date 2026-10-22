/* Intro + loading screen. The progress bar reflects real startup steps; "Press Start" unlocks audio and opens the show. */
(() => {
  const $ = (id) => document.getElementById(id),
    root = $("intro");
  if (!root) return;
  const A = window.JWAudio,
    FX = window.JWFX,
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.add("intro-open");
  const MIN_MS = reduce ? 600 : 3600;
  const COLS = ["#2166c9", "#22a46e", "#8d5fe8", "#f18a41", "#e25a9a"];
  const FACTS = [
    "The Bible contains 66 books.",
    "Psalm 117 is the shortest chapter in the Bible.",
    "Psalm 119 is the longest chapter in the Bible.",
    "The Bible was written over a span of about 1,600 years.",
    "Joshua marched around Jericho for seven days.",
    "Ready your family: every question is a chance to learn together.",
  ];
  const STEPS = [
    ["Warming up the stage…", () => document.fonts?.ready || 0],
    ["Shuffling the question bank…", () => window.JW?.ready],
    ["Tuning the band…", () => new Promise((r) => setTimeout(r, 450))],
    ["Setting up the board…", () => new Promise((r) => setTimeout(r, 300))],
  ];

  // logo letters + board tiles
  const logo = $("introLogo");
  [..."JEOPARDY"].forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.animationDelay = 0.25 + i * 0.09 + "s";
    logo.appendChild(s);
  });
  const board = $("introBoard"),
    tiles = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const t = document.createElement("div");
      t.className = "intro-tile";
      t.textContent = (r + 1) * 100;
      t.style.setProperty("--tc", COLS[c]);
      board.appendChild(t);
      tiles.push(t);
    }
  tiles.forEach((t, i) => setTimeout(() => t.classList.add("in"), 150 + i * 28));
  const order = tiles.map((_, i) => i).sort(() => Math.random() - 0.5);

  // progress
  let done = 0,
    shown = 0,
    ready = false,
    started = false,
    factI = 0;
  const t0 = performance.now(),
    fill = $("introFill"),
    pct = $("introPct"),
    status = $("introStatus"),
    startBtn = $("introStart"),
    fact = $("introFact");
  fact.textContent = FACTS[0];
  const factTimer = setInterval(() => {
    fact.style.opacity = 0;
    setTimeout(() => {
      fact.textContent = FACTS[++factI % FACTS.length];
      fact.style.opacity = 1;
    }, 350);
  }, 2600);
  STEPS.forEach(([label, fn], i) =>
    Promise.resolve()
      .then(fn)
      .catch(() => {})
      .then(() => {
        done++;
      }),
  );
  let skip = false;
  (function frame() {
    const elapsed = performance.now() - t0,
      target = skip ? 1 : Math.min(done / STEPS.length, elapsed / MIN_MS);
    shown += (target - shown) * 0.12;
    if (target - shown < 0.002) shown = target;
    fill.style.width = shown * 100 + "%";
    pct.textContent = Math.round(shown * 100) + "%";
    const lit = Math.floor(shown * tiles.length);
    order.slice(0, lit).forEach((i) => tiles[i].classList.add("lit"));
    status.textContent =
      shown >= 1 ? "Ready!" : STEPS[Math.min(STEPS.length - 1, Math.floor(shown * STEPS.length))][0];
    if (shown >= 1 && !ready) {
      ready = true;
      clearInterval(factTimer);
      fact.textContent = "Tap, click, or press Enter to begin.";
      fact.style.opacity = 1;
      startBtn.classList.add("show");
      startBtn.focus({ preventScroll: true });
    }
    if (!started) requestAnimationFrame(frame);
  })();

  // background: sweeping spotlights + stars
  const cv = $("introCv"),
    g = cv.getContext("2d");
  let W,
    H,
    stars = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.6 + 0.3,
      p: Math.random() * 6,
    }));
  const rs = () => {
    W = cv.width = innerWidth;
    H = cv.height = innerHeight;
  };
  rs();
  addEventListener("resize", rs);
  let bgOn = true;
  (function bg(now) {
    if (!bgOn) return;
    g.clearRect(0, 0, W, H);
    const t = now / 1000;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + Math.sin(t * 0.5 + i * 2.1) * 0.55,
        x = W * (0.2 + i * 0.3),
        len = H * 1.3,
        w = 0.12;
      const gr = g.createLinearGradient(x, H, x + Math.cos(a) * len, H + Math.sin(a) * len);
      gr.addColorStop(0, ["rgba(77,227,255,.28)", "rgba(255,216,77,.24)", "rgba(255,105,180,.26)"][i]);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + Math.cos(a - w) * len, H + Math.sin(a - w) * len);
      g.lineTo(x + Math.cos(a + w) * len, H + Math.sin(a + w) * len);
      g.fill();
    }
    g.fillStyle = "#fff";
    for (const s of stars) {
      g.globalAlpha = 0.3 + Math.sin(t * 1.5 + s.p) * 0.3;
      g.beginPath();
      g.arc(s.x * W, s.y * H, s.r, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    requestAnimationFrame(bg);
  })(0);

  function begin() {
    if (started || !ready) {
      if (!ready) skip = true;
      return;
    }
    started = true;
    startBtn.classList.remove("show");
    A?.unlock();
    A?.sfx("impact");
    setTimeout(() => A?.sfx("start"), 250);
    logo.classList.add("pulse");
    const ring = document.createElement("div");
    ring.className = "intro-ring";
    root.appendChild(ring);
    FX?.flash("#fff", 500);
    FX?.burst(innerWidth / 2, innerHeight * 0.45, { n: 90, speed: 600, g: 300 });
    setTimeout(() => {
      FX?.confetti(120);
      root.classList.add("opening");
      A?.sfx("whoosh");
      document.dispatchEvent(new CustomEvent("jw:intro-done"));
    }, 750);
    setTimeout(() => {
      bgOn = false;
      root.classList.add("done");
      root.remove();
      document.body.classList.remove("intro-open");
    }, 1800);
  }
  startBtn.onclick = (e) => {
    e.stopPropagation();
    begin();
  };
  root.addEventListener("pointerdown", () => {
    if (ready) begin();
  });
  addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("intro-open")) return;
    if (["Enter", " ", "Escape"].includes(e.key)) {
      e.preventDefault();
      ready ? begin() : (skip = true);
    }
  });
  $("introSkip").onclick = (e) => {
    e.stopPropagation();
    ready ? begin() : (skip = true);
  };
})();
