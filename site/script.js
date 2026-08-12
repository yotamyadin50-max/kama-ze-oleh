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
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
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
  function fmtILS(n) { return "₪" + (Math.round(n * 100) / 100).toLocaleString("he-IL"); }
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
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickTwoDistinct(arr, rng) {
    rng = rng || Math.random;
    const i = Math.floor(rng() * arr.length);
    let j = Math.floor(rng() * arr.length);
    while (j === i) j = Math.floor(rng() * arr.length);
    return [arr[i], arr[j]];
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
    let mult = 1;
    if (session.streak >= 10) mult = 2.0;
    else if (session.streak >= 6) mult = 1.5;
    else if (session.streak >= 3) mult = 1.2;
    const score = Math.round(base * mult);
    if (isGood) session.streak += 1; else session.streak = 0;
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
    session = {
      track, roundCount: plan.length, plan, index: 0, score: 0, streak: 0,
      isDaily: !!isDaily, results: [],
      precisionCount: track === "mixed" ? plan.filter(t => t === "precision").length : null
    };
    navigate("#/play/round");
  }

  function currentRoundData(rngSeed) {
    const type = session.plan[session.index];
    const rng = rngSeed ? seededRandom(rngSeed + "-" + session.index) : Math.random;
    if (type === "precision") {
      const idx = Math.floor(rng() * PRODUCTS.length);
      return { type, product: PRODUCTS[idx] };
    } else {
      const itemIdx = Math.floor(rng() * COUNTRIES.items.length);
      const item = COUNTRIES.items[itemIdx];
      const [a, b] = pickTwoDistinct(item.countries, rng);
      const swap = rng() < 0.5;
      return { type, item, countryA: swap ? b : a, countryB: swap ? a : b };
    }
  }

  // ---------- Rendering ----------
  const view = document.getElementById("view");
  const tabbar = document.getElementById("tabbar");
  const overflowBtn = document.getElementById("overflow-btn");

  function setChrome(routeName) {
    const immersive = routeName === "round";
    tabbar.classList.toggle("hidden", immersive);
    overflowBtn.classList.toggle("hidden", immersive);
    document.querySelectorAll(".tab-item").forEach(el => {
      el.classList.toggle("active", el.dataset.tab === routeName);
    });
    view.classList.toggle("immersive", immersive);
  }

  function renderHome() {
    const dailyDone = state.stats.lastDailyDateISO === todayISO();
    view.innerHTML = `
      <section class="hero">
        <h1>כמה זה עולה, באמת?</h1>
        <p class="subhead">לא הערכות, מחירים אמיתיים. מהמחירונים שרשתות השיווק חייבות בחוק לפרסם, ומדדים כלכליים אמיתיים בין מדינות. אתם מנחשים, אנחנו חושפים.</p>
        <a href="#/play" class="btn btn-primary" id="home-play-btn">שחקו עכשיו</a>
        <p class="trust-line">כל מחיר כאן אמיתי, עם מקור ותאריך.</p>
        ${!dailyDone ? `<div class="daily-teaser">🔥 האתגר של היום מחכה</div>` : ""}
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
          <strong>VS: נגד יריב אמיתי</strong>
          <span class="desc">15 שניות לניחוש, נגד מישהו שמחובר עכשיו. בלי רובוטים.</span>
        </a>
      </div>
      <footer class="page-footer">
        <a href="#/about">מאיפה המחירים?</a> · <a href="#/privacy">מדיניות פרטיות</a>
      </footer>
    `;
  }

  function renderPlayHub(preselectTrack) {
    let selectedTrack = preselectTrack || "mixed";
    let selectedLen = 10;
    let precisionCount = Math.round(selectedLen / 2);

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
        el.addEventListener("click", () => { selectedTrack = el.dataset.track; draw(); });
        el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectedTrack = el.dataset.track; draw(); } });
      });
      view.querySelectorAll(".pill").forEach(el => el.addEventListener("click", () => {
        selectedLen = parseInt(el.dataset.len, 10);
        precisionCount = Math.round(selectedLen / 2);
        draw();
      }));
      const mixUp = document.getElementById("mix-up");
      const mixDown = document.getElementById("mix-down");
      if (mixUp) mixUp.addEventListener("click", () => { precisionCount = Math.min(selectedLen, precisionCount + 1); draw(); });
      if (mixDown) mixDown.addEventListener("click", () => { precisionCount = Math.max(0, precisionCount - 1); draw(); });
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
    if (dataLoadError) { renderRoundError(); return; }
    if (!PRODUCTS.length) { renderRoundLoading(); loadData().then(() => renderRoundQuestion()); return; }
    const seed = session.isDaily ? "kzo-daily-" + todayISO() : null;
    const rd = currentRoundData(seed);
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
          <div class="product-image-wrap"><img src="${p.image}" alt="${escapeHtml(p.name)}"></div>
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
    session = null;
    navigate("#/play");
  }

  function revealPrecision(product) {
    const guess = parseFloat(document.getElementById("guess-input").value) || 0;
    const actual = product.price_ils;
    const r = computeAccuracyTier(guess, actual);
    const isGood = r.tier <= 2;
    const { score, mult } = applyStreakMultiplier(r.base, isGood);
    session.score += score;
    session.results.push({ type: "precision", name: product.name, guess, actual, errorPct: r.errorPct, tier: r.tier, score, product });
    state.stats.totalRounds++; state.stats.precisionRounds++;
    if (isGood) state.stats.closeGuesses++;
    if (!state.stats.bestGuessEver || r.errorPct < state.stats.bestGuessEver.errorPct) {
      state.stats.bestGuessEver = { name: product.name, errorPct: r.errorPct };
    }
    if (!state.stats.mostSurprising || r.errorPct > state.stats.mostSurprising.errorPct) {
      state.stats.mostSurprising = { name: product.name, guess, actual, errorPct: r.errorPct };
    }
    saveState();

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
    if (r.tier === 1 || (isGood && session.streak >= 3)) launchConfetti(24);
    animateStreakUpdate();
    document.getElementById("next-btn").addEventListener("click", nextRound);
  }

  function revealComparison(rd, chosenSide) {
    const a = rd.countryA, b = rd.countryB;
    const correctSide = a.price_usd > b.price_usd ? "a" : "b";
    const correct = chosenSide === correctSide;
    const base = 500;
    const { score, mult } = applyStreakMultiplier(correct ? base : 0, correct);
    session.score += score;
    session.results.push({ type: "comparison", name: rd.item.item_name + ": " + a.country_he + " / " + b.country_he, correct, score });
    state.stats.totalRounds++; state.stats.comparisonRounds++;
    if (correct) state.stats.correctComparisons++;
    saveState();

    const streakEl = document.getElementById("streak-indicator");
    if (!correct) streakEl.classList.add("broken");

    document.querySelectorAll(".country-card").forEach(el => {
      const side = el.dataset.side;
      const c = side === "a" ? a : b;
      const hasLocal = c.local_currency && c.local_currency !== "USD";
      const priceLine = hasLocal
        ? `${c.local_price.toLocaleString("he-IL")} ${c.local_currency} · $${c.price_usd}`
        : `$${c.price_usd.toLocaleString("he-IL")}`;
      el.innerHTML += `<div class="mono" style="margin-top:8px;font-weight:700;">${priceLine}</div>`;
      if (side === correctSide) el.style.boxShadow = "0 0 0 3px var(--success)";
      else if (side === chosenSide) el.style.boxShadow = "0 0 0 3px var(--error)";
    });

    const stage = document.querySelector(".round-stage");
    stage.insertAdjacentHTML("beforeend", `
      <div class="reveal-panel">
        <span class="closeness-tag ${correct ? 'tier1' : 'tier4'}">${correct ? "נכון!" : "הפעם לא"}</span>
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
    const best = precisionResults.length ? precisionResults.reduce((a, b) => (a.errorPct <= b.errorPct ? a : b)) : null;
    const surprising = precisionResults.length ? precisionResults.slice().sort((a, b) => b.errorPct - a.errorPct)[0] : null;

    const shareGrid = session.results.map(r => {
      if (r.type === "precision") return `<div class="share-cell tier${r.tier}"></div>`;
      return `<div class="share-cell ${r.correct ? 'correct' : 'wrong'}"></div>`;
    }).join("");

    const shareText = session.isDaily
      ? `כמה זה עולה, יום ${dailyDayNumber()}, רצף של ${state.stats.dailyStreak} ימים, ${session.score.toLocaleString("he-IL")} נקודות. תנסו גם אתם: `
      : `ניחשתי וקיבלתי ${session.score.toLocaleString("he-IL")} נקודות ב"כמה זה עולה". תנסו גם אתם: `;

    view.innerHTML = `
      <h2 style="text-align:center;">ככה שיחקתם</h2>
      ${isNewHigh && oldBest > 0 ? `<div style="text-align:center;"><span class="new-high-badge">שיא חדש! ${oldBest.toLocaleString("he-IL")} → ${session.score.toLocaleString("he-IL")}</span></div>` : ""}
      <div class="results-score"><div class="big-score mono">${session.score.toLocaleString("he-IL")}</div></div>
      ${best ? `<div class="highlight-card">${best.product ? `<img src="${best.product.image}" alt="">` : ""}<div>הניחוש הכי מדויק שלכם: <strong>${escapeHtml(best.name)}</strong>${best.errorPct !== undefined ? `, טעיתם ב-${best.errorPct}% בלבד` : ""}</div></div>` : ""}
      ${surprising ? `<div class="highlight-card">${surprising.product ? `<img src="${surprising.product.image}" alt="">` : ""}<div>הכי הפתיע אתכם: <strong>${escapeHtml(surprising.name)}</strong>. ניחשתם ${fmtILS(surprising.guess)}, המחיר האמיתי היה ${fmtILS(surprising.actual)}</div></div>` : ""}
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
      else { await navigator.clipboard.writeText(text); toast("הועתק ללוח"); }
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
      <p class="daily-streak-label">${state.stats.dailyStreak ? "רצף של " + state.stats.dailyStreak + " ימים" : "שחקו כל יום, תבנו רצף. פשוט כמו זה."}</p>
      <div class="week-board">${week.map(w => `<div class="week-day ${w.played ? 'played' : ''}">${w.played ? '✓' : ''}</div>`).join("")}</div>
      <div class="btn-row">
        ${done
        ? `<p style="text-align:center;color:var(--muted);">שיחקתם היום. חזרו מחר לרצף הבא.</p>`
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
      ${s.mostSurprising ? `<div class="highlight-card"><div>הניחוש שהכי הפתיע אתכם: <strong>${escapeHtml(s.mostSurprising.name)}</strong>.</div></div>` : ""}
    `;
  }

  function renderAbout() {
    view.innerHTML = `
      <div class="content-page">
        <h2>מאיפה המחירים באמת מגיעים</h2>
        <p>המחירים כאן לא מומצאים ולא מוערכים. רוב המוצרים הישראליים נאספו ישירות מהחנות המקוונת של שופרסל, הרשת הגדולה בישראל, שמחויבת בחוק (תקנות קידום התחרות בענף המזון (שקיפות מחירים), תשע"ה-2014) לפרסם את המחיר האמיתי של כל מוצר שהיא מוכרת. חלק מהמוצרים גם הצטלבו מול השוואות מחירים בין-רשתיות. אנחנו לא ממציאים כלום, אנחנו קוראים את מה שהרשתות כבר חייבות לפרסם. הקטלוג משתרע על פני כל המחלקות שיש לשופרסל אונליין: מזון וטרי, פארם וקוסמטיקה, תינוקות וחיות מחמד, ומוצרי בית - למעלה מ-2,500 מוצרים אמיתיים. <strong>גם התמונות של המוצרים האלה אמיתיות</strong>: תמונת המוצר עצמו כפי שהיא מופיעה בחנות המקוונת של שופרסל, לא תמונת מלאי כללית.</p>
        <p>השוואות המדינות מבוססות על חמישה פריטים אמיתיים: מדד ביג מק של The Economist (19 מדינות), מחירי חלב, בנזין וקפוצ'ינו ממאגר Numbeo (100 מדינות לכל פריט!), ומדד מחירי אייפון מבוסס נתוני Deutsche Bank ומחירי חנויות Apple רשמיות. כל סבב בוחר פריט אקראי וזוג מדינות אקראי בתוכו, בסך הכל למעלה מ-15,000 צירופים אפשריים, כדי שהמשחק לא יחזור על עצמו. כל סבב מציג בדיוק לפי איזה מקור ותאריך.</p>
        <ul class="source-list">
          <li><a href="https://www.nevo.co.il/law_html/law00/135376.htm" target="_blank" rel="noopener">תקנות שקיפות מחירים (נבו)</a></li>
          <li><a href="https://www.consumers.org.il/item/transparency_price" target="_blank" rel="noopener">רשימת פורטלי הרשתות (המועצה לצרכנות)</a></li>
          <li><a href="https://github.com/TheEconomist/big-mac-data" target="_blank" rel="noopener">Big Mac Index, The Economist</a></li>
          <li><a href="https://www.numbeo.com/cost-of-living/" target="_blank" rel="noopener">Numbeo Cost of Living Database (חלב, בנזין)</a></li>
        </ul>
        <div class="honesty-box">הרשתות מעדכנות את המחירים אצלן תוך שעה מכל שינוי. אנחנו מרעננים את מאגר המשחק מעת לעת, לא בזמן אמת, כך שמחיר בודד עלול להשתנות אצל הרשת בין הבדיקה למשחק שלכם. ליד כל מחיר מוצג התאריך שבו הוא נבדק, כדי שתדעו בדיוק מה אתם רואים. הקטלוג כולל למעלה מ-2,500 מוצרים אמיתיים, ולכל אחד מהם תמונת מוצר משלו: 2,519 מהם משתמשים בתמונת המוצר האמיתית כפי שהיא מופיעה בחנות המקוונת של שופרסל (לא תמונת מלאי כללית, לא משותפת בין מוצרים), ו-21 המוצרים המקוריים (שהמחיר שלהם הגיע ממקורות אחרים כמו מחירים בפיקוח ממשלתי או אתרי השוואת מחירים) עדיין משתמשים בתמונת מלאי אמיתית ומאומתת מ-Unsplash. מחירי חלב, בנזין וקפוצ'ינו בין מדינות מבוססים על Numbeo, מאגר מבוסס דיווחי משתמשים (לא סטטיסטיקה ממשלתית רשמית), כך שהדיוק למדינות עם פחות דיווחים עלול להיות נמוך יותר. מדד ביג מק ומחירי אייפון מבוססים מקורות רשמיים. בקטגוריות בודדות (כמו חול לחתולים ובשר קפוא) לא כל המוצרים שרצינו נכנסו למאגר, כי לחלקם לא היה מחיר חי או תמונת מוצר אמיתית באתר המקור - העדפנו לוותר על מוצר בודד מאשר להמציא לו תמונה או מחיר.</div>
        <p>בניחוש מחיר, הניקוד עולה ככל שהניחוש שלכם קרוב יותר למחיר האמיתי. בהשוואת מדינות, כל תשובה נכונה שווה ניקוד קבוע. שלוש תשובות טובות ברצף מפעילות מכפיל, שעולה ככל שהרצף מתארך.</p>
      </div>
    `;
  }

  function renderSettings() {
    view.innerHTML = `
      <div class="content-page">
        <h2>הגדרות</h2>
        <div class="settings-row"><span>צלילים</span><label class="toggle"><input type="checkbox" id="sound-toggle" ${state.settings.sound ? "checked" : ""}><span class="track"></span></label></div>
        <div class="settings-row"><span>הפחתת אנימציה</span><label class="toggle"><input type="checkbox" id="motion-toggle" ${state.settings.reducedMotion ? "checked" : ""}><span class="track"></span></label></div>
        <div class="danger-zone">
          <button class="btn btn-error" id="clear-btn">נקו את הנתונים שלי</button>
        </div>
      </div>
    `;
    document.getElementById("sound-toggle").addEventListener("change", e => { state.settings.sound = e.target.checked; saveState(); });
    document.getElementById("motion-toggle").addEventListener("change", e => { state.settings.reducedMotion = e.target.checked; saveState(); });
    document.getElementById("clear-btn").addEventListener("click", () => {
      if (confirm("למחוק את כל השיאים והרצף? אי אפשר לשחזר את זה.")) {
        localStorage.removeItem(STORE_KEY);
        state = loadState();
        toast("הנתונים נוקו");
        navigate("#/");
      }
    });
  }

  function renderPrivacy() {
    view.innerHTML = `
      <div class="content-page">
        <h2>מדיניות פרטיות</h2>
        <p>האתר הזה לא דורש הרשמה ולא שומר עליכם שום דבר בשרת. ה-streak, השיאים וההיסטוריה שלכם נשמרים רק בדפדפן שלכם (localStorage), ונמחקים אם תנקו אותם דרך ההגדרות.</p>
        <p>האתר לא משתף כרגע מידע עם אף רשת פרסום. אם וכשיתווספו מודעות, העמוד הזה יתעדכן בהתאם, עם שם הרשת ומה בדיוק היא אוספת.</p>
        <p>ניתן ליצור קשר דרך פרטי הבעלים של האתר.</p>
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
  const vs = { phase: "lobby", es: null, duelId: null, opponentName: null, hp: null, startHp: 6000, roundIndex: 0, totalRounds: 5, product: null, seconds: 15, timerHandle: null, answered: false, lastResult: null, endInfo: null, opponentGuessed: false };

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
    vsConnectSSE();
    fetch("/api/duel/join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: PLAYER_ID, playerName: getPlayerName() })
    }).catch(() => { vs.phase = "error"; renderVs(); });
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
    setChrome(vs.phase === "round" || vs.phase === "round-result" ? "round" : "vs");
    if (vs.phase === "lobby") {
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-icon">⚔️</div>
          <h2>VS: נגד יריב אמיתי</h2>
          <p class="vs-honesty">15 שניות לניחוש, 5 סבבים, מי שקרוב יותר פוגע בשני. אתם משוחקים נגד שחקן אמיתי שמחובר עכשיו, לא בוט. אם אין יריב פנוי כרגע, נחכה יחד.</p>
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
          <div class="product-image-wrap"><img src="${vs.product.image}" alt="${escapeHtml(vs.product.name)}"></div>
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
      view.innerHTML = `
        <div class="vs-hero">
          <div class="vs-end-title ${isDraw ? 'draw' : (iAmWinner ? 'win' : 'lose')}">${isDraw ? "תיקו!" : (iAmWinner ? "ניצחתם!" : "הפסדתם")}</div>
          ${info.opponentLeft ? `<p class="vs-honesty">${escapeHtml(vs.opponentName || 'היריב')} עזב את הדו-קרב.</p>` : ""}
          <p class="vs-honesty">${escapeHtml(getPlayerName())}: ${info.hp[PLAYER_ID]} HP</p>
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
  if (state.settings.reducedMotion) document.documentElement.style.setProperty("--reduced", "1");
  loadData().then(render);
  if (!location.hash) location.hash = "#/";
  else render();
})();
