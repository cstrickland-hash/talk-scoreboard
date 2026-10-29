(function () {
  const qs = new URLSearchParams(location.search);
  const ADMIN = qs.get("admin") === "1";
  const DATA = qs.get("data") || "data/leaderboard.json";
  const ADMIN_DATA = qs.get("admindata") || "data/tracker_admin.json";
  const stage = document.getElementById("stage");
  const RARITY = { grey: "#b8c0cc", blue: "#3fa9ff", gold: "#ffc83d" };
  const GRADS = [["#6B7463", "#3A453A"], ["#B86A4A", "#4A3A32"], ["#8FA3A0", "#3A453A"], ["#C9A227", "#4A3A32"], ["#7BA87A", "#3A453A"], ["#A86B45", "#2A201C"], ["#B7B0A3", "#4A3A32"], ["#6B7463", "#B86A4A"]];
  let current = null;
  let PHOTO_BY_NAME = {};
  fetch("assets/agents/photos.json?v=16").then(r => r.json()).then(d => {
    PHOTO_BY_NAME = d.photos || {};
    if (current) { renderPodium(current.agents); renderRows(current.agents); renderHands(current, null); }
  }).catch(() => {});
  function photoFor(name) {
    if (!name) return null;
    if (PHOTO_BY_NAME[name]) return PHOTO_BY_NAME[name];
    const n = String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const [k, v] of Object.entries(PHOTO_BY_NAME)) {
      const kk = k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (kk === n) return v;
      const ka = kk.split(" "), na = n.split(" ");
      if (ka[ka.length - 1] === na[na.length - 1] && ka[0] === na[0]) return v;
    }
    return null;
  }
  function withPhoto(a) {
    const src = a.avatar || photoFor(a.name);
    return src ? Object.assign({}, a, { avatar: src }) : a;
  }
  const CROWN = '<svg class="crown" viewBox="0 0 92 64"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset="1" stop-color="#e0a21a"/></linearGradient></defs><path d="M6 54 L2 14 L26 32 L46 4 L66 32 L90 14 L86 54 Z" fill="url(#cg)" stroke="#fff3c0" stroke-width="2.5" stroke-linejoin="round"/><circle cx="2" cy="14" r="5" fill="#fff3c0"/><circle cx="46" cy="4" r="5.5" fill="#fff3c0"/><circle cx="90" cy="14" r="5" fill="#fff3c0"/></svg>';

  // The stage always fills the whole window. It is drawn at a design size of at least 1920x1080
  // and scaled so that size lands exactly on the viewport, so nothing can overflow the page.
  function fit() {
    const vw = document.documentElement.clientWidth || innerWidth, vh = document.documentElement.clientHeight || innerHeight;
    const s = Math.min(vw / 1920, vh / 1080);
    const w = Math.floor(vw / s), h = Math.floor(vh / s);
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    stage.style.setProperty("--H", h);
    stage.style.transform = "scale(" + s + ")";
    stage.style.left = "0px";
    stage.style.top = "0px";
  }
  addEventListener("resize", fit); fit();

  // Full screen — floating button outside the scaled stage
  (function () {
    const btn = document.getElementById("fs-fab");
    if (!btn) return;
    const root = document.documentElement;
    function isFs() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    }
    function canFs() {
      return !!(root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen);
    }
    function sync() {
      const on = isFs();
      btn.textContent = on ? "✕ Exit" : "⛶ Full screen";
      btn.classList.toggle("is-fs", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      fit();
    }
    function enter() {
      const req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
      if (!req) {
        btn.classList.add("unsupported");
        btn.textContent = "Add to Home Screen";
        return;
      }
      // Prefer hiding browser UI; fall back silently if blocked
      const opts = { navigationUI: "hide" };
      Promise.resolve(req.call(root, opts)).catch(function () {
        return Promise.resolve(req.call(root));
      }).catch(function () {
        btn.textContent = "Not available";
        setTimeout(sync, 1800);
      });
    }
    function exit() {
      const x = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (x) x.call(document);
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      isFs() ? exit() : enter();
    });
    ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach(function (ev) {
      document.addEventListener(ev, sync);
    });
    if (!canFs()) btn.classList.add("unsupported");
    sync();
  })();

  // Keep TV / HDMI sticks awake: Screen Wake Lock + silent looping video (+ canvas tick)
  (function () {
    const TV = qs.get("tv") === "1";
    let wakeLock = null;

    async function requestWakeLock() {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        wakeLock = lock;
        lock.addEventListener("release", function () {
          // Browser released it (often on tab hide). Re-acquire when visible again.
          if (document.visibilityState === "visible") requestWakeLock();
        });
      } catch (e) {
        // NotAllowedError until a gesture, or unsupported policy — retry on next gesture.
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") requestWakeLock();
    }
    document.addEventListener("visibilitychange", onVisibility);
    requestWakeLock();
    // Some Chromium sticks need a user gesture before Wake Lock is granted.
    ["pointerdown", "touchstart", "keydown", "click"].forEach(function (ev) {
      document.addEventListener(ev, function () { requestWakeLock(); }, { once: true, passive: true });
    });

    // Near-invisible muted looping video — keeps many HDMI sticks from sleeping.
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.setAttribute("muted", "");
    v.setAttribute("aria-hidden", "true");
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = "auto";
    v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0;z-index:0";
    v.src = "assets/keepawake.webm";
    document.body.appendChild(v);
    function playVid() {
      try {
        const p = v.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    playVid();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") playVid();
    });
    ["pointerdown", "touchstart", "click"].forEach(function (ev) {
      document.addEventListener(ev, playVid, { once: true, passive: true });
    });
    // If the short clip ever ends without looping, restart it.
    v.addEventListener("ended", playVid);
    v.addEventListener("pause", function () {
      if (document.visibilityState === "visible") playVid();
    });

    // Canvas 1px tick — extra signal for devices that ignore silent video alone.
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:1px;bottom:0;z-index:0";
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    let flip = 0;
    setInterval(function () {
      flip ^= 1;
      if (!ctx) return;
      ctx.fillStyle = flip ? "#010101" : "#000000";
      ctx.fillRect(0, 0, 1, 1);
    }, 4000);

    // ?tv=1 — nudge fullscreen (browsers often block without a gesture; retry on first tap).
    if (TV) {
      function tryFs() {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) return;
        const root = document.documentElement;
        const req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
        if (!req) return;
        Promise.resolve(req.call(root, { navigationUI: "hide" })).catch(function () {
          return Promise.resolve(req.call(root));
        }).catch(function () {});
      }
      tryFs();
      ["pointerdown", "touchstart", "click", "keydown"].forEach(function (ev) {
        document.addEventListener(ev, function () { tryFs(); }, { once: true, passive: true });
      });
    }
  })();

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => Number(n).toLocaleString("en-US");
  function short(n) { if (/^harold daniel perea$/i.test(String(n).trim())) n = "Daniel Perea"; const p = String(n).trim().split(/\s+/).filter(w => !/^(jr|sr|ii|iii)\.?$/i.test(w)); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : p[0]; }
  function avatar(a, cls) {
    a = withPhoto(a);
    const g = GRADS[(a.user_id || 0) % GRADS.length];
    const inner = a.avatar ? '<img src="' + esc(a.avatar) + '" alt="" loading="lazy">' : esc(a.initials);
    return '<div class="' + cls + '" style="background:linear-gradient(145deg,' + g[0] + ',' + g[1] + ')">' + inner + "</div>";
  }

  function renderPodium(agents) {
    const order = [agents[1], agents[0], agents[2]];
    const cls = ["p2", "p1", "p3"], place = [2, 1, 3];
    document.getElementById("podium").innerHTML = order.map((a, i) => {
      if (!a) return '<div class="pod ' + cls[i] + ' empty"><div class="av" style="background:#3A453A">?</div><div class="pname">OPEN</div><div class="ppts">0</div><div class="step">' + place[i] + "</div></div>";
      return '<div class="pod ' + cls[i] + '">' + (place[i] === 1 ? CROWN : "") + avatar(a, "av") + '<div class="pname">' + esc(short(a.name)) + '</div><div class="ppts">' + fmt(a.month_points) + ' PTS</div><div class="pwk" style="font-size:.7em;opacity:.7">' + fmt(a.weekly_points) + ' this wk</div><div class="step">' + place[i] + "</div></div>";
    }).join("");
  }

  function renderRows(agents) {
    const rows = agents.map((a, i) =>
      '<div class="row' + (i < 2 ? " top" : "") + '"><div><div class="rk r' + (i + 1) + '">' + String(i + 1).padStart(2, "0") + '</div></div>' +
      '<div class="nm">' + avatar(a, "avs") + "<span>" + esc(short(a.name)) + "</span>" + (a.in_game ? '<em class="in-game" title="In the card game trial">\u25C6</em>' : "") + "</div>" +
      '<div class="num">' + fmt(a.dials) + '</div><div class="num">' + fmt(a.conversations) + '</div><div class="num">' + fmt(a.appointments) + '</div><div class="num">' + a.cards_in_hand + "/" + a.hand_limit + '</div>' +
      '<div class="pts">' + fmt(a.month_points) + '<small style="display:block;font-size:.55em;opacity:.65">' + fmt(a.weekly_points) + " wk</small></div></div>").join("");
    const box = document.getElementById("rows"), keep = box.scrollTop;
    box.innerHTML = rows || '<div class="empty-note">Waiting for the first sync</div>';
    box.scrollTop = keep;
  }

  function slots(a, hand) {
    let h = "";
    for (let i = 0; i < a.hand_limit; i++) {
      if (i < a.cards_in_hand) {
        if (ADMIN && hand && hand[i]) {
          const c = RARITY[hand[i].rarity];
          h += '<div class="slot face" title="' + esc(hand[i].name) + '" style="--c:' + c + ";background-image:url(cards/" + hand[i].card_key + '.png)"></div>';
        } else h += '<div class="slot back"></div>';
      } else h += '<div class="slot empty"></div>';
    }
    return h;
  }

  function renderHands(d, admin) {
    const el = document.getElementById("hands");
    const players = d.agents.some(a => a.in_game) ? d.agents.filter(a => a.in_game) : d.agents;
    el.className = "cols2";
    document.body.classList.toggle("many", d.agents.length > 6);
    el.innerHTML = players.map(a => {
      const pct = a.next_draw_at ? Math.max(4, Math.min(100, 100 * a.month_points / a.next_draw_at)) : 0;
      return '<div class="hand"><div class="who">' + avatar(a, "avs") + "<div><b>" + esc(a.name) + "</b><small>" + a.cards_in_hand + " OF " + a.hand_limit + " CARDS" + (a.example_cards ? " + " + a.example_cards + " EXAMPLE" : "") + (a.cards_pending ? " +" + a.cards_pending + " WAITING" : "") + "</small></div></div>" +
        '<div class="slots">' + slots(a, admin && admin.hands && admin.hands[String(a.user_id)]) + '</div><div class="prog"><div class="t">' + fmt(a.to_next_draw) + ' pts to next draw</div><div class="bar"><i style="width:' + pct + '%"></i></div></div></div>';
    }).join("") || '<div class="none">No players yet</div>';
  }

  const STATUS = { pending: ["wait", "PENDING"], pending_reaction: ["wait", "PENDING"], active: ["live", "LIVE"], completed: ["done", "DONE"], failed: ["done", "SURVIVED"], blocked: ["block", "BLOCKED"], reversed: ["block", "REVERSED"], expired: ["lapse", "LAPSED"] };
  function ago(ts) {
    const m = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 60000));
    if (m < 60) return m + "m ago";
    if (m < 1440) return Math.round(m / 60) + "h ago";
    return Math.round(m / 1440) + "d ago";
  }
  function renderPlays(d) {
    const el = document.getElementById("plays");
    const rows = d.plays.slice(0, 4).map(p => {
      const st = STATUS[p.status] || ["lapse", p.status.toUpperCase()];
      const c = RARITY[p.rarity] || "#b8c0cc";
      return '<div class="log"><div class="thumb" style="--c:' + c + ";background-image:url(cards/" + p.card_key + '.png)"></div><div class="tx"><b>' + esc(p.player.split(" ")[0]) + "</b> played <b>" + esc(p.card) + "</b>" +
        (p.target ? " on <b>" + esc(p.target.split(" ")[0]) + "</b>" : "") + (p.demo ? '<span class="demotag">DEMO</span>' : "") + (p.result ? '<span class="res">' + esc(p.result) + "</span>" : "") + '</div><span class="st ' + st[0] + '">' + st[1] + "</span><time>" + ago(p.ts) + "</time></div>";
    }).join("");
    el.innerHTML = '<div class="rulenote">Skill cards played resolve 30 minutes after being put in play.</div>' + (rows || '<div class="none">No cards played yet. ' + esc(d.plays_note || "") + "</div>");
  }

  function countdown(d) {
    const t = Date.parse(d.week_end) - Date.now();
    const el = document.getElementById("countdown");
    if (isNaN(t)) { el.textContent = "00:00:00"; return; }
    const s = Math.max(0, Math.floor(t / 1000)), dd = Math.floor(s / 86400);
    const hh = String(Math.floor(s % 86400 / 3600)).padStart(2, "0"), mm = String(Math.floor(s % 3600 / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
    el.textContent = (dd ? dd + "d " : "") + hh + ":" + mm + ":" + ss;
  }

  // slow auto scroll for the TV, manual scrolling pauses it for 25 seconds
  (function () {
    const box = document.getElementById("rows");
    let pausedUntil = 0, hold = Date.now() + 4000;
    ["wheel", "touchstart", "pointerdown", "keydown"].forEach(ev => box.addEventListener(ev, () => { pausedUntil = Date.now() + 25000; }, { passive: true }));
    let acc = 0;
    setInterval(() => {
      const now = Date.now(), max = box.scrollHeight - box.clientHeight;
      if (max <= 4 || now < pausedUntil || now < hold) return;
      if (box.scrollTop >= max - 1) { hold = now + 4000; setTimeout(() => { box.scrollTop = 0; }, 4000); return; }
      acc += 0.7; if (acc >= 1) { box.scrollTop += Math.floor(acc); acc -= Math.floor(acc); }
    }, 40);
  })();

  // collapsible panels (remembered in the browser)
  function collapsible(boxId, togId) {
    const box = document.getElementById(boxId), tg = document.getElementById(togId), key = "collapsed:" + boxId;
    const saved = localStorage.getItem(key);
    if (saved !== null) box.classList.toggle("collapsed", saved === "1");
    const flip = () => { box.classList.toggle("collapsed"); localStorage.setItem(key, box.classList.contains("collapsed") ? "1" : "0"); };
    tg.addEventListener("click", flip);
    tg.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  }
  collapsible("tracker", "tracker-toggle"); collapsible("playbox", "play-toggle"); collapsible("feedbox", "feed-toggle");

  // live activity feed
  const seen = new Set(); let firstFeed = true;
  const hst = ts => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Honolulu" });
  const hstDay = ts => new Date(ts).toLocaleDateString("en-US", { weekday: "short", timeZone: "Pacific/Honolulu" });
  const todayHst = () => new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: "Pacific/Honolulu" });
  const VERB = { escrow: "just opened escrow", call: "just logged a call", conversation: "just had a conversation", appointment: "just set an appointment", play: "just played a card" };
  async function loadFeed() {
    try {
      const d = await (await fetch("data/activity.json?t=" + Date.now())).json();
      const el = document.getElementById("feed"), top = el.scrollTop;
      el.innerHTML = d.events.map(e => {
        const id = e.ts + e.name + e.kind, isNew = !firstFeed && !seen.has(id); seen.add(id);
        const extra = e.kind === "conversation" && e.minutes ? " (" + e.minutes + " min)" : "";
        const day = hstDay(e.ts) === todayHst() ? "" : hstDay(e.ts) + " ";
        return '<div class="fe ' + e.kind + (isNew ? " new" : "") + '"><span class="ic ' + e.kind + '"></span><div class="tx"><b>' + esc(e.name) + "</b> <span>" + (e.kind === "play" && e.text ? "just " + esc(e.text) : VERB[e.kind] + extra) + "</span></div><time>" + day + hst(e.ts) + " HST</time></div>";
      }).join("") || '<div class="none">No activity yet</div>';
      el.scrollTop = top; firstFeed = false;
      document.getElementById("feed-sub").textContent = "UPDATED " + hst(d.generated_at);
    } catch (e) {}
  }
  loadFeed(); setInterval(loadFeed, 30000);

  /* current hoisted for photo reload */
  async function load() {
    try {
      const d = await (await fetch(DATA + "?t=" + Date.now())).json();
      let admin = null;
      if (ADMIN) { try { admin = await (await fetch(ADMIN_DATA + "?t=" + Date.now())).json(); } catch (e) {} }
      current = d;
      document.getElementById("example-chip").hidden = !d.example;
      document.getElementById("live-chip").hidden = !d.live;
      if (d.title) { document.getElementById("title").textContent = d.title.toUpperCase(); document.title = d.title + " | Live Leaderboard"; }
      document.getElementById("trial-chip").hidden = d.mode !== "trial";
      document.getElementById("subtitle").textContent = (d.subtitle || "WEEKLY SPRINT").toUpperCase();
      var _age = (Date.now() - new Date(d.generated_at).getTime()) / 60000;
      document.getElementById("synced").textContent = "LAST SYNC " + new Date(d.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Honolulu" }) + " HST" + (_age > 60 ? " (UPDATING)" : "");
      renderPodium(d.agents); renderRows(d.agents); renderHands(d, admin); renderPlays(d);
    } catch (e) {
      if (!current) document.getElementById("synced").textContent = "WAITING FOR DATA"; // keep showing the last good board on a failed refresh
    }
  }
  setInterval(() => current && countdown(current), 1000);
  load(); setInterval(load, 30000);
  /* TV: reload the page every 6 hours (only when online) so layout fixes land without anyone touching the TV */
  setInterval(function () { if (navigator.onLine !== false) fetch("index.html?t=" + Date.now(), { cache: "no-store" }).then(function (r) { if (r.ok) location.reload(); }).catch(function () {}); }, 6 * 3600 * 1000);
  setInterval(() => current && countdown(current), 1000);
  window.__ready = new Promise(r => setTimeout(r, 600));
})();
