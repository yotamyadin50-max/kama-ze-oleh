// כמה זה עולה - game logic
(function () {
  "use strict";

  // ---------- State / Storage ----------
  const STORE_KEY = "kzo_state_v1";
  const defaultState = {
    settings: { sound: true, reducedMotion: false },
    seenTutorial: false,
    stats: {
      bestSetScore: 0,
      totalRounds: 0,
      closeGuesses: 0,      // precision rounds with tier1/tier2
      precisionRounds: 0,
      correctComparisons: 0,
      comparisonRounds: 0,
      bestGuessEver: null,  // {name, errorPct}
      mostSurprising: null, // {name, guess, actual}
      dailyStreak: 0,
      lastDailyDateISO: null,
      dailyHistory: []      // last 7 ISO dates played
    }
  };
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredCloneSafe(defaultState);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredCloneSafe(defaultState), parsed, {
        settings: Object.assign({}, defaultState.settings, parsed.settings),
        stats: Object.assign({}, defaultState.stats, parsed.stats)
      });
    } catch (e) { return structuredCloneSafe(defaultState); }
  }
  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* storage full/blocked: fail silently, never let this crash the game loop */ }
  }
  let state = loadState();

  // ---------- Data ----------
  let PRODUCTS = [];
  let COUNTRIES = null;
  let dataLoadError = false;

  async function loadData() {
    try {
      const [p, c] = await Promise.all([
        fetch("data/products.json").then(r => r.json()),
        fetch("data/countries.json").then(r => r.json())
      ]);
      PRODUCTS = p;
      COUNTRIES = c;
    } catch (e) {
      dataLoadError = true;
    }
  }

  // ---------- Utilities ----------
  function fmtILS(n) {
    return "₪" + (Math.round(n * 100) / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function hebrewDays(n) { return n === 1 ? "יום אחד" : n + " ימים"; }
  const LAUNCH_DATE = new Date(2026, 7, 1); // 2026-08-01, day #1
  function dailyDayNumber() {
    const now = new Date();
    const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const utcLaunch = Date.UTC(LAUNCH_DATE.getFullYear(), LAUNCH_DATE.getMonth(), LAUNCH_DATE.getDate());
    return Math.max(1, Math.floor((utcNow - utcLaunch) / 86400000) + 1);
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function seededRandom(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function shuffleWithRng(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pickTwoDistinct(arr, rng) {
    rng = rng || Math.random;
    if (arr.length < 2) return [arr[0], arr[0]]; // guard: never actually reachable with shipped data (every comparison item has 6+ countries), but never hang if it changes
    const i = Math.floor(rng() * arr.length);
    let j = Math.floor(rng() * arr.length);
    while (j === i) j = Math.floor(rng() * arr.length);
    return [arr[i], arr[j]];
  }
  // Returns `count` indices into [0, poolSize) with no repeats until every index has
  // appeared once (cycles with a fresh shuffle only if count > poolSize). This is what
  // keeps a single session from drawing the same product/comparison-item twice in a
  // row the way independent random draws did before.
  function pickDistinctIndices(poolSize, count, rng) {
    const out = [];
    while (out.length < count) {
      const idx = Array.from({ length: poolSize }, (_, i) => i);
      out.push(...shuffleWithRng(idx, rng));
    }
    return out.slice(0, count);
  }
  function buildRoundContent(plan, rng) {
    const precisionCount = plan.filter(t => t === "precision").length;
    const comparisonCount = plan.length - precisionCount;
    const productIdx = precisionCount ? pickDistinctIndices(PRODUCTS.length, precisionCount, rng) : [];
    const itemIdx = comparisonCount ? pickDistinctIndices(COUNTRIES.items.length, comparisonCount, rng) : [];
    let pi = 0, ci = 0;
    return plan.map(type => {
      if (type === "precision") {
        return { type, product: PRODUCTS[productIdx[pi++]] };
      }
      const item = COUNTRIES.items[itemIdx[ci++]];
      const [a, b] = pickTwoDistinct(item.countries, rng);
      const swap = rng() < 0.5;
      return { type, item, countryA: swap ? b : a, countryB: swap ? a : b };
    });
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function launchConfetti(n, colorVar) {
    if (state.settings.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = [getComputedStyle(document.documentElement).getPropertyValue("--accent"), getComputedStyle(document.documentElement).getPropertyValue("--success"), getComputedStyle(document.documentElement).getPropertyValue("--primary")];
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "confetti-piece";
      el.style.left = (10 + Math.random() * 80) + "vw";
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = (Math.random() * 150) + "ms";
      el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    }
  }

  // ---------- Session / Round-set state ----------
  let session = null; // { track, roundCount, rounds:[], index, score, streak, isDaily, dailyPlan }

  function computeAccuracyTier(guess, actual) {
    // Guard: no shipped product is free, but never divide by zero if that ever changes.
    if (actual === 0) { const c = guess === 0 ? 1 : 0; return { tier: c ? 1 : 4, label: c ? "כמעט בול!" : "רחוק משם", closeness: c, errorPct: c ? 0 : 100, base: c ? 1000 : 50 }; }
    const error = Math.abs(guess - actual) / actual;
    const closeness = Math.max(0, 1 - error);
    let tier, label;
    if (closeness >= 0.9) { tier = 1; label = "כמעט בול!"; }
    else if (closeness >= 0.7) { tier = 2; label = "קרוב מאוד"; }
    else if (closeness >= 0.4) { tier = 3; label = "לא רחוק"; }
    else { tier = 4; label = "רחוק משם"; }
    const base = Math.max(50, Math.round(closeness * 1000));
    return { tier, label, closeness, errorPct: Math.round(error * 100), base };
  }

  function applyStreakMultiplier(base, isGood) {
    // Checked against the streak value AFTER this guess (not before), so "3 in a row"
    // really means the 3rd good guess, matching both the confetti trigger and the
    // About page's own stated rule instead of kicking in one guess late.
    const streakAfter = isGood ? session.streak + 1 : 0;
    let mult = 1;
    if (streakAfter >= 10) mult = 2.0;
    else if (streakAfter >= 6) mult = 1.5;
    else if (streakAfter >= 3) mult = 1.2;
    const score = Math.round(base * mult);
    session.streak = streakAfter;
    return { score, mult };
  }

  function buildRoundPlan(track, count, rng, precisionCount) {
    const plan = [];
    if (track === "mixed") {
      const pCount = Math.max(0, Math.min(count, precisionCount == null ? Math.round(count / 2) : precisionCount));
      for (let i = 0; i < pCount; i++) plan.push("precision");
      for (let i = pCount; i < count; i++) plan.push("comparison");
      return shuffleWithRng(plan, rng);
    }
    for (let i = 0; i < count; i++) plan.push(track);
    return plan;
  }

  function startSession(track, roundCount, isDaily, precisionCount) {
    // Content is computed ONCE here for the whole session (not lazily per round), for two reasons:
    // 1) a daily session used to re-derive today's date on every round render, so a session played
    //    across local midnight could silently draw later rounds from the WRONG day's seed, breaking
    //    the "identical 5 rounds for every player" promise. Freezing everything at session start fixes it.
    // 2) it lets pickDistinctIndices hand out products/comparison-items without replacement within the
    //    session, instead of each round being an independent random draw that could repeat the same
    //    item (confirmed to happen in the large majority of real sessions).
    let rng = Math.random;
    let plan;
    if (isDaily) {
      const seed = "kzo-daily-" + todayISO();
      rng = seededRandom(seed);
      plan = ["precision", "precision", "precision", "comparison", "comparison"];
      plan = shuffleWithRng(plan, seededRandom(seed + "-order"));
    } else {
      plan = buildRoundPlan(track, roundCount, rng, precisionCount);
    }
    const rounds = buildRoundContent(plan, rng);
    session = {
      track, roundCount: plan.length, plan, rounds, index: 0, score: 0, streak: 0,
      isDaily: !!isDaily, results: [],
      precisionCount: track === "mixed" ? plan.filter(t => t === "precision").length : null
    };
    navigate("#/play/round");
  }

  // ---------- Rendering ----------
  const view = document.getElementById("view");
  const tabbar = document.getElementById("tabbar");
  const overflowBtn = document.getElementById("overflow-btn");

  const ROUTE_TITLES = {
    home: "כמה זה עולה", play: "איך רוצים לשחק? · כמה זה עולה", round: "כמה זה עולה",
    vs: "VS: נגד יריב אמיתי · כמה זה עולה", daily: "האתגר היומי · כמה זה עולה",
    stats: "ההתקדמות שלי · כמה זה עולה", about: "מאיפה המחירים באמת מגיעים · כמה זה עולה",
    settings: "הגדרות · כמה זה עולה", privacy: "מדיניות פרטיות · כמה זה עולה"
  };

  function setChrome(routeName) {
    const immersive = routeName === "round";
    tabbar.classList.toggle("hidden", immersive);
    overflowBtn.classList.toggle("hidden", immersive);
    document.querySelectorAll(".tab-item").forEach(el => {
      el.classList.toggle("active", el.dataset.tab === routeName);
    });
    view.classList.toggle("immersive", immersive);
    document.title = ROUTE_TITLES[routeName] || "כמה זה עולה";
  }

  // A real per-hostname signal, not a guess: this exact static public deploy has no VS
  // backend (confirmed), while a self-hosted copy on localhost does. Not perfectly future-proof
  // if this ever gets deployed somewhere with a real backend on a non-localhost host, but it's
  // honest for the site's actual current situation and trivial to remove once that changes.
  const VS_LIKELY_UNAVAILABLE = !["localhost", "127.0.0.1"].includes(location.hostname);

  function renderHome() {
    const dailyDone = state.stats.lastDailyDateISO === todayISO();
    view.innerHTML = `
      <section class="hero">
        <h1>כמה זה עולה, באמת?</h1>
        <p class="subhead">לא הערכות, מחירים אמיתיים. מהמחירונים שרשתות השיווק חייבות בחוק לפרסם, ומדדים כלכליים אמיתיים בין מדינות. אתם מנחשים, אנחנו חושפים.</p>
        <a href="#/play" class="btn btn-primary" id="home-play-btn">שחקו עכשיו</a>
        <p class="trust-line">כל מחיר כאן אמיתי, עם מקור ותאריך.</p>
        ${!dailyDone ? `<a href="#/daily" class="daily-teaser">🔥 האתגר של היום מחכה</a>` : ""}
      </section>
      <div class="mode-cards">
        <a class="mode-card mode-precision" href="#/play/pick-precision">
          <span class="icon">🏷️</span>
          <strong>נחשו מחיר</strong>
          <span class="desc">תמונה של מוצר אמיתי, אתם קובעים כמה הוא עולה.</span>
        </a>
        <a class="mode-card mode-comparison" href="#/play/pick-comparison">
          <span class="icon">🌍</span>
          <strong>איזו מדינה יקרה יותר</strong>
          <span class="desc">אותו מוצר, שתי מדינות, מי משלם יותר?</span>
        </a>
        <a class="mode-card mode-duel" href="#/vs">
          <span class="icon">⚔️</span>
          <strong>VS: נגד יריב אמיתי${VS_LIKELY_UNAVAILABLE ? ` <span class="unavailable-tag">לא זמין כרגע</span>` : ""}</strong>
          <span class="desc">15 שניות לניחוש, נגד מישהו שמחובר עכשיו. בלי רובוטים.</span>
        </a>
      </div>
      <footer class="page-footer">
        <a href="#/about">מאיפה המחירים?</a> · <a href="#/privacy">מדיניות פרטיות</a>
      </footer>
    `;
  }

  // Remembers the player's last picks across visits to this screen (was silently
  // resetting to the 10-round default every time you navigated away and back).
  const playHubMemory = { track: null, len: 10, precisionCount: null };

  function renderPlayHub(preselectTrack) {
    let selectedTrack = preselectTrack || playHubMemory.track || "mixed";
    let selectedLen = playHubMemory.len;
    let precisionCount = playHubMemory.precisionCount == null ? Math.round(selectedLen / 2) : Math.min(selectedLen, playHubMemory.precisionCount);

    function trackCardsHtml() {
      const cards = [
        { t: "mixed", icon: "🎲", title: "מעורב", desc: "קצת מזה, קצת מזה. ברירת המחדל שלנו." },
        { t: "precision", icon: "🏷️", title: "נחשו מחיר", desc: "מוצר אמיתי, המספר שלכם." },
        { t: "comparison", icon: "🌍", title: "איזו מדינה יקרה יותר", desc: "שני דגלים, מחיר אחד, מי ניצח?" }
      ];
      return cards.map(c => `<div class="track-card${selectedTrack === c.t ? " selected" : ""}" data-track="${c.t}" role="radio" aria-checked="${selectedTrack === c.t}" tabindex="0"><span class="icon">${c.icon}</span><div><strong>${c.title}</strong><span class="desc">${c.desc}</span></div></div>`).join("");
    }
    function lenPickerHtml() {
      return [5, 10, 15].map(n => `<button class="pill${selectedLen === n ? " selected" : ""}" data-len="${n}" role="radio" aria-checked="${selectedLen === n}">${n}</button>`).join("");
    }
    function mixRowHtml() {
      if (selectedTrack !== "mixed") return "";
      const comparisonCount = selectedLen - precisionCount;
      return `
        <p style="text-align:center;color:var(--muted);margin-top:24px;">כמה מכל סוג מתוך ה-${selectedLen}?</p>
        <div class="mix-row">
          <span class="mix-label">🏷️ נחשו מחיר<br><strong class="mono">${precisionCount}</strong></span>
          <div class="mix-steppers">
            <button class="step-btn" id="mix-up" aria-label="עוד סבבי נחשו מחיר">+</button>
            <button class="step-btn" id="mix-down" aria-label="פחות סבבי נחשו מחיר">−</button>
          </div>
          <span class="mix-label">🌍 השוואת מדינות<br><strong class="mono">${comparisonCount}</strong></span>
        </div>`;
    }

    function draw() {
      view.innerHTML = `
        <h2 class="hub-title">איך רוצים לשחק?</h2>
        <div id="track-cards" role="radiogroup" aria-label="בחירת מסלול">${trackCardsHtml()}</div>
        <p style="text-align:center;color:var(--muted);margin-top:24px;">כמה סבבים?</p>
        <div class="round-len-picker" role="radiogroup" aria-label="אורך סבב">${lenPickerHtml()}</div>
        <div id="mix-row-wrap">${mixRowHtml()}</div>
        <div class="btn-row"><button class="btn btn-primary" id="hub-start-btn">התחילו</button></div>
      `;
      view.querySelectorAll(".track-card").forEach(el => {
        el.addEventListener("click", () => { selectedTrack = el.dataset.track; playHubMemory.track = selectedTrack; draw(); });
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectedTrack = el.dataset.track; playHubMemory.track = selectedTrack; draw(); } });
      });
      view.querySelectorAll(".pill").forEach(el => el.addEventListener("click", () => {
        selectedLen = parseInt(el.dataset.len, 10);
        precisionCount = Math.round(selectedLen / 2);
        playHubMemory.len = selectedLen; playHubMemory.precisionCount = precisionCount;
        draw();
      }));
      const mixUp = document.getElementById("mix-up");
      const mixDown = document.getElementById("mix-down");
      if (mixUp) mixUp.addEventListener("click", () => { precisionCount = Math.min(selectedLen, precisionCount + 1); playHubMemory.precisionCount = precisionCount; draw(); });
      if (mixDown) mixDown.addEventListener("click", () => { precisionCount = Math.max(0, precisionCount - 1); playHubMemory.precisionCount = precisionCount; draw(); });
      document.getElementById("hub-start-btn").addEventListener("click", () => startSession(selectedTrack, selectedLen, false, precisionCount));
    }
    draw();
  }

  function closenessMeterSvg(closeness) {
    // needle rotates from -90deg (far) to +90deg (bullseye)
    const angle = -90 + closeness * 180;
    return `<svg class="closeness-meter" viewBox="0 0 160 100" aria-hidden="true">
      <path d="M10,80 A70,70 0 0,1 150,80" fill="none" stroke="var(--surface)" stroke-width="14" stroke-linecap="round"/>
      <path d="M10,80 A70,70 0 0,1 150,80" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${closeness * 220} 220"/>
      <g class="needle" style="transform: rotate(${angle}deg) translate(80px, 80px);">
        <line x1="0" y1="0" x2="0" y2="-58" stroke="var(--primary)" stroke-width="4" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="7" fill="var(--primary)"/>
      </g>
    </svg>`;
  }

  function renderRoundQuestion() {
    // A refresh, a direct/bookmarked link to this route, or Back-then-Forward can all land
    // here with no active session — without this guard the app threw on session.plan and
    // froze forever on the loading skeleton with no visible error.
    if (!session) { navigate("#/play"); return; }
    if (dataLoadError) { renderRoundError(); return; }
    if (!PRODUCTS.length) { renderRoundLoading(); loadData().then(() => renderRoundQuestion()); return; }
    const rd = session.rounds[session.index];
    session._current = rd;

    const topbar = `
      <div class="round-topbar">
        <span>${session.index + 1} מתוך ${session.roundCount}</span>
        <span class="streak" id="streak-indicator">🔥 ${session.streak} · ${session.score.toLocaleString("he-IL")}</span>
        <button class="exit-btn" id="exit-round" aria-label="יציאה">✕</button>
      </div>`;

    if (rd.type === "precision") {
      const p = rd.product;
      const attributionHtml = p.photographer
        ? `<p class="attribution">תמונה: <a href="${p.photographer_url}?utm_source=kama_ze_ole&utm_medium=referral" target="_blank" rel="noopener">${escapeHtml(p.photographer)}</a> ב-<a href="https://unsplash.com/?utm_source=kama_ze_ole&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a></p>`
        : `<p class="attribution">תמונת המוצר האמיתית, מ-Shufersal Online</p>`;
      view.innerHTML = topbar + `
        <div class="round-stage">
          <div class="product-image-wrap"><img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none';this.parentElement.classList.add('img-broken')"></div>
          ${attributionHtml}
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          <p style="text-align:center;color:var(--muted);">כמה זה עולה, בשקלים?</p>
          <div class="guess-input-row">
            <button class="step-btn" id="step-up" aria-label="הוסיפו">+</button>
            <input type="number" id="guess-input" inputmode="decimal" dir="ltr" value="10" min="0" aria-label="הניחוש שלכם בשקלים">
            <button class="step-btn" id="step-down" aria-label="הפחיתו">−</button>
          </div>
          <div class="btn-row"><button class="btn btn-primary" id="guess-btn">נחשו!</button></div>
        </div>`;
      document.getElementById("step-up").addEventListener("click", () => bump(1));
      document.getElementById("step-down").addEventListener("click", () => bump(-1));
      document.getElementById("guess-btn").addEventListener("click", () => revealPrecision(p));
      function bump(d) {
        const inp = document.getElementById("guess-input");
        inp.value = Math.max(0, (parseFloat(inp.value) || 0) + d);
      }
    } else {
      view.innerHTML = topbar + `
        <div class="round-stage">
          <h3 class="product-name">${escapeHtml(rd.item.item_name)}</h3>
          <p style="text-align:center;color:var(--muted);">איפה זה יותר יקר?</p>
          <div class="country-pair" role="group" aria-label="בחרו את המדינה היקרה יותר">
            <div class="country-card" data-side="a" role="button" tabindex="0" aria-label="${escapeHtml(rd.countryA.country_he)}"><img class="flag" src="https://flagcdn.com/w160/${rd.countryA.flag_code}.png" alt=""><strong>${escapeHtml(rd.countryA.country_he)}</strong></div>
            <div class="country-card" data-side="b" role="button" tabindex="0" aria-label="${escapeHtml(rd.countryB.country_he)}"><img class="flag" src="https://flagcdn.com/w160/${rd.countryB.flag_code}.png" alt=""><strong>${escapeHtml(rd.countryB.country_he)}</strong></div>
          </div>
        </div>`;
      let answered = false;
      const chooseCountry = (el) => {
        if (answered) return;
        answered = true;
        view.querySelectorAll(".country-card").forEach(x => x.classList.remove("chosen"));
        el.classList.add("chosen");
        setTimeout(() => revealComparison(rd, el.dataset.side), 150);
      };
      view.querySelectorAll(".country-card").forEach(el => {
        el.addEventListener("click", () => chooseCountry(el));
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chooseCountry(el); } });
      });
    }
    document.getElementById("exit-round").addEventListener("click", exitRound);
  }

  function renderRoundLoading() {
    view.innerHTML = `<div class="round-topbar"><span>&nbsp;</span></div><div class="round-stage"><div class="skeleton"></div><p style="text-align:center;color:var(--muted);margin-top:16px;">טוענים מחירים אמיתיים...</p></div>`;
  }
  function renderRoundError() {
    view.innerHTML = `<div class="error-state"><p style="font-size:32px;">⚠️</p><p>לא הצלחנו לטעון את המחירים כרגע.</p><button class="btn btn-primary" id="retry-btn">נסו שוב</button></div>`;
    document.getElementById("retry-btn").addEventListener("click", () => { dataLoadError = false; loadData().then(renderRoundQuestion); });
  }

  function exitRound() {
    if (!confirm("לצאת מהסבב? הניקוד וההתקדמות בסבב הזה לא יישמרו.")) return;
    const track = session && session.track;
    session = null;
    if (track === "precision") navigate("#/play/pick-precision");
    else if (track === "comparison") navigate("#/play/pick-comparison");
    else navigate("#/play");
  }

  function revealPrecision(product) {
    const guess = parseFloat(document.getElementById("guess-input").value) || 0;
    const actual = product.price_ils;
    const r = computeAccuracyTier(guess, actual);
    const isGood = r.tier <= 2;
    const { score, mult } = applyStreakMultiplier(r.base, isGood);
    session.score += score;
    // Only recorded into this session's own results here; committed to the permanent
    // stats record in renderResults(), and only once the whole set is actually completed
    // (see renderResults) so an abandoned mid-set exit can't pollute lifetime accuracy.
    session.results.push({ type: "precision", name: product.name, guess, actual, errorPct: r.errorPct, tier: r.tier, score, isGood, product });

    const streakEl = document.getElementById("streak-indicator");
    if (!isGood) streakEl.classList.add("broken");

    const stage = document.querySelector(".round-stage");
    stage.insertAdjacentHTML("beforeend", `
      <div class="reveal-panel">
        ${closenessMeterSvg(r.closeness)}
        <span class="closeness-tag tier${r.tier}">${r.label}</span>
        <div class="real-price mono">${fmtILS(actual)}</div>
        <p class="source-line">לפי ${escapeHtml(product.source)}, נכון ל-${escapeHtml(product.date_checked)}</p>
        <p class="round-score ${score > 0 ? 'pos' : 'zero'} mono">+${score.toLocaleString("he-IL")} נקודות ${mult > 1 ? "(מכפיל x" + mult + ")" : ""}</p>
        <div class="btn-row"><button class="btn btn-primary" id="next-btn">לסבב הבא</button></div>
      </div>`);
    document.getElementById("guess-btn").disabled = true;
    document.getElementById("step-up").disabled = true;
    document.getElementById("step-down").disabled = true;
    document.getElementById("guess-input").disabled = true;
    if (r.tier === 1 || (isGood && session.streak >= 3)) launchConfetti(24);
    animateStreakUpdate();
    document.getElementById("next-btn").addEventListener("click", nextRound);
  }

  function revealComparison(rd, chosenSide) {
    const a = rd.countryA, b = rd.countryB;
    // Real data does contain exact price ties (confirmed in the shipped countries.json).
    // The old logic always called "b" correct on a tie regardless of what was picked;
    // a genuine tie now counts as correct either way instead of silently favoring one side.
    const tie = a.price_usd === b.price_usd;
    const correctSide = tie ? null : (a.price_usd > b.price_usd ? "a" : "b");
    const correct = tie ? true : (chosenSide === correctSide);
    const base = 500;
    const { score, mult } = applyStreakMultiplier(correct ? base : 0, correct);
    session.score += score;
    session.results.push({ type: "comparison", name: rd.item.item_name + ": " + a.country_he + " / " + b.country_he, correct, score });

    const streakEl = document.getElementById("streak-indicator");
    if (!correct) streakEl.classList.add("broken");

    document.querySelectorAll(".country-card").forEach(el => {
      el.classList.remove("chosen"); // the outcome ring below replaces the mid-pick highlight, not stacks on it
      const side = el.dataset.side;
      const c = side === "a" ? a : b;
      const hasLocal = c.local_currency && c.local_currency !== "USD";
      const priceLine = hasLocal
        ? `${c.local_price.toLocaleString("he-IL")} ${c.local_currency} · $${c.price_usd}`
        : `$${c.price_usd.toLocaleString("he-IL")}`;
      el.innerHTML += `<div class="mono" style="margin-top:8px;font-weight:700;">${priceLine}</div>`;
      if (tie || side === correctSide) el.style.boxShadow = "0 0 0 3px var(--success)";
      else if (side === chosenSide) el.style.boxShadow = "0 0 0 3px var(--error)";
    });

    const stage = document.querySelector(".round-stage");
    stage.insertAdjacentHTML("beforeend", `
      <div class="reveal-panel">
        <span class="closeness-tag ${correct ? 'tier1' : 'tier4'}">${tie ? "תיקו במחיר, שניכם צדקתם!" : (correct ? "נכון!" : "הפעם לא")}</span>
        <p class="source-line">לפי ${escapeHtml(rd.item.source)}, נכון ל-${escapeHtml(rd.item.date)}</p>
        <p class="round-score ${score > 0 ? 'pos' : 'zero'} mono">+${score.toLocaleString("he-IL")} נקודות ${mult > 1 ? "(מכפיל x" + mult + ")" : ""}</p>
        <div class="btn-row"><button class="btn btn-primary" id="next-btn">לסבב הבא</button></div>
      </div>`);
    if (correct && session.streak >= 3) launchConfetti(24);
    animateStreakUpdate();
    document.getElementById("next-btn").addEventListener("click", nextRound);
  }

  function animateStreakUpdate() {
    const el = document.getElementById("streak-indicator");
    if (el) el.textContent = `🔥 ${session.streak} · ${session.score.toLocaleString("he-IL")}`;
  }

  function nextRound() {
    session.index++;
    if (session.index >= session.roundCount) {
      navigate("#/play/results");
    } else {
      renderRoundQuestion();
    }
  }

  function renderResults() {
    if (!session) { navigate("#/play"); return; }

    // Committed to the permanent stats record only now, once the set is genuinely complete
    // (exitRound() never reaches this screen), so an abandoned mid-set session can no longer
    // pollute lifetime accuracy, "best guess ever," or totals.
    session.results.forEach(r => {
      state.stats.totalRounds++;
      if (r.type === "precision") {
        state.stats.precisionRounds++;
        if (r.isGood) state.stats.closeGuesses++;
        if (!state.stats.bestGuessEver || r.errorPct < state.stats.bestGuessEver.errorPct) {
          state.stats.bestGuessEver = { name: r.name, errorPct: r.errorPct };
        }
        if (!state.stats.mostSurprising || r.errorPct > state.stats.mostSurprising.errorPct) {
          state.stats.mostSurprising = { name: r.name, guess: r.guess, actual: r.actual, errorPct: r.errorPct, source: r.product.source, date: r.product.date_checked };
        }
      } else {
        state.stats.comparisonRounds++;
        if (r.correct) state.stats.correctComparisons++;
      }
    });

    const isNewHigh = session.score > state.stats.bestSetScore;
    const oldBest = state.stats.bestSetScore;
    if (isNewHigh) state.stats.bestSetScore = session.score;
    if (session.isDaily) {
      state.stats.dailyStreak = (state.stats.lastDailyDateISO === yesterdayISO()) ? state.stats.dailyStreak + 1 : 1;
      state.stats.lastDailyDateISO = todayISO();
      state.stats.dailyHistory = (state.stats.dailyHistory || []).filter(d => d !== todayISO()).concat([todayISO()]).slice(-42);
    }
    saveState();

    const precisionResults = session.results.filter(r => r.type === "precision");
    const comparisonResults = session.results.filter(r => r.type === "comparison");
    const best = precisionResults.length ? precisionResults.reduce((a, b) => (a.errorPct <= b.errorPct ? a : b)) : null;
    const surprising = precisionResults.length ? precisionResults.slice().sort((a, b) => b.errorPct - a.errorPct)[0] : null;
    // Comparison-only runs never had a highlight moment before (both cards above depend on
    // precision-specific guess/actual data) — a real streak-of-correct-calls stat fills that gap.
    let bestComparisonStreak = 0, curStreak = 0;
    comparisonResults.forEach(r => { curStreak = r.correct ? curStreak + 1 : 0; bestComparisonStreak = Math.max(bestComparisonStreak, curStreak); });

    function shareEmoji(r) {
      if (r.type === "precision") return { 1: "🟩", 2: "🟨", 3: "🟧", 4: "⬜" }[r.tier] || "⬜";
      return r.correct ? "🟩" : "⬜";
    }
    const emojiGrid = session.results.map(shareEmoji).join("");
    const shareGrid = session.results.map(r => {
      if (r.type === "precision") return `<div class="share-cell tier${r.tier}"></div>`;
      return `<div class="share-cell ${r.correct ? 'correct' : 'wrong'}"></div>`;
    }).join("");

    // The visual grid above always existed on screen but never made it into what actually got
    // shared, plain text. The emoji grid is the same information rendered as real shareable text,
    // the mechanic that made Wordle's own share format work.
    const shareText = session.isDaily
      ? `כמה זה עולה, יום ${dailyDayNumber()}\n${emojiGrid}\n${session.score.toLocaleString("he-IL")} נקודות · רצף של ${hebrewDays(state.stats.dailyStreak)}\nתנסו גם אתם: `
      : `כמה זה עולה\n${emojiGrid}\n${session.score.toLocaleString("he-IL")} נקודות. תנסו גם אתם: `;

    view.innerHTML = `
      <h2 style="text-align:center;">ככה שיחקתם</h2>
      ${isNewHigh && oldBest > 0 ? `<div style="text-align:center;"><span class="new-high-badge">שיא חדש! ${oldBest.toLocaleString("he-IL")} → ${session.score.toLocaleString("he-IL")}</span></div>` : ""}
      <div class="results-score"><div class="big-score mono">${session.score.toLocaleString("he-IL")}</div><div class="score-caption">נקודות</div></div>
      ${best ? `<div class="highlight-card">${best.product ? `<img src="${best.product.image}" alt="${escapeHtml(best.name)}" onerror="this.style.display='none'">` : ""}<div>הניחוש הכי מדויק שלכם: <strong>${escapeHtml(best.name)}</strong>${best.errorPct !== undefined ? `, טעיתם ב-${best.errorPct}% בלבד` : ""}</div></div>` : ""}
      ${surprising ? `<div class="highlight-card">${surprising.product ? `<img src="${surprising.product.image}" alt="${escapeHtml(surprising.name)}" onerror="this.style.display='none'">` : ""}<div>הכי הפתיע אתכם: <strong>${escapeHtml(surprising.name)}</strong>. ניחשתם ${fmtILS(surprising.guess)}, המחיר האמיתי היה ${fmtILS(surprising.actual)}</div></div>` : ""}
      ${!precisionResults.length && comparisonResults.length ? `<div class="highlight-card"><div>הרצף הכי טוב שלכם בסבב הזה: <strong>${bestComparisonStreak} תשובות נכונות ברצף</strong> מתוך ${comparisonResults.length}.</div></div>` : ""}
      <div class="share-card">
        <strong>כמה זה עולה</strong>
        <div class="share-grid">${shareGrid}</div>
        <button class="btn btn-secondary" id="share-btn" style="margin-top:8px;">שתפו את התוצאה</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="again-btn">עוד סבב</button>
        <a class="btn btn-secondary" href="#/daily">האתגר היומי</a>
        <a class="btn btn-secondary" href="#/stats">לסטטיסטיקות</a>
      </div>
    `;
    document.getElementById("again-btn").addEventListener("click", () => startSession(session.track, session.roundCount, false, session.precisionCount));
    document.getElementById("share-btn").addEventListener("click", async () => {
      const text = shareText + location.origin + location.pathname;
      if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} }
      else {
        try { await navigator.clipboard.writeText(text); toast("הועתק ללוח"); }
        catch (e) { toast("לא הצלחנו להעתיק, נסו שוב"); }
      }
    });
  }

  function yesterdayISO() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function renderDaily() {
    const done = state.stats.lastDailyDateISO === todayISO();
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      week.push({ iso, played: (state.stats.dailyHistory || []).includes(iso) });
    }
    view.innerHTML = `
      <h2 style="text-align:center;">האתגר היומי</h2>
      <div class="daily-streak-count mono">${state.stats.dailyStreak || 0}</div>
      <p class="daily-streak-label">${state.stats.dailyStreak ? "רצף של " + hebrewDays(state.stats.dailyStreak) : "שחקו כל יום, תבנו רצף. פשוט כמו זה."}</p>
      <div class="week-board">${week.map(w => `<div class="week-day ${w.played ? 'played' : ''}">${w.played ? '✓' : ''}</div>`).join("")}</div>
      <div class="btn-row">
        ${done
        ? `<p style="text-align:center;color:var(--muted);">שיחקתם היום. חזרו מחר לרצף הבא.</p><a class="btn btn-secondary" href="#/stats">לצפייה בהתקדמות</a>`
        : `<button class="btn btn-primary" id="daily-start-btn">שחקו את האתגר של היום</button>`}
      </div>
    `;
    if (!done) document.getElementById("daily-start-btn").addEventListener("click", () => startSession("mixed", 5, true));
  }

  function renderStats() {
    const s = state.stats;
    if (s.totalRounds === 0) {
      view.innerHTML = `<div class="empty-state"><p style="font-size:32px;">📊</p><p>עוד לא שיחקתם אף סבב. בואו נתקן את זה.</p><a class="btn btn-primary" href="#/play">שחקו עכשיו</a></div>`;
      return;
    }
    const closePct = s.precisionRounds ? Math.round((s.closeGuesses / s.precisionRounds) * 100) : 0;
    const correctPct = s.comparisonRounds ? Math.round((s.correctComparisons / s.comparisonRounds) * 100) : 0;
    const history = s.dailyHistory || [];
    const days = [];
    for (let i = 41; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      days.push(history.includes(iso));
    }
    const cells = days.map(played => `<div class="streak-cell ${played ? 'played' : ''}"></div>`).join("");
    view.innerHTML = `
      <h2 style="text-align:center;">ההתקדמות שלכם</h2>
      <div class="streak-board">${cells}</div>
      <div class="stat-grid">
        <div class="stat-tile"><span class="num mono">${s.bestSetScore.toLocaleString("he-IL")}</span><span class="label">שיא ניקוד בסבב</span></div>
        <div class="stat-tile"><span class="num mono">${closePct}%</span><span class="label">ניחושים קרובים מאוד</span></div>
        <div class="stat-tile"><span class="num mono">${correctPct}%</span><span class="label">תשובות נכונות (השוואה)</span></div>
        <div class="stat-tile"><span class="num mono">${s.totalRounds}</span><span class="label">סה"כ סבבים ששיחקתם</span></div>
      </div>
      ${s.bestGuessEver ? `<div class="highlight-card"><div>הניחוש הכי מדויק אי פעם: <strong>${escapeHtml(s.bestGuessEver.name)}</strong>, טעות של ${s.bestGuessEver.errorPct}% בלבד.</div></div>` : ""}
      ${s.mostSurprising ? `<div class="highlight-card"><div>הניחוש שהכי הפתיע אתכם: <strong>${escapeHtml(s.mostSurprising.name)}</strong>${s.mostSurprising.guess !== undefined ? `. ניחשתם ${fmtILS(s.mostSurprising.guess)}, המחיר האמיתי היה ${fmtILS(s.mostSurprising.actual)}` : ""}.</div></div>` : ""}
    `;
  }

  function renderAbout() {
    view.innerHTML = `
      <div class="content-page">
        <h2>מאיפה המחירים באמת מגיעים</h2>
        <p>המחירים כאן לא מומצאים ולא מוערכים. רוב המוצרים הישראליים נאספו ישירות מהחנות המקוונת של שופרסל, הרשת הגדולה בישראל, שמחויבת בחוק (תקנות קידום התחרות בענף המזון (שקיפות מחירים), תשע"ה-2014) לפרסם את המחיר האמיתי של כל מוצר שהיא מוכרת. חלק מהמוצרים גם הצטלבו מול השוואות מחירים בין-רשתיות. אנחנו לא ממציאים כלום, אנחנו קוראים את מה שהרשתות כבר חייבות לפרסם. הקטלוג משתרע על פני כל המחלקות שיש לשופרסל אונליין: מזון וטרי, פארם וקוסמטיקה, תינוקות וחיות מחמד, ומוצרי בית - 2,530 מוצרים אמיתיים. <strong>גם התמונות של המוצרים האלה אמיתיות</strong>: תמונת המוצר עצמו כפי שהיא מופיעה בחנות המקוונת של שופרסל, לא תמונת מלאי כללית.</p>
        <p>השוואות המדינות מבוססות על חמישה פריטים אמיתיים: מדד ביג מק של The Economist (19 מדינות), מחירי חלב, בנזין וקפוצ'ינו ממאגר Numbeo (100 מדינות לכל פריט!), ומדד מחירי אייפון מבוסס נתוני Deutsche Bank ומחירי חנויות Apple רשמיות. כל סבב בוחר פריט אקראי וזוג מדינות אקראי בתוכו, בסך הכל למעלה מ-15,000 צירופים אפשריים, כדי שהמשחק לא יחזור על עצמו. כל סבב מציג בדיוק לפי איזה מקור ותאריך.</p>
        <ul class="source-list">
          <li><a href="https://www.nevo.co.il/law_html/law00/135376.htm" target="_blank" rel="noopener">תקנות שקיפות מחירים (נבו)</a></li>
          <li><a href="https://www.consumers.org.il/item/transparency_price" target="_blank" rel="noopener">רשימת פורטלי הרשתות (המועצה לצרכנות)</a></li>
          <li><a href="https://github.com/TheEconomist/big-mac-data" target="_blank" rel="noopener">Big Mac Index, The Economist</a></li>
          <li><a href="https://www.numbeo.com/cost-of-living/" target="_blank" rel="noopener">Numbeo Cost of Living Database (חלב, בנזין, קפוצ'ינו)</a></li>
          <li><a href="https://www.apple.com/il/shop/buy-iphone" target="_blank" rel="noopener">מחירי חנויות Apple רשמיות, בשילוב ניתוח Deutsche Bank</a></li>
        </ul>
        <div class="honesty-box">הרשתות מעדכנות את המחירים אצלן תוך שעה מכל שינוי. אנחנו מרעננים את מאגר המשחק מעת לעת, לא בזמן אמת, כך שמחיר בודד עלול להשתנות אצל הרשת בין הבדיקה למשחק שלכם. ליד כל מחיר מוצג התאריך שבו הוא נבדק, כדי שתדעו בדיוק מה אתם רואים. הקטלוג כולל 2,530 מוצרים אמיתיים, ולכל אחד מהם תמונת מוצר משלו: 2,509 מהם משתמשים בתמונת המוצר האמיתית כפי שהיא מופיעה בחנות המקוונת של שופרסל (לא תמונת מלאי כללית, לא משותפת בין מוצרים), ו-21 המוצרים המקוריים (שהמחיר שלהם הגיע ממקורות אחרים כמו מחירים בפיקוח ממשלתי או אתרי השוואת מחירים) עדיין משתמשים בתמונת מלאי אמיתית ומאומתת מ-Unsplash. מחירי חלב, בנזין וקפוצ'ינו בין מדינות מבוססים על Numbeo, מאגר מבוסס דיווחי משתמשים (לא סטטיסטיקה ממשלתית רשמית), כך שהדיוק למדינות עם פחות דיווחים עלול להיות נמוך יותר. מדד ביג מק ומחירי אייפון מבוססים מקורות רשמיים. בקטגוריות בודדות (כמו חול לחתולים ובשר קפוא) לא כל המוצרים שרצינו נכנסו למאגר, כי לחלקם לא היה מחיר חי או תמונת מוצר אמיתית באתר המקור - העדפנו לוותר על מוצר בודד מאשר להמציא לו תמונה או מחיר. מאותה סיבה, 10 מוצרים שנשלפו בבלוקים עם שם פגום (טקסט מעורבב שלא היינו יכולים לשחזר בביטחון) הוסרו מהמאגר במקום להיות "מתוקנים" בניחוש.</div>
        <p>בניחוש מחיר, הניקוד עולה ככל שהניחוש שלכם קרוב יותר למחיר האמיתי. בהשוואת מדינות, כל תשובה נכונה שווה ניקוד קבוע. שלוש תשובות טובות ברצף מפעילות מכפיל, שעולה ככל שהרצף מתארך.</p>
      </div>
    `;
  }

  function applyReducedMotion() {
    document.documentElement.classList.toggle("reduced-motion", !!state.settings.reducedMotion);
  }

  function renderSettings() {
    view.innerHTML = `
      <div class="content-page">
        <h2>הגדרות</h2>
        <label class="settings-row" for="motion-toggle">
          <span>הפחתת אנימציה<br><span class="settings-row-note">מכבה את החגיגת הקונפטי ואת אנימציות המסך, גם אם ההגדרה הזו במערכת ההפעלה שלכם כבויה</span></span>
          <span class="toggle"><input type="checkbox" id="motion-toggle" ${state.settings.reducedMotion ? "checked" : ""}><span class="track"></span></span>
        </label>
        <div class="danger-zone">
          <button class="btn btn-error" id="clear-btn">נקו את הנתונים שלי</button>
        </div>
      </div>
    `;
    document.getElementById("motion-toggle").addEventListener("change", e => {
      state.settings.reducedMotion = e.target.checked;
      applyReducedMotion();
      saveState();
    });
    document.getElementById("clear-btn").addEventListener("click", () => {
      const s = state.stats;
      const stakes = s.dailyStreak || s.bestSetScore
        ? ` הרצף הנוכחי (${hebrewDays(s.dailyStreak || 0)}) ושיא הניקוד (${s.bestSetScore.toLocaleString("he-IL")}) יימחקו, וגם הגדרות התצוגה יחזרו לברירת המחדל.`
        : " גם הגדרות התצוגה יחזרו לברירת המחדל.";
      if (confirm("למחוק את כל השיאים והרצף?" + stakes + " אי אפשר לשחזר את זה.")) {
        localStorage.removeItem(STORE_KEY);
        state = loadState();
        applyReducedMotion();
        toast("הנתונים נוקו");
        navigate("#/");
      }
    });
  }

  function renderPrivacy() {
    view.innerHTML = `
      <div class="content-page">
        <h2>מדיניות פרטיות</h2>
        <p>האתר הזה לא דורש הרשמה. ה-streak, השיאים וההיסטוריה שלכם נשמרים רק בדפדפן שלכם (localStorage), ונמחקים אם תנקו אותם דרך ההגדרות.</p>
        <p>מצב VS (נגד יריב אמיתי) שונה: כדי לשבץ אתכם מול שחקן אמיתי, המכשיר שלכם מתחבר לשרת ושולח לו מזהה זמני ואקראי (לא שם אמיתי, לא מידע מזהה) לצורך התאמה בלבד. המזהה הזה לא נשמר לאחר סיום הדו-קרב. שאר האתר (נחשו מחיר, השוואת מדינות, האתגר היומי) לא שולח שום דבר לשום שרת.</p>
        <p>האתר לא משתף כרגע מידע עם אף רשת פרסום. אם וכשיתווספו מודעות, העמוד הזה יתעדכן בהתאם, עם שם הרשת ומה בדיוק היא אוספת.</p>
      </div>
    `;
  }

  // ---------- VS Duel: real player identity ----------
  function getPlayerId() {
    // sessionStorage on purpose, not localStorage: each browser TAB is its own player identity,
    // so two tabs of the same browser can genuinely duel each other during testing/real use,
    // instead of colliding on one shared id (which would silently steal the SSE connection).
    let id = sessionStorage.getItem("kzo_player_id");
    if (!id) { id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("kzo_player_id", id); }
    return id;
  }
  function getPlayerName() {
    let name = sessionStorage.getItem("kzo_player_name");
    if (!name) {
      const adjectives = ["מהיר", "חד", "פיקח", "זריז", "חכם"];
      const n = adjectives[Math.floor(Math.random() * adjectives.length)] + " " + Math.floor(Math.random() * 900 + 100);
      name = "מנחש " + n;
      sessionStorage.setItem("kzo_player_name", name);
    }
    return name;
  }
  const PLAYER_ID = getPlayerId();

  // ---------- VS Duel: client state + SSE ----------
  const vs = { phase: "lobby", es: null, duelId: null, opponentName: null, hp: null, startHp: 6000, roundIndex: 0, totalRounds: 5, product: null, seconds: 15, timerHandle: null, answered: false, lastResult: null, endInfo: null, opponentGuessed: false, sseEverConnected: false };

  function vsCleanupConnection() {
    if (vs.es) { try { vs.es.close(); } catch (e) {} vs.es = null; }
    if (vs.timerHandle) { clearInterval(vs.timerHandle); vs.timerHandle = null; }
  }

  function vsLeave() {
    const body = JSON.stringify({ playerId: PLAYER_ID });
    try { navigator.sendBeacon && navigator.sendBeacon("/api/duel/leave", new Blob([body], { type: "application/json" })); }
    catch (e) {}
    fetch("/api/duel/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
    vsCleanupConnection();
    vs.phase = "lobby"; vs.duelId = null; vs.hp = null; vs.endInfo = null;
  }

  function vsConnectSSE() {
    vsCleanupConnection();
    const es = new EventSource(`/api/duel/stream?playerId=${encodeURIComponent(PLAYER_ID)}`);
    vs.es = es;
    es.addEventListener("open", () => { vs.sseEverConnected = true; });
    es.addEventListener("error", () => {
      if (!vs.sseEverConnected && (vs.phase === "searching" || vs.phase === "lobby")) {
        // A public static deploy (e.g. GitHub Pages) has no VS backend at all: the
        // connection never opens and keeps retrying forever. If it never succeeded
        // even once, treat this as "unavailable" rather than looping silently.
        vsCleanupConnection();
        vs.phase = "unavailable";
        if (location.hash === "#/vs") renderVs();
      } else if (vs.sseEverConnected && vs.phase !== "end" && vs.phase !== "unavailable") {
        // A real connection WAS established and just dropped mid-session (network
        // hiccup, server restart) — a genuinely different case from "no backend at
        // all," worth its own message rather than silently reusing "unavailable."
        vsCleanupConnection();
        vs.phase = "error";
        if (location.hash === "#/vs") renderVs();
      }
    });
    es.addEventListener("matched", e => {
      const data = JSON.parse(e.data);
      vs.duelId = data.duelId; vs.opponentName = data.opponentName; vs.hp = data.hp; vs.startHp = data.startHp;
      vs.phase = "matched";
      if (location.hash === "#/vs") renderVs();
    });
    es.addEventListener("round-start", e => {
      const data = JSON.parse(e.data);
      vs.roundIndex = data.roundIndex; vs.totalRounds = data.totalRounds; vs.product = data.product;
      vs.seconds = data.seconds; vs.hp = data.hp; vs.answered = false; vs.opponentGuessed = false; vs.lastResult = null;
      vs.phase = "round";
      if (location.hash === "#/vs") renderVs();
    });
    es.addEventListener("opponent-guessed", () => {
      vs.opponentGuessed = true;
      const el = document.getElementById("vs-opponent-status");
      if (el) el.textContent = `${vs.opponentName} כבר ניחש!`;
    });
    es.addEventListener("round-result", e => {
      const data = JSON.parse(e.data);
      vs.lastResult = data; vs.hp = data.hp; vs.phase = "round-result";
      if (location.hash === "#/vs") renderVs();
    });
    es.addEventListener("duel-end", e => {
      const data = JSON.parse(e.data);
      vs.endInfo = data; vs.phase = "end";
      vsCleanupConnection();
      if (location.hash === "#/vs") renderVs();
    });
    es.addEventListener("opponent-left", () => {
      vs.endInfo = { winner: PLAYER_ID, hp: vs.hp, names: { [PLAYER_ID]: getPlayerName() }, opponentLeft: true };
      vs.phase = "end";
      vsCleanupConnection();
      if (location.hash === "#/vs") renderVs();
    });
  }

  function vsStartSearch() {
    vs.phase = "searching";
    vs.sseEverConnected = false;
    vsConnectSSE();
    fetch("/api/duel/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: PLAYER_ID, playerName: getPlayerName() })
    }).then(res => {
      if (!res.ok) { vsCleanupConnection(); vs.phase = "unavailable"; renderVs(); }
    }).catch(() => { vsCleanupConnection(); vs.phase = "unavailable"; renderVs(); });
    renderVs();
  }

  function vsSubmitGuess(guess) {
    if (vs.answered) return;
    vs.answered = true;
    fetch("/api/duel/guess", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duelId: vs.duelId, playerId: PLAYER_ID, guess })
    }).catch(() => {});
  }

  function vsHpPct(hp) { return Math.max(0, Math.min(100, (hp / vs.startHp) * 100)); }

  function renderVs() {
    // "matched" is treated as immersive too (tab bar hidden): it's the moment right
    // after a real opponent is found, before rounds start, and a single accidental tap
    // on any tab bar item there used to silently forfeit the live match with no warning.
    const immersivePhases = ["round", "round-result", "matched"];
    setChrome(immersivePhases.includes(vs.phase) ? "round" : "vs");
    if (vs.phase === "lobby") {
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-icon">⚔️</div>
          <h2>VS: נגד יריב אמיתי</h2>
          <p class="vs-honesty">15 שניות לניחוש, 5 סבבים, מי שקרוב יותר פוגע בשני. אתם משוחקים נגד שחקן אמיתי שמחובר עכשיו, לא בוט. אם אין יריב פנוי כרגע, נחכה יחד.</p>
          ${VS_LIKELY_UNAVAILABLE ? `<p class="vs-honesty" style="color:var(--error);">⚠️ מצב זה כנראה לא זמין בגרסה הציבורית הזו של האתר (היא מוגשת בלי שרת חי). אפשר לנסות בכל זאת.</p>` : ""}
          <button class="btn btn-primary" id="vs-search-btn">חפשו יריב</button>
        </div>`;
      document.getElementById("vs-search-btn").addEventListener("click", vsStartSearch);
      return;
    }
    if (vs.phase === "searching") {
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-search-anim"></div>
          <h2>מחפשים יריב אמיתי...</h2>
          <p class="vs-honesty">ברגע שמישהו אחר יפתח VS, תשובצו יחד. לא ממציאים יריב מזויף.</p>
          <button class="btn btn-secondary" id="vs-cancel-btn">ביטול</button>
        </div>`;
      document.getElementById("vs-cancel-btn").addEventListener("click", () => { vsLeave(); renderVs(); });
      return;
    }
    if (vs.phase === "error") {
      view.innerHTML = `<div class="error-state"><p>לא הצלחנו להתחבר לשרת ה-VS.</p><button class="btn btn-primary" id="vs-retry-btn">נסו שוב</button></div>`;
      document.getElementById("vs-retry-btn").addEventListener("click", vsStartSearch);
      return;
    }
    if (vs.phase === "unavailable") {
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-icon">🛠️</div>
          <h2>VS לא זמין בגרסה הציבורית הזו</h2>
          <p class="vs-honesty">מצב VS צריך שרת חי שמתאם בין שני שחקנים בזמן אמת, וגרסת האתר הציבורית הזו מוגשת כאתר סטטי בלבד, בלי שרת כזה. שני מצבי המשחק האחרים (נחשו מחיר, השוואת מדינות) עובדים באתר הזה במלואם.</p>
          <a class="btn btn-primary" href="#/play">שחקו במצבים האחרים</a>
        </div>`;
      return;
    }
    if (vs.phase === "matched") {
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-vs-badge">${getPlayerName()} <span style="color:var(--muted)">VS</span> ${escapeHtml(vs.opponentName)}</div>
          <p class="vs-honesty">נמצא יריב! מתחילים בעוד רגע...</p>
        </div>`;
      return;
    }
    if (vs.phase === "round" || vs.phase === "round-result") {
      const myHp = vs.hp[PLAYER_ID], oppId = Object.keys(vs.hp).find(k => k !== PLAYER_ID), oppHp = vs.hp[oppId];
      const hpRow = `
        <div class="vs-hp-row">
          <div class="vs-player"><div class="name">${getPlayerName()}</div><div class="vs-hp-bar"><div class="vs-hp-fill me ${myHp < vs.startHp * 0.25 ? 'low' : ''}" style="width:${vsHpPct(myHp)}%"></div></div><div class="vs-hp-num mono">${myHp}</div></div>
          <div class="vs-vs-badge">VS</div>
          <div class="vs-player"><div class="name">${escapeHtml(vs.opponentName)}</div><div class="vs-hp-bar"><div class="vs-hp-fill opp ${oppHp < vs.startHp * 0.25 ? 'low' : ''}" style="width:${vsHpPct(oppHp)}%"></div></div><div class="vs-hp-num mono">${oppHp}</div></div>
        </div>`;
      if (vs.phase === "round") {
        view.innerHTML = `
          ${hpRow}
          <p class="vs-round-label">סבב ${vs.roundIndex} מתוך ${vs.totalRounds}</p>
          <div class="product-image-wrap"><img src="${vs.product.image}" alt="${escapeHtml(vs.product.name)}" onerror="this.style.display='none';this.parentElement.classList.add('img-broken')"></div>
          <h3 class="product-name">${escapeHtml(vs.product.name)}</h3>
          <div class="vs-timer mono" id="vs-timer">${vs.seconds}</div>
          <div class="guess-input-row">
            <button class="step-btn" id="vs-step-up">+</button>
            <input type="number" id="vs-guess-input" inputmode="decimal" dir="ltr" value="10" min="0" aria-label="הניחוש שלכם בשקלים">
            <button class="step-btn" id="vs-step-down">−</button>
          </div>
          <div class="btn-row"><button class="btn btn-primary" id="vs-guess-btn">נחשו!</button></div>
          <p class="vs-opponent-status" id="vs-opponent-status">${vs.opponentGuessed ? escapeHtml(vs.opponentName) + " כבר ניחש!" : ""}</p>
        `;
        document.getElementById("vs-step-up").addEventListener("click", () => { const i = document.getElementById("vs-guess-input"); i.value = (parseFloat(i.value) || 0) + 1; });
        document.getElementById("vs-step-down").addEventListener("click", () => { const i = document.getElementById("vs-guess-input"); i.value = Math.max(0, (parseFloat(i.value) || 0) - 1); });
        const submit = () => {
          const val = parseFloat(document.getElementById("vs-guess-input").value) || 0;
          vsSubmitGuess(val);
          document.getElementById("vs-guess-btn").disabled = true;
          document.getElementById("vs-timer").textContent = "נשלח";
        };
        document.getElementById("vs-guess-btn").addEventListener("click", submit);
        let secondsLeft = vs.seconds;
        const roundStartedAt = Date.now();
        clearInterval(vs.timerHandle);
        vs.timerHandle = setInterval(() => {
          secondsLeft = vs.seconds - Math.floor((Date.now() - roundStartedAt) / 1000);
          const el = document.getElementById("vs-timer");
          if (!el) { clearInterval(vs.timerHandle); return; }
          if (vs.answered) return;
          if (secondsLeft <= 0) { el.textContent = "0"; submit(); clearInterval(vs.timerHandle); return; }
          el.textContent = secondsLeft;
          el.classList.toggle("urgent", secondsLeft <= 5);
        }, 250);
      } else {
        const r = vs.lastResult;
        const myGuess = r.guesses[PLAYER_ID], oppGuess = r.guesses[oppId];
        const myDmg = r.damage[oppId] > 0 ? 0 : r.damage[PLAYER_ID];
        const oppDmg = r.damage[PLAYER_ID] > 0 ? 0 : r.damage[oppId];
        view.innerHTML = `
          ${hpRow}
          <p class="vs-round-label">תוצאת סבב ${r.roundIndex}, המחיר האמיתי: ${fmtILS(r.actual)}</p>
          <p class="source-line" style="text-align:center;">לפי ${escapeHtml(r.source)}, נכון ל-${escapeHtml(r.date)}</p>
          <div class="vs-result-row">
            <div class="vs-result-card ${r.damage[oppId] > 0 ? 'winner' : ''}">${getPlayerName()}<br><span class="mono">${myGuess !== null ? fmtILS(myGuess) : 'לא ניחש'}</span>${myDmg ? `<div class="dmg">-${myDmg}</div>` : ""}</div>
            <div class="vs-result-card ${r.damage[PLAYER_ID] > 0 ? 'winner' : ''}">${escapeHtml(vs.opponentName)}<br><span class="mono">${oppGuess !== null ? fmtILS(oppGuess) : 'לא ניחש'}</span>${oppDmg ? `<div class="dmg">-${oppDmg}</div>` : ""}</div>
          </div>
          <p style="text-align:center;color:var(--muted);font-size:13px;">הסבב הבא מתחיל אוטומטית...</p>
        `;
      }
      return;
    }
    if (vs.phase === "end") {
      const info = vs.endInfo;
      const iAmWinner = info.winner === PLAYER_ID;
      const isDraw = info.winner === null;
      const oppId = Object.keys(info.hp || {}).find(k => k !== PLAYER_ID);
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-end-title ${isDraw ? 'draw' : (iAmWinner ? 'win' : 'lose')}">${isDraw ? "תיקו!" : (iAmWinner ? "ניצחתם!" : "הפסדתם")}</div>
          ${info.opponentLeft ? `<p class="vs-honesty">${escapeHtml(vs.opponentName || 'היריב')} עזב את הדו-קרב.</p>` : ""}
          <p class="vs-honesty">${escapeHtml(getPlayerName())}: ${info.hp[PLAYER_ID]} HP${oppId ? ` · ${escapeHtml(vs.opponentName || 'היריב')}: ${info.hp[oppId]} HP` : ""}</p>
          <div class="btn-row">
            <button class="btn btn-primary" id="vs-again-btn">עוד דו-קרב</button>
            <a class="btn btn-secondary" href="#/play">חזרה למשחק הרגיל</a>
          </div>
        </div>`;
      document.getElementById("vs-again-btn").addEventListener("click", () => { vs.phase = "lobby"; vsStartSearch(); });
      return;
    }
  }

  // ---------- Router ----------
  const routes = {
    "#/": { name: "home", render: renderHome },
    "#/play": { name: "play", render: () => renderPlayHub("mixed") },
    "#/play/pick-precision": { name: "play", render: () => renderPlayHub("precision") },
    "#/play/pick-comparison": { name: "play", render: () => renderPlayHub("comparison") },
    "#/play/round": { name: "round", render: renderRoundQuestion },
    "#/play/results": { name: "play", render: renderResults },
    "#/vs": { name: "vs", render: renderVs },
    "#/daily": { name: "daily", render: renderDaily },
    "#/stats": { name: "stats", render: renderStats },
    "#/about": { name: "about", render: renderAbout },
    "#/settings": { name: "settings", render: renderSettings },
    "#/privacy": { name: "privacy", render: renderPrivacy }
  };

  function navigate(hash) {
    if (location.hash !== hash) { location.hash = hash; return; }
    render();
  }

  function render() {
    let hash = location.hash || "#/";
    const route = routes[hash] || routes["#/"];
    if (route.name !== "round" && session && hash !== "#/play/results") session = null;
    if (route.name !== "vs" && (vs.phase !== "lobby")) { vsLeave(); }
    if (route.name !== "vs") setChrome(route.name);
    closeDrawer();
    route.render();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("beforeunload", () => { if (vs.duelId || vs.phase === "searching") vsLeave(); });

  // ---------- Drawer ----------
  const drawer = document.getElementById("drawer");
  const scrim = document.getElementById("drawer-scrim");
  function openDrawer() {
    drawer.hidden = false; scrim.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    overflowBtn.setAttribute("aria-expanded", "true");
    document.getElementById("drawer-close").focus();
  }
  function closeDrawer() {
    drawer.hidden = true; scrim.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    overflowBtn.setAttribute("aria-expanded", "false");
  }
  overflowBtn.addEventListener("click", openDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
  drawer.querySelectorAll(".drawer-link").forEach(a => a.addEventListener("click", closeDrawer));

  // ---------- Init ----------
  applyReducedMotion();
  loadData().then(render);
  if (!location.hash) location.hash = "#/";
  else render();
})();
