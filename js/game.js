(() => {
  "use strict";
  try {
    localStorage.getItem("jw");
  } catch {
    const m = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k) => (k in m ? m[k] : null),
        setItem: (k, v) => {
          m[k] = String(v);
        },
        removeItem: (k) => {
          delete m[k];
        },
      },
    });
  }
  const MAX_TOPICS = 50,
    MAX_PER_DIFFICULTY = 100,
    MAX_TOTAL_PER_TOPIC = 300;
  const BOARD_POINTS = [100, 200, 300, 400, 500];
  const TEAM_COLORS = [
    "#3d8bff",
    "#ff5f6d",
    "#4be495",
    "#a36cff",
    "#ff9c4a",
    "#ff69b4",
    "#4de3ff",
    "#ffd84d",
  ];
  const DEFAULT_COLUMN_COLORS = [
    "#2166c9",
    "#22a46e",
    "#8d5fe8",
    "#f18a41",
    "#e25a9a",
    "#3d8bff",
    "#22a46e",
    "#8d5fe8",
    "#f18a41",
    "#e25a9a",
  ];
  const LOCALES = window.JW_LOCALES;
  const RAW_SAMPLES = window.JW_SAMPLES;

  const EXTRA_SAMPLE_RUNTIME_TEXT = {
    en: {
      loadingRound: "Preparing round…",
      partialTranslation: "Some questions could not be translated. Untranslated questions remain in Tagalog.",
    },
    tl: {
      loadingRound: "Inihahanda ang round…",
      partialTranslation: "May ilang tanong na hindi maisalin; nanatili sa Tagalog ang mga iyon.",
    },
    es: {
      loadingRound: "Preparando la partida…",
      partialTranslation: "Algunas preguntas no pudieron traducirse; esas preguntas permanecen en tagalo.",
    },
  };
  for (const [k, v] of Object.entries(EXTRA_SAMPLE_RUNTIME_TEXT))
    if (LOCALES[k]) Object.assign(LOCALES[k], v);
  for (const k of Object.keys(LOCALES)) if (!["en", "tl", "es"].includes(k)) delete LOCALES[k];
  const SUPPORTED_LANGS = Object.freeze(["en", "tl", "es"]);
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
  const safeJson = (v, f) => {
    try {
      return JSON.parse(v);
    } catch {
      return f;
    }
  };
  function random() {
    return crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
      : Math.random();
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function normText(s) {
    return String(s ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c],
    );
  }

  const state = {
    lang: SUPPORTED_LANGS.includes(localStorage.getItem("familyJeopardyLang"))
      ? localStorage.getItem("familyJeopardyLang")
      : "en",
    teams: [],
    currentTeam: 0,
    currentQuestion: null,
    selectedScoringTeam: null,
    timerId: null,
    timeLeft: 30,
    questionExpired: false,
    timerSetting: 30,
    negativePoints: true,
    questionVersion: "multiple",
    autoTimerOn: true,
    timerVisibleOn: true,
    soundOn: true,
    animationsOn: true,
    confettiOn: true,
    boardEffectsOn: true,
    musicOn: true,
    musicVolume: 0.35,
    effectsVolume: 1,
    celebrationVolume: 0.7,
    theme: "neon",
    roundStarted: false,
    roundRules: null,
    columnCount: 5,
    selectedColumns: [0, 1, 2, 3, 4],
    columnModes: ["fixed", "fixed", "fixed", "fixed", "fixed"],
    customColumns: [],
    recentQuestionKeys: [],
    gameHistory: [],
    questions: [],
  };

  function T() {
    if (!SUPPORTED_LANGS.includes(state.lang)) state.lang = "en";
    return LOCALES[state.lang] || LOCALES.en;
  }
  function text(id, value) {
    const e = $(id);
    if (e) e.textContent = value;
  }
  function hintLabelText() {
    return (
      {
        en: "Hint",
        tl: "Hint",
        es: "Pista",
        fr: "Indice",
        pt: "Dica",
        de: "Hinweis",
        it: "Suggerimento",
        ja: "ヒント",
        ko: "힌트",
        zh: "提示",
      }[state.lang] || "Hint"
    );
  }

  let topicBank = Array.from({ length: MAX_TOPICS }, (_, i) => ({
    name: `Topic ${i + 1}`,
    active: i < 5,
    questions: [],
  }));
  function stripFormatParens(value) {
    let s = String(value ?? "").trim();
    let prev = "";
    while (s && s !== prev && s.startsWith("(") && s.endsWith(")")) {
      prev = s;
      s = s.slice(1, -1).trim();
    }
    return s;
  }
  function normalizeQuestion(q) {
    if (!q) return null;
    const text = stripFormatParens(q.q ?? q.question ?? ""),
      ans = stripFormatParens(q.a ?? q.answer ?? "");
    if (!text || !ans) return null;
    const hint = stripFormatParens(q.hint ?? "");
    const d = ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "easy";
    const options = Array.isArray(q.options)
      ? q.options.map(stripFormatParens).filter(Boolean).slice(0, 4)
      : [];
    return { q: text, a: ans, hint, difficulty: d, options };
  }
  function normalizeTopic(t, i) {
    const seen = new Set(),
      qs = [];
    for (const raw of Array.isArray(t?.questions) ? t.questions : []) {
      const q = normalizeQuestion(raw);
      if (!q) continue;
      const k = normText(q.q);
      if (seen.has(k)) continue;
      seen.add(k);
      qs.push(q);
      if (qs.length >= MAX_TOTAL_PER_TOPIC) break;
    }
    const name =
      String(t?.name || `Topic ${i + 1}`)
        .trim()
        .slice(0, 60) || `Topic ${i + 1}`;
    return { name, active: Boolean(t?.active), questions: qs, isTrueFalse: Boolean(t?.isTrueFalse) };
  }
  function normalizeBank(raw) {
    const arr = Array.from({ length: MAX_TOPICS }, (_, i) =>
      normalizeTopic(Array.isArray(raw) ? raw[i] : null, i),
    );
    const active = arr.filter((t) => t.active).length;
    if (active < 5) {
      for (let i = 0, c = 0; i < MAX_TOPICS && c < 5; i++)
        if (!arr[i].active) {
          arr[i].active = true;
          c++;
        }
    }
    return arr;
  }
  function eligibleTopics() {
    return topicBank
      .map((t, i) => {
        const c = { easy: 0, medium: 0, hard: 0 };
        t.questions.forEach((q) => c[q.difficulty]++);
        return t.active && c.easy >= 1 && c.medium >= 2 && c.hard >= 2 ? i : -1;
      })
      .filter((i) => i >= 0);
  }
  function topicQuestions(i) {
    return (topicBank[i]?.questions || []).slice();
  }
  function availableFreshQuestions(i, d) {
    const keyset = new Set(state.recentQuestionKeys);
    const all = topicQuestions(i).filter((q) => q.difficulty === d);
    const fresh = all.filter((q) => !keyset.has(questionKey(i, q)));
    return fresh.length ? fresh : all;
  }
  function questionKey(i, q) {
    return `Q:${i}:${q.difficulty}:${normText(q.q)}:${normText(q.a)}`;
  }
  function ensureColumnArrays() {
    state.columnCount = clamp(Number(state.columnCount) || 5, 5, 10);
    while (state.selectedColumns.length < state.columnCount)
      state.selectedColumns.push(state.selectedColumns.length % MAX_TOPICS);
    while (state.columnModes.length < state.columnCount) state.columnModes.push("random");
    while (state.customColumns.length < state.columnCount)
      state.customColumns.push({
        name: `Column ${state.customColumns.length + 1}`,
        color: DEFAULT_COLUMN_COLORS[state.customColumns.length % DEFAULT_COLUMN_COLORS.length],
      });
    state.selectedColumns = state.selectedColumns.slice(0, state.columnCount);
    state.columnModes = state.columnModes.slice(0, state.columnCount);
    state.customColumns = state.customColumns.slice(0, state.columnCount);
  }
  function bankPayload() {
    return {
      version: 6,
      topicBank: topicBank,
      activeTopicCount: topicBank.filter((t) => t.active).length,
      columnCount: state.columnCount,
      selectedColumns: state.selectedColumns,
      columnModes: state.columnModes,
      customColumns: state.customColumns,
      recentQuestionKeys: state.recentQuestionKeys.slice(-1000),
    };
  }
  let saveTimer = null;
  function persistBank(immediate = false) {
    clearTimeout(saveTimer);
    const run = () => {
      try {
        const next = bankPayload();
        next.savedAt = new Date().toISOString();
        localStorage.setItem("familyJeopardyTopicBankV6", JSON.stringify(next));
        localStorage.removeItem("familyJeopardyTopicBankV5");
        localStorage.removeItem("familyJeopardyTopicBankV2");
      } catch (e) {
        console.warn("Question bank save failed", e);
      }
    };
    if (immediate) run();
    else saveTimer = setTimeout(run, 350);
  }
  function persistSettings() {
    applyAudioPrefs();
    try {
      localStorage.setItem(
        "familyJeopardySettingsV2",
        JSON.stringify({
          soundOn: state.soundOn,
          animationsOn: state.animationsOn,
          confettiOn: state.confettiOn,
          autoTimerOn: state.autoTimerOn,
          timerVisibleOn: state.timerVisibleOn,
          musicOn: state.musicOn,
          musicVolume: state.musicVolume,
          effectsVolume: state.effectsVolume,
          celebrationVolume: state.celebrationVolume,
          theme: state.theme,
          lang: state.lang,
          boardEffectsOn: state.boardEffectsOn,
        }),
      );
      localStorage.setItem("familyJeopardyLang", state.lang);
    } catch (e) {
      console.warn("Settings save failed", e);
    }
  }
  async function restore() {
    try {
      const raw =
        localStorage.getItem("familyJeopardyTopicBankV6") ||
        localStorage.getItem("familyJeopardyTopicBankV5") ||
        localStorage.getItem("familyJeopardyTopicBankV2");
      if (raw) {
        const d = JSON.parse(raw);
        state.columnCount = clamp(Number(d.columnCount) || 5, 5, 10);
        state.selectedColumns = Array.isArray(d.selectedColumns) ? d.selectedColumns.map(Number) : [];
        state.columnModes = Array.isArray(d.columnModes)
          ? d.columnModes.map((x) => (x === "random" ? "random" : "fixed"))
          : [];
        state.customColumns = Array.isArray(d.customColumns)
          ? d.customColumns.map((x) => ({
              name: String(x?.name || ""),
              color: /^#[0-9a-fA-F]{6}$/.test(String(x?.color || "")) ? x.color : "#315ca8",
            }))
          : [];
        state.recentQuestionKeys = Array.isArray(d.recentQuestionKeys)
          ? d.recentQuestionKeys.slice(-1000)
          : [];
        if (Array.isArray(d.topicBank)) {
          topicBank = normalizeBank(d.topicBank);
          ensureColumnArrays();
        }
      }
    } catch (e) {
      console.warn("Bank restore failed", e);
    }
    if (!topicBank.some((t) => t.questions.length)) seedSamples();
    try {
      const ss = JSON.parse(localStorage.getItem("familyJeopardySettingsV2") || "null");
      if (ss) {
        for (const k of [
          "soundOn",
          "animationsOn",
          "confettiOn",
          "autoTimerOn",
          "timerVisibleOn",
          "musicOn",
          "boardEffectsOn",
        ])
          if (typeof ss[k] === "boolean") state[k] = ss[k];
        for (const k of ["musicVolume", "effectsVolume", "celebrationVolume"])
          if (Number.isFinite(ss[k])) state[k] = clamp(ss[k], 0, 1);
        if (typeof ss.theme === "string") state.theme = ss.theme;
        if (ss.lang && LOCALES[ss.lang]) state.lang = ss.lang;
      }
    } catch (e) {
      console.warn("Settings restore failed", e);
    }
    try {
      state.gameHistory = safeJson(localStorage.getItem("familyJeopardyGameHistory") || "[]", []).slice(0, 8);
    } catch {
      state.gameHistory = [];
    }
  }
  function applyTheme() {
    document.body.classList.remove("theme-classic", "theme-midnight", "theme-sunrise", "theme-forest");
    if (state.theme !== "neon") document.body.classList.add("theme-" + state.theme);
    try {
      localStorage.setItem("familyJeopardyTheme", state.theme);
    } catch {}
  }

  function setLanguage(lang) {
    const next = SUPPORTED_LANGS.includes(lang) ? lang : "en";
    if (state.roundStarted) {
      // A round has already materialized its questions in the selected language.
      // Keep the active round stable; change language only between rounds.
      $("languageSetting").value = state.lang;
      return;
    }
    state.lang = next;
    persistSettings();
    applyLocale();
    renderSetup();
    renderColumns();
  }
  function applyLocale() {
    const t = T();
    document.documentElement.lang = state.lang;
    document.title = t.title;
    text("title", t.title);
    text("subtitle", t.subtitle);
    text("startBtn", t.start);
    text("settingsHomeBtn", t.settings);
    text("setupTitle", t.setup);
    text("setupDesc", t.setupDesc);
    text("teamsTab", t.teams);
    text("bankTab", t.bank);
    text("columnsTab", t.columns);
    text("addTopicBtn", t.addTopic);
    text("clearQuestionsBtn", t.clearAll);
    text("collapseAllTopicsBtn", t.collapse);
    text("expandAllTopicsBtn", t.expand);
    text("clearEmptyTopicsBtn", t.clearEmpty);
    text("exportBankBtn", t.export);
    text("importBankBtn", t.import);
    text("beginBtn", t.begin);
    text("backHomeBtn", t.back);
    text("settingsGameBtn", t.settings);
    text("newGameBtn", t.newGame);
    text("hostToggleBtn", t.host);
    text("hostAddBtn", t.add100);
    text("hostSubBtn", t.sub100);
    text("hostResetBtn", t.resetScores);
    text("hostSkipBtn", t.skip);
    text("showAnswerBtn", t.show);
    text("correctBtn", t.correct);
    text("wrongBtn", t.incorrect);
    text("closeQuestionBtn", t.board);
    text("confirmTeamBtn", t.apply);
    text("cancelTeamBtn", t.cancel);
    text("playAgainBtn", t.playAgain);
    text("resultsHomeBtn", t.home);
    text("closeSettingsBtn", t.done);
    text("resetSettingsBtn", t.reset);
    const labels = document.querySelectorAll("#teamsPanel .setup-option label");
    if (labels[0]) labels[0].textContent = t.timer;
    if (labels[1]) labels[1].textContent = t.negative;
    if (labels[2]) labels[2].textContent = t.version;
    const timer = $("timerSetting");
    if (timer && timer.options.length >= 4) {
      timer.options[0].textContent = t.timer15;
      timer.options[1].textContent = t.timer30;
      timer.options[2].textContent = t.timer45;
      timer.options[3].textContent = t.timer60;
    }
    const neg = $("negativeSetting");
    if (neg && neg.options.length >= 2) {
      neg.options[0].textContent = t.on;
      neg.options[1].textContent = t.off;
    }
    const v = $("versionSetting");
    if (v && v.options.length >= 2) {
      v.options[0].textContent = t.multiple;
      v.options[1].textContent = t.identification;
    }
    const search = $("questionSearch");
    if (search) search.placeholder = t.search;
    const settingLabels = {
      soundLabel: t.sound,
      animationsLabel: t.animations,
      negativeLabel: t.negative,
      musicLabel: t.music,
      confettiLabel: t.confetti,
      autoTimerLabel: t.autoTimer,
      boardEffectsLabel: t.boardEffects,
      timerVisibleLabel: t.timerVisible,
      themeLabel: t.theme,
      effectsVolumeLabel: t.effectsVolume,
      musicVolumeLabel: t.musicVolume,
      celebrationVolumeLabel: t.celebrationVolume,
    };
    for (const [id, value] of Object.entries(settingLabels)) if ($(id)) $(id).textContent = value;
    if ($("setupNote")) $("setupNote").textContent = t.setupNote || "";
    if ($("bankHelpSub")) $("bankHelpSub").textContent = t.bankHelpSub || "";
    if ($("bankNote")) $("bankNote").textContent = t.bankNote || "";
    if ($("columnsNote")) $("columnsNote").textContent = t.randomNote || "";
    if ($("whoAnsweredTitle"))
      $("whoAnsweredTitle").textContent = t.whoAnswered || "Choose the team that answered:";
    if ($("historyHeading")) $("historyHeading").textContent = t.recent || "Recent Games";
    const roundSensitive = ["autoTimerToggle", "timerVisibleToggle", "negativeToggle"];
    roundSensitive.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = state.roundStarted;
    });
    const setupSensitive = ["timerSetting", "negativeSetting", "versionSetting"];
    setupSensitive.forEach((id) => {
      const el = $(id);
      if (el) el.disabled = state.roundStarted;
    });
    const langSelect = $("languageSetting");
    if (langSelect) {
      const names = {
        en: "English",
        tl: "Tagalog",
        es: "Español",
        fr: "Français",
        pt: "Português",
        de: "Deutsch",
        it: "Italiano",
        ja: "日本語",
        ko: "한국어",
        zh: "简体中文",
      };
      const flags = {
        en: "🇺🇸",
        tl: "🇵🇭",
        es: "🇪🇸",
        fr: "🇫🇷",
        pt: "🇧🇷",
        de: "🇩🇪",
        it: "🇮🇹",
        ja: "🇯🇵",
        ko: "🇰🇷",
        zh: "🇨🇳",
      };
      [...langSelect.options].forEach((o) => {
        const k = o.value;
        if (names[k]) o.textContent = `${flags[k]} ${names[k]}`;
      });
      langSelect.value = state.lang;
      langSelect.disabled = state.roundStarted;
    }
    $("languageSetting").title = state.roundStarted
      ? t.languageLocked
      : "Choose the interface and sample-question language. Ten languages are available.";
    const ce = $("questionHint");
    if (ce && state.currentQuestion)
      ce.textContent = state.questionExpired
        ? t.timerExpired
        : state.questionVersion === "multiple"
          ? t.choiceHint || "Choices are display-only."
          : t.identificationHint || "Identification mode.";
  }

  function renderSetup() {
    const root = $("topicManagerSimple");
    if (!root) return;
    root.innerHTML = "";
    topicBank.forEach((topic, i) => {
      if (topic.active || i < 5) renderTopicCard(root, topic, i);
    });
    updateBankStats();
  }
  function parseQA(text) {
    const raw = String(text || "")
      .replace(/\r/g, "")
      .trim();
    if (!raw) return { pairs: [], malformed: 0 };
    const pairs = [];
    let malformed = 0;
    for (const line of raw.split("\n")) {
      const cleaned = line.trim();
      if (!cleaned) continue;
      const body = cleaned.replace(/^[-•]\s*/, "");
      const first = body.indexOf("/");
      const second = first < 0 ? -1 : body.indexOf("/", first + 1);
      if (first <= 0 || second <= first + 1 || second === body.length - 1) {
        malformed++;
        continue;
      }
      const cleanField = (v) =>
        String(v || "")
          .trim()
          .replace(/^\((.*)\)$/s, "$1")
          .trim();
      const q = cleanField(body.slice(0, first)),
        a = cleanField(body.slice(first + 1, second)),
        hint = cleanField(body.slice(second + 1));
      if (q && a && hint) pairs.push([q, a, hint]);
      else malformed++;
    }
    return { pairs, malformed };
  }
  function formatQA(topic, d) {
    return topic.questions
      .filter((q) => q.difficulty === d)
      .map((q) => `-${q.q}/${q.a}/${q.hint || ""}`)
      .join("\n");
  }
  function renderTopicCard(root, topic, i) {
    const t = T();
    const card = document.createElement("div");
    card.className = "topic-collapse-card";
    card.dataset.topic = i;
    const header = document.createElement("div");
    header.className = "topic-collapse-header";
    const arrow = document.createElement("div");
    arrow.className = "topic-collapse-arrow";
    arrow.textContent = "▶";
    const summary = document.createElement("div");
    summary.className = "topic-collapse-summary";
    const nm = document.createElement("div");
    nm.className = "topic-collapse-name";
    nm.textContent = topic.name;
    const ct = document.createElement("div");
    ct.className = "topic-collapse-count";
    ct.textContent = `${topic.questions.length}/300 ${t.questionCount}`;
    summary.append(nm, ct);
    const actions = document.createElement("div");
    actions.className = "topic-collapse-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "secondary";
    clear.textContent = t.clearButton;
    clear.onclick = (e) => {
      e.stopPropagation();
      if (confirm(t.clearTopic)) {
        topic.questions = [];
        persistBank(true);
        renderSetup();
        renderColumns();
      }
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-btn";
    remove.textContent = t.removeButton;
    remove.onclick = (e) => {
      e.stopPropagation();
      if (i < 5) {
        alert(t.removeBlocked);
        return;
      }
      if (confirm(t.removeTopic)) {
        topic.active = false;
        topic.questions = [];
        repointColumns(i);
        persistBank(true);
        renderSetup();
        renderColumns();
      }
    };
    actions.append(clear, remove);
    header.append(arrow, summary, actions);
    card.appendChild(header);
    const body = document.createElement("div");
    body.className = "topic-collapse-body";
    const nameRow = document.createElement("div");
    nameRow.className = "topic-name-row";
    const wrap = document.createElement("div");
    const lab = document.createElement("label");
    lab.textContent = `${t.topicName} ${i + 1}`;
    const inp = document.createElement("input");
    inp.value = topic.name;
    inp.maxLength = 60;
    inp.placeholder = `${t.topicName} ${i + 1}`;
    inp.onclick = (e) => e.stopPropagation();
    inp.onkeydown = (e) => e.stopPropagation();
    inp.oninput = (e) => {
      const v = e.target.value.trim() || `Topic ${i + 1}`;
      const dup = topicBank.some((x, j) => j !== i && x.active && normText(x.name) === normText(v));
      if (!dup) {
        topic.name = v;
        nm.textContent = v;
        persistBank();
        renderColumns();
      }
    };
    wrap.append(lab, inp);
    nameRow.append(wrap);
    body.appendChild(nameRow);
    for (const d of ["easy", "medium", "hard"]) {
      const sec = document.createElement("div");
      sec.className = "difficulty-edit";
      if (d === "easy") sec.classList.add("open");
      const dh = document.createElement("div");
      dh.className = "difficulty-edit-head";
      const da = document.createElement("span");
      da.className = "difficulty-edit-arrow";
      da.textContent = "▶";
      const key = d === "easy" ? "easyTitle" : d === "medium" ? "mediumTitle" : "hardTitle";
      const dt = document.createElement("span");
      dt.className = `difficulty-edit-title ${d}`;
      dt.textContent = t[key];
      const dc = document.createElement("span");
      dc.className = "difficulty-edit-count";
      dc.textContent = `${topic.questions.filter((q) => q.difficulty === d).length}/100 ${t.filled}`;
      dh.append(da, dt, dc);
      dh.onclick = () => sec.classList.toggle("open");
      const db = document.createElement("div");
      db.className = "difficulty-edit-body";
      const lab2 = document.createElement("label");
      lab2.textContent = t.qaLabel;
      const ta = document.createElement("textarea");
      ta.className = "question-input";
      ta.maxLength = 50000;
      ta.value = formatQA(topic, d);
      ta.placeholder =
        t.questionsPlaceholder ||
        "-(Question)/(Answer)/(Hint)\n-(Question)/(Answer)/(Hint)\n-(Question)/(Answer)/(Hint)";
      let saveTimerLocal = null;
      ta.addEventListener("input", () => {
        clearTimeout(saveTimerLocal);
        saveTimerLocal = setTimeout(() => {
          const parsed = parseQA(ta.value);
          const other = topic.questions.filter((q) => q.difficulty !== d);
          const rows = [];
          for (const pair of parsed.pairs.slice(0, 100)) {
            const r = normalizeQuestion({ q: pair[0], a: pair[1], hint: pair[2], difficulty: d });
            if (r) rows.push(r);
          }
          const dedup = new Set(other.map((q) => normText(q.q)));
          for (const r of rows) {
            if (!dedup.has(normText(r.q))) {
              dedup.add(normText(r.q));
              other.push(r);
            }
          }
          topic.questions = other.slice(0, 300);
          dc.textContent = `${rows.length}/100 ${t.filled}`;
          ct.textContent = `${topic.questions.length}/300 ${t.questionCount}`;
          persistBank();
          renderColumns();
        }, 450);
      });
      db.append(lab2, ta);
      const fmt = document.createElement("div");
      fmt.className = "topic-note qa-format-note";
      fmt.textContent =
        "Format: -(question)/(answer)/(hint) — one complete pair per line. Parentheses are formatting only and are hidden in the game.";
      db.appendChild(fmt);
      sec.append(dh, db);
      body.appendChild(sec);
    }
    card.appendChild(body);
    header.onclick = () => card.classList.toggle("open");
    root.appendChild(card);
  }
  function updateBankStats() {
    const root = $("bankStats");
    if (root) {
      const active = topicBank.filter((t) => t.active).length,
        total = topicBank.reduce((n, t) => n + t.questions.length, 0),
        eligible = eligibleTopics().length;
      root.innerHTML = [
        `${T().topicsLabel || T().bank}: ${active}/50`,
        `${T().questionsLabel || T().questionCount}: ${total.toLocaleString()}`,
        `${T().eligible || "Eligible"}: ${eligible}/${active}`,
      ]
        .map((x) => `<span class="stat-chip">${x}</span>`)
        .join("");
    }
  }
  function repointColumns(removed) {
    state.selectedColumns = state.selectedColumns.map((v, c) =>
      v === removed ? (eligibleTopics()[c] ?? 0) : v,
    );
    ensureColumnArrays();
  }
  function renderColumns() {
    ensureColumnArrays();
    const wrap = $("columnCustomizer");
    if (!wrap) return;
    wrap.innerHTML = "";
    const sel = $("columnCountSetting");
    if (sel) {
      sel.innerHTML = "";
      for (let n = 5; n <= 10; n++) {
        const o = document.createElement("option");
        o.value = n;
        o.textContent = `${n} ${T().columnsWord || T().columns}`;
        o.selected = n === state.columnCount;
        sel.appendChild(o);
      }
    }
    const active = topicBank.map((t, i) => ({ t, i })).filter((x) => x.t.active);
    for (let i = 0; i < state.columnCount; i++) {
      const box = document.createElement("div");
      box.className = "column-option";
      const left = document.createElement("div");
      const label = document.createElement("label");
      label.textContent = `${T().column || "Column"} ${i + 1} ${T().topicWord || "Topic"}`;
      const select = document.createElement("select");
      const ro = document.createElement("option");
      ro.value = "random";
      ro.textContent = T().random;
      ro.selected = state.columnModes[i] === "random";
      select.appendChild(ro);
      active.forEach(({ t, i: idx }) => {
        const o = document.createElement("option");
        o.value = idx;
        o.textContent = `${idx + 1}. ${t.name}`;
        o.selected = state.columnModes[i] !== "random" && state.selectedColumns[i] === idx;
        select.appendChild(o);
      });
      select.onchange = () => {
        if (select.value === "random") state.columnModes[i] = "random";
        else {
          state.columnModes[i] = "fixed";
          state.selectedColumns[i] = Number(select.value);
        }
        persistBank(true);
      };
      left.append(label, select);
      const color = document.createElement("input");
      color.type = "color";
      color.className = "swatch";
      color.value = state.customColumns[i]?.color || DEFAULT_COLUMN_COLORS[i];
      color.oninput = () => {
        state.customColumns[i].color = color.value;
        persistBank();
        if (state.roundStarted) renderGame();
      };
      box.append(left, color);
      wrap.appendChild(box);
    }
  }
  function localizeSelectors() {
    const ls = $("languageSetting");
    if (ls) {
      ls.onchange = () => setLanguage(ls.value);
      ls.value = state.lang;
    }
  }

  function addTopic() {
    const i = topicBank.findIndex((t, j) => j >= 5 && !t.active);
    if (i < 0) {
      alert(T().maxTopics);
      return;
    }
    let name = `Topic ${i + 1}`;
    let n = 2;
    while (topicBank.some((t, j) => j !== i && t.active && normText(t.name) === normText(name)))
      name = `Topic ${i + 1} ${n++}`;
    topicBank[i] = { name, active: true, questions: [] };
    persistBank(true);
    renderSetup();
    renderColumns();
    requestAnimationFrame(() =>
      document.querySelector(`[data-topic="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  function resolveBoardTopics() {
    const available = eligibleTopics();
    if (available.length < 5) return null;
    const used = new Set();
    const result = [];
    for (let c = 0; c < state.columnCount; c++) {
      if (state.columnModes[c] === "random") {
        let pool = available.filter((i) => !used.has(i));
        if (!pool.length) pool = available.slice();
        shuffle(pool);
        result[c] = pool[0];
        used.add(result[c]);
      } else {
        const i = state.selectedColumns[c];
        result[c] = available.includes(i) ? i : available[c % available.length];
      }
    }
    return result;
  }
  function pickBoardQuestions(ti) {
    const result = [];
    for (const d of ["easy", "medium", "hard"]) {
      const need = d === "easy" ? 1 : 2;
      const pool = shuffle(availableFreshQuestions(ti, d).slice());
      if (pool.length < need) return null;
      result.push(...pool.slice(0, need));
    }
    result.forEach((q) => state.recentQuestionKeys.push(questionKey(ti, q)));
    state.recentQuestionKeys = state.recentQuestionKeys.slice(-1000);
    return result;
  }
  async function buildRound() {
    const topics = resolveBoardTopics();
    if (!topics) return false;
    state.questions = [];
    for (let c = 0; c < topics.length; c++) {
      const ti = topics[c],
        picked = pickBoardQuestions(ti);
      if (!picked) throw new Error("Question availability changed.");
      const isTrueFalse = !!topicBank[ti].isTrueFalse;
      const items = picked.map((q, row) => ({
        id: uid(),
        points: BOARD_POINTS[row],
        topicIndex: ti,
        used: false,
        q: q.q,
        a: q.a,
        hint: q.hint || "",
        options: q.options.slice(),
        isTrueFalse,
      }));
      state.questions.push({
        topicIndex: ti,
        columnIndex: c,
        category: topicBank[ti].name,
        isTrueFalse,
        items,
      });
    }
    persistBank(true);
    return true;
  }

  function renderGame() {
    renderGameInner();
    saveGame();
    afterScoreFx();
  }
  function renderGameInner() {
    ensureColumnArrays();
    document.documentElement.style.setProperty("--board-columns", String(state.columnCount));
    text("turnText", `${T().yourTurn} ${state.teams[state.currentTeam]?.name || ""}`);
    text("newGameBtn", T().newGame);
    text("settingsGameBtn", T().settings);
    text("hostToggleBtn", T().host);
    text("fullscreenBtn", document.fullscreenElement ? T().exitFullscreen : T().fullscreen);
    const scores = $("scores");
    scores.innerHTML = "";
    state.teams.forEach((team, i) => {
      const el = document.createElement("div");
      el.className =
        "score" + (i === state.currentTeam ? " active" : "") + ((team.streak || 0) >= 3 ? " streak" : "");
      el.style.setProperty("--teamColor", team.color);
      el.innerHTML = `<div class="score-name">${escapeHtml(team.name)}${(team.streak || 0) >= 3 ? '<span class="flame">🔥</span>' : ""}</div><div class="score-value">${team.score}</div>`;
      scores.appendChild(el);
    });
    const board = $("board");
    board.innerHTML = "";
    state.questions.forEach((cat, c) => {
      const h = document.createElement("div");
      h.className = "category";
      h.textContent = cat.category;
      h.style.background = `linear-gradient(150deg,color-mix(in srgb, ${state.customColumns[c]?.color || DEFAULT_COLUMN_COLORS[c]} 82%, white 18%), ${state.customColumns[c]?.color || DEFAULT_COLUMN_COLORS[c]})`;
      h.style.borderColor = state.customColumns[c]?.color || DEFAULT_COLUMN_COLORS[c];
      board.appendChild(h);
    });
    for (let row = 0; row < 5; row++)
      state.questions.forEach((cat, c) => {
        const item = cat.items[row];
        if (!item) return;
        const b = document.createElement("button");
        b.className = "cell" + (item.used ? " used" : "");
        b.disabled = item.used;
        b.textContent = item.used ? "✓" : item.points;
        b.title = item.used ? T().used : `${cat.category} — ${item.points}`;
        b.onclick = () => openQuestion(item, b);
        board.appendChild(b);
      });
  }
  const TRUE_FALSE_LABELS = {
    en: ["True", "False"],
    tl: ["Tama", "Mali"],
    es: ["Verdadero", "Falso"],
    fr: ["Vrai", "Faux"],
    pt: ["Verdadeiro", "Falso"],
    de: ["Richtig", "Falsch"],
    it: ["Vero", "Falso"],
    ja: ["正しい", "間違い"],
    ko: ["참", "거짓"],
    zh: ["对", "错"],
  };
  function getChoices(item) {
    const category = state.questions.find((c) => c.items.includes(item));
    const topicIndex = category?.topicIndex;
    if (category?.isTrueFalse || topicBank[topicIndex]?.isTrueFalse) {
      return shuffle((TRUE_FALSE_LABELS[state.lang] || TRUE_FALSE_LABELS.en).slice());
    }
    const provided = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
    if (provided.length >= 2) {
      const unique = [];
      for (const x of provided) {
        if (!unique.some((y) => normText(y) === normText(x))) unique.push(x);
      }
      return shuffle(unique.slice(0, 4));
    }
    const pool = category?.items || [];
    const others = shuffle([
      ...new Set(pool.map((x) => x.a).filter((a) => normText(a) !== normText(item.a))),
    ]).slice(0, 3);
    return shuffle([item.a, ...others]);
  }
  function openQuestion(item, button) {
    if (state.currentQuestion) return;
    state.currentQuestion = { item, button, selectedChoice: null, hintShown: false };
    state.selectedScoringTeam = state.currentTeam;
    state.questionExpired = false;
    item.used = true;
    button.disabled = true;
    const rr = state.roundRules || {};
    state.timeLeft = rr.timerSetting || 30;
    state.paused = false;
    $("pauseBtn").textContent = "⏸ Pause";
    $("buzzBanner").classList.remove("show");
    playTone("question");
    JWAudio.mood("think");
    if (state.boardEffectsOn) JWFX.burstAt(button, { n: 26, speed: 300 });
    const qc = $("questionCard");
    qc.classList.remove("open-pop");
    void qc.offsetWidth;
    qc.classList.add("open-pop");
    updateQuestionUI();
    startTimer();
  }
  function updateQuestionUI() {
    const q = state.currentQuestion?.item;
    if (!q) return;
    text("modalPoints", `${q.points} ${T().points}`);
    text("questionText", q.q);
    text("answerText", q.a);
    text("answerLabel", T().answerLabel);
    text("showAnswerBtn", T().show);
    text("correctBtn", T().correct);
    text("wrongBtn", T().incorrect);
    text("closeQuestionBtn", T().board);
    $("answerBox").classList.remove("show");
    $("questionModal").classList.add("open");
    $("timer").style.display = state.timerVisibleOn ? "" : "none";
    const hp = $("hintPanel"),
      ht = $("hintPanelText"),
      hl = $("hintPanelLabel");
    if (hl) hl.textContent = hintLabelText();
    if (ht) ht.textContent = q.hint || "";
    if (hp) {
      const show = state.questionVersion === "identification" && state.currentQuestion.hintShown && !!q.hint;
      hp.classList.toggle("show", show);
      hp.setAttribute("aria-hidden", show ? "false" : "true");
      const stage = hp.closest(".question-stage");
      if (stage) stage.classList.toggle("with-hint", show);
    }
    const choices = $("choices");
    choices.innerHTML = "";
    if (state.questionVersion === "multiple") {
      choices.style.display = "grid";
      getChoices(q).forEach((choice, i) => {
        const d = document.createElement("button");
        d.type = "button";
        d.className =
          "choice-btn" +
          (normText(state.currentQuestion.selectedChoice) === normText(choice) ? " selected-choice" : "");
        d.innerHTML = `<span class="choice-letter">${String.fromCharCode(65 + i)}</span>${escapeHtml(choice)}`;
        d.onclick = () => {
          if (state.questionExpired) return;
          state.currentQuestion.selectedChoice = choice;
          choices.querySelectorAll(".choice-btn").forEach((x) => x.classList.remove("selected-choice"));
          d.classList.add("selected-choice");
        };
        choices.appendChild(d);
      });
    } else choices.style.display = "none";
    text(
      "questionHint",
      state.questionExpired
        ? T().timerExpired
        : state.questionVersion === "multiple"
          ? T().choiceHint || "Choose an answer, then the host scores it."
          : T().identificationHint || "Identification mode.",
    );
    renderTeamPicker();
  }
  function renderTeamPicker() {
    const root = $("teamPicker");
    root.innerHTML = "";
    state.teams.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "team-choice" + (state.selectedScoringTeam === i ? " selected" : "");
      b.style.setProperty("--teamColor", t.color);
      b.textContent = `${t.name} (${t.score})`;
      b.onclick = () => {
        state.selectedScoringTeam = i;
        root.querySelectorAll(".team-choice").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
      };
      root.appendChild(b);
    });
  }
  function startTimer() {
    clearInterval(state.timerId);
    state.timeLeft = state.roundRules?.timerSetting || state.timerSetting;
    updateTimer();
    if (!(state.roundRules?.autoTimerOn ?? state.autoTimerOn)) return;
    state.timerId = setInterval(() => {
      state.timeLeft--;
      updateTimer();
      if (state.timeLeft > 0 && state.timeLeft <= 10) JWAudio.sfx("tick", state.timeLeft);
      const half = Math.ceil((state.roundRules?.timerSetting || state.timerSetting) / 2);
      if (
        state.questionVersion === "identification" &&
        !state.currentQuestion?.hintShown &&
        state.timeLeft <= half
      ) {
        state.currentQuestion.hintShown = true;
        updateQuestionUI();
        playTone("reveal");
      }
      if (state.timeLeft <= 0) {
        clearInterval(state.timerId);
        state.questionExpired = true;
        text("questionHint", T().timerExpired);
        playTone("time");
        JWFX.shake($("questionCard"));
      }
    }, 1000);
  }
  function updateTimer() {
    text("timer", `${T().time} ${state.timeLeft}s`);
    $("timer").classList.toggle("danger", state.timeLeft <= 10);
    $("timer").classList.toggle("warning", state.timeLeft <= 20 && state.timeLeft > 10);
  }
  function scoreQuestion(correct) {
    if (!state.currentQuestion) return;
    clearInterval(state.timerId);
    $("correctBtn").disabled = true;
    $("wrongBtn").disabled = true;
    $("teamPickerModal").dataset.correct = correct ? "true" : "false";
    text("pickerTitle", correct ? T().correct : T().incorrect);
    text("pickerPoints", `${state.currentQuestion.item.points} ${T().points}`);
    text("pickerNote", T().pickerHint);
    renderTeamPicker();
    $("teamPickerModal").classList.add("open");
  }
  function finalizeScore() {
    if (!state.currentQuestion) return;
    const team = state.teams[state.selectedScoringTeam];
    if (!team) return;
    const correct = $("teamPickerModal").dataset.correct === "true";
    const amount = state.currentQuestion.item.points;
    const delta = correct ? amount : state.roundRules?.negativePoints ? -amount : 0;
    const from = team.score;
    team.score += delta;
    team.streak = correct ? (team.streak || 0) + 1 : 0;
    state.lastFx = { idx: state.selectedScoringTeam, delta, from, amount, correct, streak: team.streak };
    state.questionCountStats.played++;
    if (correct) state.questionCountStats.correct++;
    else state.questionCountStats.incorrect++;
    state.currentTeam = (state.selectedScoringTeam + 1) % state.teams.length;
    state.currentQuestion = null;
    state.selectedScoringTeam = null;
    $("questionModal").classList.remove("open");
    $("teamPickerModal").classList.remove("open");
    $("correctBtn").disabled = false;
    $("wrongBtn").disabled = false;
    renderGame();
    if (state.questions.every((c) => c.items.every((i) => i.used))) setTimeout(showResults, 250);
  }
  function closeQuestion() {
    JWAudio.mood("board");
    JWAudio.sfx("close");
    clearInterval(state.timerId);
    if (state.currentQuestion?.item) state.currentQuestion.item.used = false;
    state.currentQuestion = null;
    state.selectedScoringTeam = null;
    state.questionExpired = false;
    $("questionModal").classList.remove("open");
    $("teamPickerModal").classList.remove("open");
    $("correctBtn").disabled = false;
    $("wrongBtn").disabled = false;
    renderGame();
  }
  function hostSkip() {
    JWAudio.mood("board");
    if (!state.currentQuestion) return;
    clearInterval(state.timerId);
    state.currentQuestion.item.used = true;
    state.currentQuestion = null;
    state.selectedScoringTeam = null;
    state.questionExpired = false;
    $("questionModal").classList.remove("open");
    $("teamPickerModal").classList.remove("open");
    $("hostPanel").classList.remove("open");
    if (state.teams.length) state.currentTeam = (state.currentTeam + 1) % state.teams.length;
    renderGame();
  }
  function showResults() {
    clearInterval(state.timerId);
    clearSaved();
    JWAudio.mood("victory");
    JWAudio.sfx("fanfare");
    const sorted = [...state.teams].sort((a, b) => b.score - a.score);
    const top = sorted[0]?.score ?? 0;
    const tied = sorted.filter((t) => t.score === top);
    const title = tied.length > 1 ? T().tie : `${T().gameOver} ${sorted[0]?.name || ""}`;
    text("resultsTitle", title);
    text("winnerName", tied.length > 1 ? `${top} ${T().points}` : `🏆 ${top} ${T().points}`);
    $("podium").innerHTML = "";
    const podium = sorted.slice(0, 3);
    podium.forEach((team, i) => {
      const d = document.createElement("div");
      d.className = `podium-place ${i === 0 ? "first" : i === 1 ? "second" : "third"}`;
      d.style.borderColor = team.color;
      d.innerHTML = `<div class="podium-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div><div class="podium-name">${escapeHtml(team.name)}</div><div class="podium-score">${team.score}</div>`;
      $("podium").appendChild(d);
    });
    $("finalScores").innerHTML = sorted
      .map(
        (team, i) =>
          `<div class="final-row" style="border-color:${team.color}"><span>${i + 1}. ${escapeHtml(team.name)}</span><strong style="color:${team.color}">${team.score}</strong></div>`,
      )
      .join("");
    const stats = (state.roundStarted && state.questionCountStats) || { played: 0, correct: 0, incorrect: 0 };
    const acc = stats.played ? Math.round((stats.correct / stats.played) * 100) : 0;
    $("gameStats").innerHTML = [
      [T().questionsPlayed, stats.played],
      [T().statsCorrect, stats.correct],
      [T().statsIncorrect, stats.incorrect],
      [T().accuracy, acc + "%"],
    ]
      .map((x) => `<div class="game-stat"><div>${escapeHtml(x[0])}</div><strong>${x[1]}</strong></div>`)
      .join("");
    state.gameHistory.unshift({
      date: new Date().toISOString(),
      winner: tied.length > 1 ? T().tie : sorted[0]?.name || "",
      score: top,
      teams: sorted.map((t) => ({ name: t.name, score: t.score })),
      topics: state.questions.map((c) => c.category),
    });
    state.gameHistory = state.gameHistory.slice(0, 8);
    try {
      localStorage.setItem("familyJeopardyGameHistory", JSON.stringify(state.gameHistory));
    } catch {}
    renderHistory();
    $("resultsModal").classList.add("open");
    if (state.confettiOn) confetti();
    playApplause();
  }
  function renderHistory() {
    const r = $("historyList");
    if (!r) return;
    r.innerHTML = state.gameHistory
      .slice(0, 5)
      .map(
        (g) =>
          `<div class="history-row"><span>${escapeHtml(g.winner)}</span><strong>${g.score}</strong></div>`,
      )
      .join("");
  }
  async function restartGame() {
    $("resultsModal").classList.remove("open");
    await startNewRound(state.teams.map((t) => ({ name: t.name, color: t.color })));
  }
  async function startNewRound(teamDefs) {
    stopRound();
    const names = teamDefs.map((t) => String(t.name || "").trim()).filter(Boolean);
    const unique = new Set(names.map(normText));
    if (names.length < 2) {
      alert(T().needTeams);
      return;
    }
    if (unique.size !== names.length) {
      alert(T().duplicateTeam);
      return;
    }
    const rules = {
      timerSetting: state.timerSetting,
      negativePoints: state.negativePoints,
      questionVersion: state.questionVersion,
      autoTimerOn: state.autoTimerOn,
    };
    state.teams = teamDefs.map((t, i) => ({ name: t.name, score: 0, color: t.color || TEAM_COLORS[i] }));
    state.currentTeam = 0;
    state.roundRules = rules;
    state.questionVersion = rules.questionVersion;
    state.questionCountStats = { played: 0, correct: 0, incorrect: 0 };
    const begin = $("beginBtn");
    const original = begin?.textContent;
    if (begin) {
      begin.disabled = true;
      begin.textContent = T().loadingRound || "Preparing round…";
    }
    try {
      if (!(await buildRound())) {
        state.roundStarted = false;
        alert(T().noAvailable);
        return;
      }
      state.roundStarted = true;
      renderGame();
      applyLocale();
      showScreen("game");
      playTone("start");
    } catch (e) {
      console.error(e);
      state.roundStarted = false;
      alert(T().noAvailable + "\n\n" + (e?.message || e));
    } finally {
      if (begin) {
        begin.disabled = false;
        begin.textContent = original || T().begin;
      }
    }
  }
  function stopRound() {
    clearInterval(state.timerId);
    state.timerId = null;
    state.currentQuestion = null;
    state.selectedScoringTeam = null;
    state.roundStarted = false;
    state.questionExpired = false;
  }
  function showScreen(id) {
    JWAudio.mood(id === "game" ? "board" : "menu");
    JWFX.ambient(id !== "game" && state.animationsOn);
    if (id === "home") refreshResume();
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id)?.classList.add("active");
  }

  function exportBank() {
    const blob = new Blob([JSON.stringify(bankPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-worship-jeopardy-bank.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importBankFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!Array.isArray(d.topicBank)) throw new Error("invalid");
        const imported = normalizeBank(d.topicBank);
        topicBank = imported;
        state.columnCount = clamp(Number(d.columnCount) || 5, 5, 10);
        state.selectedColumns = Array.isArray(d.selectedColumns) ? d.selectedColumns.map(Number) : [];
        state.columnModes = Array.isArray(d.columnModes)
          ? d.columnModes.map((x) => (x === "random" ? "random" : "fixed"))
          : [];
        state.customColumns = Array.isArray(d.customColumns)
          ? d.customColumns.map((x) => ({
              name: String(x?.name || ""),
              color: /^#[0-9a-fA-F]{6}$/.test(String(x?.color || "")) ? x.color : "#315ca8",
            }))
          : [];
        state.recentQuestionKeys = Array.isArray(d.recentQuestionKeys)
          ? d.recentQuestionKeys.slice(-1000)
          : [];
        ensureColumnArrays();
        persistBank(true);
        renderSetup();
        renderColumns();
        alert(T().importOk);
      } catch (e) {
        alert(T().importFail);
      }
    };
    reader.readAsText(file);
  }

  const SFXMAP = {
    start: "start",
    question: "open",
    reveal: "reveal",
    correct: "correct",
    wrong: "wrong",
    time: "buzzer",
    win: "fanfare",
    click: "click",
  };
  function playTone(kind) {
    JWAudio.sfx(SFXMAP[kind] || kind);
  }
  function playApplause() {
    JWAudio.sfx("applause");
  }
  function confetti() {
    if (state.animationsOn && state.confettiOn) {
      JWFX.confetti(170);
      JWFX.fireworks(5);
    }
  }
  function applyAudioPrefs() {
    JWAudio.configure({
      sfxOn: state.soundOn,
      musicOn: state.musicOn,
      sfx: state.effectsVolume,
      music: state.musicVolume,
      cel: state.celebrationVolume,
    });
    JWFX.configure({ on: () => state.animationsOn });
    document.body.classList.toggle("no-board-fx", !state.boardEffectsOn);
  }
  function startAmbientMusic() {
    applyAudioPrefs();
  }
  function stopAmbientMusic() {
    applyAudioPrefs();
  }
  function seedSamples() {
    let i = 0;
    for (const [name, sets] of Object.entries(RAW_SAMPLES)) {
      const qs = [];
      for (const d of ["easy", "medium", "hard"])
        for (const [q, a] of sets[d]) qs.push({ q, a, hint: "", difficulty: d, options: [] });
      topicBank[i] = normalizeTopic(
        { name, active: true, questions: qs, isTrueFalse: name === "True or False" },
        i,
      );
      i++;
    }
    state.columnCount = 5;
    state.selectedColumns = [0, 1, 2, 3, 4];
    state.columnModes = ["fixed", "fixed", "fixed", "fixed", "fixed"];
    ensureColumnArrays();
    persistBank(true);
  }
  const SAVE_KEY = "familyJeopardyActiveGameV1";
  function saveGame() {
    if (!state.roundStarted) return;
    try {
      const cq = state.currentQuestion?.item;
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          teams: state.teams,
          currentTeam: state.currentTeam,
          rules: state.roundRules,
          version: state.questionVersion,
          stats: state.questionCountStats,
          questions: state.questions.map((c) => ({
            ...c,
            items: c.items.map((i) => ({ ...i, used: i.used && i !== cq })),
          })),
        }),
      );
    } catch {}
  }
  function loadSaved() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      return s &&
        Array.isArray(s.teams) &&
        s.teams.length > 1 &&
        Array.isArray(s.questions) &&
        s.questions.some((c) => c.items.some((i) => !i.used))
        ? s
        : null;
    } catch {
      return null;
    }
  }
  function clearSaved() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
    refreshResume();
  }
  function refreshResume() {
    $("resumeBtn")?.classList.toggle("show", !!loadSaved());
  }
  function resumeGame() {
    const s = loadSaved();
    if (!s) return refreshResume();
    stopRound();
    state.teams = s.teams;
    state.currentTeam = s.currentTeam || 0;
    state.roundRules = s.rules;
    state.questionVersion = s.version || "multiple";
    state.questionCountStats = s.stats || { played: 0, correct: 0, incorrect: 0 };
    state.questions = s.questions;
    state.columnCount = s.questions.length;
    state.roundStarted = true;
    renderGame();
    applyLocale();
    showScreen("game");
    playTone("start");
  }
  function afterScoreFx() {
    const f = state.lastFx;
    state.lastFx = null;
    if (!f) return;
    const el = $("scores").children[f.idx];
    JWAudio.mood("board");
    if (!el) return;
    el.classList.add("bump");
    JWFX.countUp(el.querySelector(".score-value"), f.from, f.from + f.delta);
    if (f.correct) {
      playTone("correct");
      JWFX.burstAt(el, { n: 48 });
      JWFX.popup(el, "+" + f.amount);
      if (f.streak >= 3) {
        setTimeout(() => {
          JWAudio.sfx("streak");
          JWFX.popup(el, "🔥 " + f.streak + " in a row!", "hot");
          JWFX.burstAt(el, { n: 40, colors: ["#ff9c4a", "#ffd84d", "#ff6073"] });
        }, 350);
      }
    } else {
      playTone("wrong");
      JWFX.shake();
      JWFX.popup(el, f.delta ? "−" + f.amount : "✗", "bad");
    }
  }
  function buzzIn(i) {
    if (
      !state.currentQuestion ||
      state.questionExpired ||
      !state.teams[i] ||
      $("teamPickerModal").classList.contains("open")
    )
      return;
    state.selectedScoringTeam = i;
    const t = state.teams[i],
      b = $("buzzBanner");
    b.textContent = "⚡ " + t.name + " buzzed in!";
    b.style.setProperty("--tc", t.color);
    b.classList.add("show");
    JWAudio.sfx("buzz", i);
    JWFX.flash(t.color, 260);
    renderTeamPicker();
  }
  function togglePause() {
    if (
      !state.currentQuestion ||
      state.questionExpired ||
      !(state.roundRules?.autoTimerOn ?? state.autoTimerOn)
    )
      return;
    state.paused = !state.paused;
    if (state.paused) clearInterval(state.timerId);
    else {
      const left = state.timeLeft;
      startTimer();
      state.timeLeft = left;
      updateTimer();
    }
    $("pauseBtn").textContent = state.paused ? "▶ Resume" : "⏸ Pause";
    JWAudio.sfx("toggle");
  }

  // Event wiring
  $("startBtn").onclick = () => {
    restore();
    renderSetup();
    renderColumns();
    applyLocale();
    showScreen("setup");
  };
  $("settingsHomeBtn").onclick = () => $("settingsModal").classList.add("open");
  $("settingsGameBtn").onclick = () => $("settingsModal").classList.add("open");
  $("closeSettingsBtn").onclick = () => $("settingsModal").classList.remove("open");
  $("teamsTab").onclick = () => {
    document.querySelectorAll(".setup-tab").forEach((x) => x.classList.remove("active"));
    $("teamsTab").classList.add("active");
    $("teamsPanel").style.display = "";
    $("bankPanel").style.display = "none";
    $("columnsPanel").style.display = "none";
  };
  $("bankTab").onclick = () => {
    document.querySelectorAll(".setup-tab").forEach((x) => x.classList.remove("active"));
    $("bankTab").classList.add("active");
    $("teamsPanel").style.display = "none";
    $("bankPanel").style.display = "";
    $("columnsPanel").style.display = "none";
    renderSetup();
  };
  $("columnsTab").onclick = () => {
    document.querySelectorAll(".setup-tab").forEach((x) => x.classList.remove("active"));
    $("columnsTab").classList.add("active");
    $("teamsPanel").style.display = "none";
    $("bankPanel").style.display = "none";
    $("columnsPanel").style.display = "";
    renderColumns();
  };
  $("addTopicBtn").onclick = addTopic;
  $("collapseAllTopicsBtn").onclick = () =>
    document.querySelectorAll(".topic-collapse-card").forEach((c) => c.classList.remove("open"));
  $("expandAllTopicsBtn").onclick = () =>
    document.querySelectorAll(".topic-collapse-card").forEach((c) => c.classList.add("open"));
  $("clearEmptyTopicsBtn").onclick = () => {
    topicBank.forEach((t, i) => {
      if (i >= 5 && t.active && t.questions.length === 0) t.active = false;
    });
    repointColumns(-1);
    persistBank(true);
    renderSetup();
    renderColumns();
  };
  $("clearQuestionsBtn").onclick = () => {
    if (confirm(T().confirmClear)) {
      topicBank = Array.from({ length: MAX_TOPICS }, (_, i) => ({
        name: `Topic ${i + 1}`,
        active: i < 5,
        questions: [],
      }));
      state.columnCount = 5;
      state.selectedColumns = [0, 1, 2, 3, 4];
      state.columnModes = ["fixed", "fixed", "fixed", "fixed", "fixed"];
      state.customColumns = DEFAULT_COLUMN_COLORS.slice(0, 5).map((color, i) => ({
        name: `Topic ${i + 1}`,
        color,
      }));
      state.recentQuestionKeys = [];
      persistBank(true);
      renderSetup();
      renderColumns();
    }
  };
  $("questionSearch").oninput = () => {
    const q = normText($("questionSearch").value);
    document.querySelectorAll(".topic-collapse-card").forEach((card) => {
      const i = Number(card.dataset.topic),
        t = topicBank[i];
      const hay = normText(t.name + " " + t.questions.map((x) => x.q + " " + x.a).join(" "));
      card.classList.toggle("filtered-out", !!q && !hay.includes(q));
    });
  };
  $("exportBankBtn").onclick = exportBank;
  $("importBankBtn").onclick = () => $("importBankFile").click();
  $("importBankFile").onchange = (e) => {
    importBankFile(e.target.files[0]);
    e.target.value = "";
  };
  $("columnCountSetting").onchange = (e) => {
    state.columnCount = clamp(Number(e.target.value), 5, 10);
    ensureColumnArrays();
    persistBank(true);
    renderColumns();
  };
  $("beginBtn").onclick = async () => {
    const inputs = [...document.querySelectorAll(".team-input")];
    const names = inputs.map((i) => i.value.trim()).filter(Boolean);
    if (names.length < 2) return alert(T().needTeams);
    const unique = new Set(names.map(normText));
    if (unique.size !== names.length) return alert(T().duplicateTeam);
    const colors = [...document.querySelectorAll(".color-select")];
    if (
      !state.teams.length ||
      state.teams.length !== names.length ||
      names.some((n, i) => state.teams[i]?.name !== n)
    )
      state.teams = names.map((name, i) => ({ name, score: 0, color: colors[i]?.value || TEAM_COLORS[i] }));
    else
      state.teams = names.map((name, i) => ({
        name,
        score: 0,
        color: colors[i]?.value || state.teams[i]?.color || TEAM_COLORS[i],
      }));
    state.timerSetting = Number($("timerSetting").value) || 30;
    state.negativePoints = $("negativeSetting").value === "on";
    state.questionVersion = $("versionSetting").value;
    startNewRound(state.teams);
  };
  $("backHomeBtn").onclick = () => {
    stopRound();
    showScreen("home");
  };
  $("resultsHomeBtn").onclick = () => {
    stopRound();
    $("resultsModal").classList.remove("open");
    showScreen("home");
  };
  $("resultsCloseBtn").onclick = () => $("resultsModal").classList.remove("open");
  $("playAgainBtn").onclick = restartGame;
  $("newGameBtn").onclick = () => {
    stopRound();
    rebuildTeams();
    showScreen("setup");
    renderSetup();
    renderColumns();
    applyLocale();
  };
  $("hostToggleBtn").setAttribute("aria-controls", "hostPanel");
  $("hostToggleBtn").setAttribute("aria-expanded", "false");
  $("hostToggleBtn").onclick = () => {
    const panel = $("hostPanel");
    panel.classList.toggle("open");
    panel.setAttribute("aria-hidden", panel.classList.contains("open") ? "false" : "true");
    $("hostToggleBtn").setAttribute("aria-expanded", panel.classList.contains("open") ? "true" : "false");
  };
  $("hostAddBtn").onclick = () => {
    if (state.teams[state.currentTeam]) {
      state.teams[state.currentTeam].score += 100;
      renderGame();
    }
  };
  $("hostSubBtn").onclick = () => {
    if (state.teams[state.currentTeam]) {
      state.teams[state.currentTeam].score -= 100;
      renderGame();
    }
  };
  $("hostResetBtn").onclick = () => {
    if (confirm(T().confirmResetScores || T().confirmReset || "Reset all scores?")) {
      state.teams.forEach((t) => (t.score = 0));
      state.currentTeam = 0;
      renderGame();
    }
  };
  $("hostSkipBtn").onclick = hostSkip;
  $("showAnswerBtn").onclick = () => {
    $("answerBox").classList.toggle("show");
    playTone("reveal");
  };
  $("correctBtn").onclick = () => scoreQuestion(true);
  $("wrongBtn").onclick = () => scoreQuestion(false);
  $("confirmTeamBtn").onclick = finalizeScore;
  $("cancelTeamBtn").onclick = () => {
    $("teamPickerModal").classList.remove("open");
    $("correctBtn").disabled = false;
    $("wrongBtn").disabled = false;
    state.selectedScoringTeam = state.currentTeam;
  };
  $("closeQuestionBtn").onclick = closeQuestion;
  $("fullscreenBtn").onclick = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  };
  document.addEventListener("fullscreenchange", () => {
    if (state.roundStarted) renderGame();
  });
  $("languageSetting").onchange = (e) => setLanguage(e.target.value);
  $("soundToggle").onclick = () => {
    state.soundOn = !state.soundOn;
    persistSettings();
    syncSettingToggles();
  };
  $("animationToggle").onclick = () => {
    state.animationsOn = !state.animationsOn;
    document.body.classList.toggle("reduce-motion", !state.animationsOn);
    persistSettings();
    syncSettingToggles();
  };
  $("confettiToggle").onclick = () => {
    state.confettiOn = !state.confettiOn;
    persistSettings();
    syncSettingToggles();
  };
  $("autoTimerToggle").onclick = () => {
    state.autoTimerOn = !state.autoTimerOn;
    persistSettings();
    syncSettingToggles();
  };
  $("timerVisibleToggle").onclick = () => {
    state.timerVisibleOn = !state.timerVisibleOn;
    persistSettings();
    syncSettingToggles();
    if (state.currentQuestion) updateQuestionUI();
  };
  $("settingsMusicToggle").onclick = () => {
    state.musicOn = !state.musicOn;
    state.musicOn ? startAmbientMusic() : stopAmbientMusic();
    persistSettings();
    syncSettingToggles();
  };
  $("boardEffectsToggle").onclick = () => {
    state.boardEffectsOn = !state.boardEffectsOn;
    persistSettings();
    syncSettingToggles();
  };
  $("negativeToggle").onclick = () => {
    state.negativePoints = !state.negativePoints;
    persistSettings();
    syncSettingToggles();
  };
  $("themeSetting").onchange = (e) => {
    state.theme = e.target.value;
    applyTheme();
    persistSettings();
  };
  $("effectsVolume").oninput = (e) => {
    state.effectsVolume = Number(e.target.value) / 100;
    $("effectsVolumeValue").textContent = e.target.value + "%";
    persistSettings();
  };
  $("musicVolume").oninput = (e) => {
    state.musicVolume = Number(e.target.value) / 100;
    $("musicVolumeValue").textContent = e.target.value + "%";
    persistSettings();
  };
  $("celebrationVolume").oninput = (e) => {
    state.celebrationVolume = Number(e.target.value) / 100;
    $("celebrationVolumeValue").textContent = e.target.value + "%";
    persistSettings();
  };
  $("resetSettingsBtn").onclick = () => {
    if (confirm(T().confirmReset)) {
      state.soundOn = true;
      state.animationsOn = true;
      state.confettiOn = true;
      state.autoTimerOn = true;
      state.timerVisibleOn = true;
      state.musicOn = true;
      state.boardEffectsOn = true;
      state.negativePoints = true;
      state.timerSetting = 30;
      state.questionVersion = "multiple";
      state.effectsVolume = 1;
      state.musicVolume = 0.35;
      state.celebrationVolume = 0.7;
      state.theme = "neon";
      applyTheme();
      applyLocale();
      renderSetup();
      renderColumns();
      syncSettingToggles();
      persistSettings();
    }
  };
  function syncSettingToggles() {
    $("dockMusic")?.classList.toggle("off", !state.musicOn);
    $("dockSfx")?.classList.toggle("off", !state.soundOn);
    const map = {
      soundToggle: state.soundOn,
      animationToggle: state.animationsOn,
      confettiToggle: state.confettiOn,
      autoTimerToggle: state.autoTimerOn,
      timerVisibleToggle: state.timerVisibleOn,
      settingsMusicToggle: state.musicOn,
      boardEffectsToggle: state.boardEffectsOn,
      negativeToggle: state.negativePoints,
    };
    for (const [id, v] of Object.entries(map)) $(id)?.classList.toggle("on", v);
    $("effectsVolume").value = Math.round(state.effectsVolume * 100);
    $("musicVolume").value = Math.round(state.musicVolume * 100);
    $("celebrationVolume").value = Math.round(state.celebrationVolume * 100);
    $("effectsVolumeValue").textContent = Math.round(state.effectsVolume * 100) + "%";
    $("musicVolumeValue").textContent = Math.round(state.musicVolume * 100) + "%";
    $("celebrationVolumeValue").textContent = Math.round(state.celebrationVolume * 100) + "%";
    $("themeSetting").value = state.theme;
  }
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (e.key === "Escape") {
      if ($("teamPickerModal").classList.contains("open")) {
        $("teamPickerModal").classList.remove("open");
        state.selectedScoringTeam = state.currentTeam;
        $("correctBtn").disabled = false;
        $("wrongBtn").disabled = false;
        return;
      }
      if ($("questionModal").classList.contains("open")) return closeQuestion();
      const modal = document.querySelector(".modal.open");
      if (modal) modal.classList.remove("open");
      return;
    }
    if (state.currentQuestion && !$("teamPickerModal").classList.contains("open")) {
      if (e.key.toLowerCase() === "a") $("showAnswerBtn").click();
      if (e.key.toLowerCase() === "c" && !$("correctBtn").disabled) $("correctBtn").click();
      if (e.key.toLowerCase() === "x" && !$("wrongBtn").disabled) $("wrongBtn").click();
      if (/^[1-8]$/.test(e.key)) buzzIn(Number(e.key) - 1);
      if (e.key.toLowerCase() === "p") togglePause();
    }
  });

  restore();
  ensureColumnArrays();
  applyTheme();
  applyAudioPrefs();
  document.body.classList.toggle("reduce-motion", !state.animationsOn);
  syncSettingToggles();
  applyLocale();
  renderHistory();
  // Build team inputs when entering setup; retain current names where possible.
  function rebuildTeams() {
    const root = $("teamInputs");
    root.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const wrap = document.createElement("div");
      wrap.className = "team-input-wrap";
      const inp = document.createElement("input");
      inp.className = "team-input";
      inp.maxLength = 30;
      inp.placeholder = `${T().teamWord} ${i + 1}${i < 2 ? " *" : ""}`;
      inp.value = state.teams[i]?.name || "";
      const sel = document.createElement("select");
      sel.className = "color-select";
      TEAM_COLORS.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = "●";
        o.style.color = c;
        o.selected = (state.teams[i]?.color || TEAM_COLORS[i]) === c;
        sel.appendChild(o);
      });
      wrap.append(inp, sel);
      root.appendChild(wrap);
    }
  }
  const oldStart = $("startBtn").onclick;
  $("startBtn").onclick = () => {
    rebuildTeams();
    renderSetup();
    renderColumns();
    applyLocale();
    showScreen("setup");
  };
  rebuildTeams();
  window.JW = { ready: Promise.resolve(true) };
  refreshResume();

  // ---- added: samples, resume, pause, dock, global sfx, a11y
  $("loadSamplesBtn").onclick = () => {
    if (confirm("Replace topics 1–5 with the built-in sample questions?")) {
      seedSamples();
      renderSetup();
      renderColumns();
      JWAudio.sfx("sparkle");
    }
  };
  $("resumeBtn").onclick = resumeGame;
  $("pauseBtn").onclick = togglePause;
  $("dockMusic").onclick = () => $("settingsMusicToggle").click();
  $("dockSfx").onclick = () => $("soundToggle").click();
  document.addEventListener(
    "pointerdown",
    (e) => {
      const b = e.target.closest?.("button");
      if (!b || b.disabled || b.closest("#intro")) return;
      if (b.classList.contains("toggle")) JWAudio.sfx("toggle");
      else if (b.classList.contains("cell")) {
        if (state.boardEffectsOn) JWFX.ripple(b, e);
      } else if (b.classList.contains("choice-btn")) {
        JWAudio.sfx("click");
        JWFX.ripple(b, e);
      } else JWAudio.sfx("click");
    },
    true,
  );
  document.addEventListener("mouseover", (e) => {
    const c = e.target;
    if (c.classList?.contains("cell") && !c.disabled && state.boardEffectsOn) JWAudio.sfx("hover");
  });
  document.addEventListener("jw:intro-done", () => {
    applyAudioPrefs();
    JWAudio.mood("menu");
    JWFX.ambient(state.animationsOn);
  });
  document.querySelectorAll(".modal > div").forEach((d) => {
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
  });
  document.addEventListener("keydown", (e) => {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
      e.ctrlKey ||
      e.metaKey ||
      document.body.classList.contains("intro-open")
    )
      return;
    if (e.key.toLowerCase() === "m") $("dockMusic").click();
  });
})();
