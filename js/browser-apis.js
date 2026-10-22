/* Browser API integrations: Wake Lock, Clipboard/Share, Vibration, Page Visibility, Storage, Service Worker. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const supports = (api) => api in navigator;

  // --- Screen Wake Lock: keep the screen awake while a game is on the board ---
  let lock = null;
  async function syncWakeLock() {
    const playing = $("game")?.classList.contains("active") && !document.hidden;
    try {
      if (playing && !lock && supports("wakeLock")) {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => (lock = null));
      } else if (!playing && lock) {
        await lock.release();
        lock = null;
      }
    } catch {
      /* denied (e.g. low battery) — harmless */
    }
  }
  new MutationObserver(syncWakeLock).observe($("game"), { attributes: true, attributeFilter: ["class"] });

  // --- Page Visibility: pause audio when the tab is hidden, resume when back ---
  let wasRunning = false;
  document.addEventListener("visibilitychange", () => {
    const ctx = window.JWAudio?.ctx();
    if (ctx) {
      if (document.hidden) {
        wasRunning = ctx.state === "running";
        ctx.suspend();
      } else if (wasRunning) ctx.resume();
    }
    syncWakeLock();
  });

  // --- Vibration: short haptic feedback on phones/tablets ---
  const PATTERNS = { correct: [30, 40, 60], wrong: [200], buzz: [40], buzzer: [300], streak: [30, 30, 30, 30, 90], fanfare: [80, 60, 80, 60, 200] };
  if (supports("vibrate") && window.JWAudio) {
    const original = window.JWAudio.sfx;
    window.JWAudio.sfx = (name, arg) => {
      original(name, arg);
      if (PATTERNS[name]) navigator.vibrate(PATTERNS[name]);
    };
  }

  // --- Clipboard + Web Share: copy or share the final results ---
  const results = () => {
    const rows = [...document.querySelectorAll("#finalScores .final-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim());
    return `Family Worship Jeopardy — ${$("resultsTitle").textContent.trim()}\n${rows.join("\n")}`;
  };
  const shareBtn = document.createElement("button");
  shareBtn.className = "secondary";
  shareBtn.type = "button";
  shareBtn.style.marginTop = "8px";
  shareBtn.textContent = supports("share") ? "Share Results" : "Copy Results";
  $("playAgainBtn").after(shareBtn);
  shareBtn.onclick = async () => {
    const text = results();
    try {
      if (supports("share")) await navigator.share({ title: "Family Worship Jeopardy", text });
      else await navigator.clipboard.writeText(text);
      window.JWFX?.popup(shareBtn, supports("share") ? "Shared!" : "Copied!", "info");
    } catch (e) {
      if (e.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(text);
          window.JWFX?.popup(shareBtn, "Copied!", "info");
        } catch {
          prompt("Copy your results:", text);
        }
      }
    }
  };

  // --- Persistent storage: ask the browser not to evict saved questions and games ---
  document.addEventListener("jw:intro-done", () => navigator.storage?.persist?.());

  // --- Service Worker: offline play + installable app ---
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
