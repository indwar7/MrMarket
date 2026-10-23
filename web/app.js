
const view = document.getElementById("view");

/* ---------------- API ---------------- */
const API = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:8080" : "https://mrmarket-api.vercel.app";
const token = () => { try { return localStorage.getItem("mm_token"); } catch { return null; } };
const me = () => { try { return JSON.parse(localStorage.getItem("mm_user")) ?? {}; } catch { return {}; } };
const initials = (name = "") => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "MM";
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
  let res;
  try { res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
  catch (e) { throw new Error(e.name === "AbortError" ? "Server is slow to respond. Please retry." : "Cannot reach the server. Check your connection."); }
  finally { clearTimeout(timer); }
  let data = null; try { data = await res.json(); } catch { /* no body */ }
  if (res.status === 401 && token()) { setAuthed(false); acct = emptyAccount(); }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
async function downloadItem(kind, id, btn) {
  if (needLogin()) return;
  const label = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
  try {
    const res = await fetch(`${API}/api/downloads/${kind}/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) { let msg = `Download failed (${res.status})`; try { msg = (await res.json()).error || msg; } catch { /* no body */ } throw new Error(msg); }
    const name = (res.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || `${id}.zip`;
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Downloading ${name}`);
  } catch (e) { toast(e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}
const dlBtn = (kind, id, label = "Download", extra = "") => `<button class="btn ${extra}" data-download="${kind}:${id}">${esc(label)}</button>`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso = "", monthYear = false) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return monthYear ? `${MONTHS[+m[2] - 1]} ${m[1]}` : `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}
const fmtTime = (iso = "") => (String(iso).match(/\d{2}:\d{2}(:\d{2})?/) || [""])[0];
const loadingHTML = `<div class="empty" style="margin:80px auto"><b style="color:var(--text)">Loading…</b></div>`;
const errorHTML = (e) => `<div class="empty" style="margin:80px auto"><b style="color:var(--text)">Could not load</b>${esc(e.message)}<button class="btn btn-small" onclick="location.reload()">Retry</button></div>`;

/* catalog comes from the API; the literals below are the offline fallback */
async function loadCatalog() {
  const [courses, live, inds, strats, brokers, mentors, scripts] = await Promise.all(
    ["courses", "live", "indicators", "strategies", "brokers", "mentors", "scripts"].map((k) => api(`/api/catalog/${k}`)));
  SCRIPTS = scripts.map((x) => ({ id: x.id, t: x.title, cat: x.category, status: x.status, price: x.price, ver: x.version, desc: x.description, req: x.requirements, tags: x.tags ?? [] }));
  COURSES = courses.map((c) => ({ id: c.id, t: c.title, by: c.author, lvl: c.level, lessons: c.lessons, dur: c.duration, price: c.price, rating: c.rating, students: c.students, hue: c.hue, desc: c.description, disclaimer: c.disclaimer }));
  LIVE = live.map((l) => ({ id: l.id, d: l.day, m: l.month, t: l.title, by: l.author, time: l.time, len: l.length, seats: l.seats, kind: l.kind, live: l.is_live }));
  INDICATORS = inds.map((x) => ({ id: x.id, t: x.title, cat: x.category, plat: x.platform, desc: x.description, price: x.price, rating: x.rating, subs: x.subs, kind: x.kind, n: x.number, ver: x.version, plots: x.plots ?? [], inputs: x.inputs ?? [], pair: x.pair_strategy_id }));
  STRATS = strats.map((s) => ({ id: s.id, t: s.title, sym: s.symbol, tf: s.timeframes || s.timeframe, style: s.style, risk: s.risk, ret: s.return_12m, dd: s.max_drawdown, win: s.win_rate, pf: s.profit_factor, trades: s.trades, min: s.min_capital, price: s.price, subs: s.subs, seed: s.seed, by: s.author, n: s.number, ver: s.version, cat: s.category || s.style, desc: s.description, inputs: s.inputs ?? [], pair: s.pair_indicator_id }));
  BROKERS = brokers.map((b) => ({ id: b.id, n: b.name, c: b.color, reg: b.regulation, spread: b.spread, min: b.min_deposit }));
  MENTORS = mentors.map((m) => ({ id: m.id, n: m.name, r: m.role, i: m.initials }));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v, sign = false) => `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v, sign = true) => `${sign && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const cls = (v) => (v >= 0 ? "up" : "down");

/* seeded random so mock charts look the same on every visit */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function curve(seed, n = 60, drift = 0.6, vol = 2.4) {
  const r = rng(seed); let v = 100; const out = [v];
  for (let i = 1; i < n; i++) { v += drift + (r() - 0.5) * vol * 2; out.push(v); }
  return out;
}

function sparkSVG(data, { h = 64, fill = true, color } = {}) {
  const w = 300, min = Math.min(...data), max = Math.max(...data), sp = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / sp) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const c = color ?? (data.at(-1) >= data[0] ? "var(--up)" : "var(--down)");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    ${fill ? `<path d="${d}L${w},${h}L0,${h}Z" fill="url(#${id})"/>` : ""}
    <path d="${d}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function chartSVG(data, { h = 300, labels = [], prefix = "$" } = {}) {
  const w = 900, padL = 56, padB = 28, padT = 12, min = Math.min(...data), max = Math.max(...data), sp = max - min || 1;
  const X = (i) => padL + (i / (data.length - 1)) * (w - padL - 8);
  const Y = (v) => padT + (1 - (v - min) / sp) * (h - padT - padB);
  const d = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + sp * f, y = Y(v);
    return `<line x1="${padL}" x2="${w}" y1="${y}" y2="${y}" stroke="#ececec"/><text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#8a8a8a">${prefix}${Math.round(v).toLocaleString()}</text>`;
  }).join("");
  const xl = labels.map((l, k) => `<text x="${X(Math.round((k / (labels.length - 1)) * (data.length - 1)))}" y="${h - 6}" text-anchor="middle" font-size="12" fill="#8a8a8a">${l}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Equity curve">
    <defs><linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f07c12" stop-opacity=".22"/><stop offset="1" stop-color="#f07c12" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xl}<path d="${d}L${X(data.length - 1)},${h - padB}L${padL},${h - padB}Z" fill="url(#eqfill)"/>
    <path d="${d}" fill="none" stroke="#f07c12" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

/* ---------------- data ---------------- */
let COURSES = [
  { id: "price-action", t: "Price Action Mastery", by: "Aseem Singhal", lvl: "Beginner", lessons: 42, dur: "9h 20m", price: 49, rating: 4.9, students: 12840, prog: 64, hue: 24 },
  { id: "mt5-basics", t: "MT5 from Zero to Live", by: "Rohit Mehra", lvl: "Beginner", lessons: 28, dur: "5h 10m", price: 0, rating: 4.8, students: 20113, prog: 100, hue: 210 },
  { id: "risk", t: "Risk Management & Position Sizing", by: "Aseem Singhal", lvl: "Intermediate", lessons: 18, dur: "3h 45m", price: 39, rating: 4.9, students: 8402, prog: 20, hue: 150 },
  { id: "smc", t: "Smart Money Concepts", by: "Kavya Iyer", lvl: "Intermediate", lessons: 36, dur: "8h 05m", price: 79, rating: 4.7, students: 6120, prog: 0, hue: 280 },
  { id: "algo-mql5", t: "Build Your First EA in MQL5", by: "Neel Shah", lvl: "Advanced", lessons: 51, dur: "12h 30m", price: 129, rating: 4.8, students: 3390, prog: 0, hue: 340 },
  { id: "psychology", t: "Trading Psychology", by: "Dr. Meera Rao", lvl: "All levels", lessons: 14, dur: "2h 50m", price: 29, rating: 4.9, students: 9870, prog: 0, hue: 45 },
];
let LIVE = [
  { id: 1, d: 4, m: "Oct", t: "Gold (XAUUSD) Live Market Session", by: "Aseem Singhal", time: "7:00 PM IST", len: "90 min", seats: 38, kind: "Live trading", live: true },
  { id: 2, d: 7, m: "Oct", t: "Q&A: Fixing Your Strategy Drawdown", by: "Neel Shah", time: "8:30 PM IST", len: "60 min", seats: 112, kind: "Webinar" },
  { id: 3, d: 12, m: "Oct", t: "6-Week Forex Bootcamp, Cohort 14", by: "Kavya Iyer", time: "Sat & Sun, 10 AM", len: "6 weeks", seats: 9, kind: "Cohort" },
  { id: 4, d: 18, m: "Oct", t: "Reading the Economic Calendar", by: "Rohit Mehra", time: "6:00 PM IST", len: "75 min", seats: 64, kind: "Webinar" },
];
let INDICATORS = [
  { id: "trend-matrix", t: "Trend Matrix Pro", cat: "Trend", plat: "MT5", desc: "Multi-timeframe trend dashboard that colours bias from M5 to D1 in one panel.", price: 19, rating: 4.8, subs: 4210, kind: "ribbon" },
  { id: "smart-sr", t: "Smart S/R Zones", cat: "Levels", plat: "MT5", desc: "Auto-draws supply and demand zones and fades them as price tests them.", price: 15, rating: 4.7, subs: 3880, kind: "zones" },
  { id: "volume-delta", t: "Volume Delta Histogram", cat: "Volume", plat: "MT5", desc: "Buying versus selling pressure per candle, with divergence alerts.", price: 12, rating: 4.6, subs: 2105, kind: "hist" },
  { id: "session-box", t: "Session Range Box", cat: "Levels", plat: "MT5", desc: "Asia, London and New York ranges boxed, with breakout arrows.", price: 0, rating: 4.9, subs: 9640, kind: "box" },
  { id: "rsi-div", t: "RSI Divergence Scanner", cat: "Oscillator", plat: "MT5", desc: "Scans 28 pairs for regular and hidden divergence and sends push alerts.", price: 14, rating: 4.5, subs: 1970, kind: "osc" },
  { id: "atr-stop", t: "ATR Trailing Stop", cat: "Trend", plat: "MT5", desc: "Volatility-adjusted stop line that flips colour on trend change.", price: 9, rating: 4.7, subs: 3312, kind: "ribbon" },
];
let STRATS = [
  { id: "gold-breakout", t: "Gold London Breakout", sym: "XAUUSD", tf: "M15", style: "Breakout", risk: "Medium", ret: 38.4, dd: 9.8, win: 58, pf: 1.92, trades: 412, min: 1000, price: 49, subs: 1840, seed: 7, by: "Aseem Singhal" },
  { id: "euro-mean", t: "EURUSD Mean Reversion", sym: "EURUSD", tf: "H1", style: "Mean reversion", risk: "Low", ret: 18.2, dd: 4.6, win: 66, pf: 1.71, trades: 688, min: 500, price: 29, subs: 2410, seed: 11, by: "Neel Shah" },
  { id: "nas-momentum", t: "NAS100 Momentum Rider", sym: "NAS100", tf: "M30", style: "Momentum", risk: "High", ret: 61.7, dd: 17.3, win: 47, pf: 2.08, trades: 296, min: 2000, price: 79, subs: 960, seed: 23, by: "Kavya Iyer" },
  { id: "carry-grid", t: "Asian Session Scalper", sym: "USDJPY", tf: "M5", style: "Scalping", risk: "Medium", ret: 27.9, dd: 8.1, win: 71, pf: 1.55, trades: 1930, min: 500, price: 39, subs: 1325, seed: 5, by: "Rohit Mehra" },
  { id: "gbp-swing", t: "GBP Swing Trend", sym: "GBPUSD", tf: "H4", style: "Trend following", risk: "Low", ret: 22.5, dd: 6.2, win: 44, pf: 1.88, trades: 164, min: 1000, price: 29, subs: 870, seed: 31, by: "Aseem Singhal" },
  { id: "btc-range", t: "BTC Weekend Range", sym: "BTCUSD", tf: "H1", style: "Range", risk: "High", ret: 44.1, dd: 15.4, win: 55, pf: 1.67, trades: 238, min: 1500, price: 59, subs: 540, seed: 43, by: "Neel Shah" },
];
let BROKERS = [
  { id: "exness", n: "Exness", c: "#1a1a1a", reg: "FSCA, CySEC", spread: "from 0.0 pips", min: "$10" },
  { id: "icmarkets", n: "IC Markets", c: "#1f6fd1", reg: "ASIC, CySEC", spread: "from 0.0 pips", min: "$200" },
  { id: "xm", n: "XM", c: "#c0392b", reg: "CySEC, ASIC", spread: "from 0.6 pips", min: "$5" },
  { id: "pepperstone", n: "Pepperstone", c: "#2c3e50", reg: "FCA, ASIC", spread: "from 0.0 pips", min: "$0" },
  { id: "vantage", n: "Vantage", c: "#0e7c86", reg: "ASIC, FCA", spread: "from 0.0 pips", min: "$50" },
  { id: "fbs", n: "FBS", c: "#2e9e4f", reg: "CySEC, ASIC", spread: "from 0.7 pips", min: "$5" },
  { id: "octa", n: "Octa", c: "#6c3fc5", reg: "CySEC", spread: "from 0.6 pips", min: "$25" },
  { id: "tickmill", n: "Tickmill", c: "#d4650a", reg: "FCA, CySEC", spread: "from 0.0 pips", min: "$100" },
];
let SCRIPTS = [];
let MENTORS = [
  { n: "Aseem Singhal", r: "Founder, 15 yrs trading", i: "AS" },
  { n: "Kavya Iyer", r: "Forex & SMC mentor", i: "KI" },
  { n: "Neel Shah", r: "Algo & MQL5 mentor", i: "NS" },
];

const state = { broker: null };

/* ---------------- account (loaded from the API) ---------------- */
const TODAY = "1 Oct 2026";
const PLANS = { community: { name: "Community", price: 0 }, mentor: { name: "Mentor plan", price: 99 }, pro: { name: "Pro desk", price: 299 } };
const BUCKET = { strategy: "subs", indicator: "inds", course: "courses", live: "live", script: "scripts" };
const emptyAccount = () => ({ subs: {}, inds: {}, courses: {}, live: {}, scripts: {}, plan: null, bookings: [], orders: [] });
let acct = emptyAccount();
async function loadAccount() {
  if (!authed()) { acct = emptyAccount(); return; }
  try {
    const a = await api("/api/account");
    const next = emptyAccount();
    for (const x of a.subscriptions) next[BUCKET[x.kind] ?? "inds"][x.item_id] = { since: fmtDate(x.since), price: x.price, plan: x.plan, title: x.title };
    for (const e of a.courses) next.courses[e.course.id] = { since: fmtDate(e.since), price: e.course.price, prog: e.progress };
    for (const l of a.live) next.live[l.id] = { since: "" };
    if (a.plan) next.plan = { id: a.plan.item_id, name: a.plan.title, price: a.plan.price, since: fmtDate(a.plan.since) };
    next.bookings = a.bookings.map((b) => ({ when: b.scheduled_at, what: b.what, booked: fmtDate(b.created_at) }));
    next.orders = a.orders.map((o) => ({ date: fmtDate(o.created_at), item: o.item, kind: o.kind, amount: o.amount, period: o.period }));
    try { localStorage.setItem("mm_user", JSON.stringify(a.user)); } catch { /* private mode */ }
    acct = next;
  } catch (e) {
    if (e.status !== 401) toast(e.message);
  }
}
function saveAccount() { /* state lives on the server now */ }
const owns = (kind, id) => kind === "plan" ? acct.plan?.id === id : Boolean(acct[BUCKET[kind]]?.[id]);

function itemFor(kind, id) {
  if (kind === "strategy") { const s = STRATS.find((x) => x.id === id); return { title: s.t, price: s.price, period: "/month" }; }
  if (kind === "indicator") { const x = INDICATORS.find((i) => i.id === id); return { title: x.t, price: x.price, period: "/month" }; }
  if (kind === "course") { const c = COURSES.find((x) => x.id === id); return { title: c.t, price: c.price, period: "" }; }
  if (kind === "live") { const l = LIVE.find((x) => x.id === Number(id)); return { title: l.t, price: 0, period: "" }; }
  if (kind === "script") { const x = SCRIPTS.find((i) => i.id === id); return { title: x.t, price: x.price, period: "" }; }
  if (kind === "plan") { const p = PLANS[id]; return { title: p.name, price: p.price, period: "/month" }; }
}

const buyBtn = (kind, id, label, ownedLabel, extra = "") => {
  const on = owns(kind, id);
  const it = itemFor(kind, id);
  const text = on ? ownedLabel : (it.price > 0 || !authed()) ? (it.price > 0 ? "Request access" : "Request free access") : label;
  return `<button class="btn ${extra} ${on ? "is-on" : ""}" data-buy="${kind}:${id}" data-label="${esc(text)}" data-owned="${esc(ownedLabel)}">${esc(text)}</button>`;
};

function requestAccess(kind, id, title, price, period, plan) {
  return new Promise((done) => {
    const u = me();
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ra-t" novalidate>
      <h2 class="h2" id="ra-t">Request access</h2>
      <div class="co-row"><span>${esc(title)}</span><b>${price ? `$${price}<small class="muted">${period}</small>` : "Free"}</b></div>
      <p class="small muted">Tell us where to reach you. We confirm the price, you pay, and we send your login${authed() ? " and unlock this on your account" : ""} by email or WhatsApp. No self-service sign-up.</p>
      <label class="field"><span>Name</span><input class="inp" id="ra-name" required value="${esc(u.name ?? "")}"></label>
      <label class="field"><span>Email</span><input class="inp" id="ra-email" type="email" required value="${esc(u.email ?? "")}"></label>
      <label class="field"><span>WhatsApp (optional)</span><input class="inp" id="ra-phone" placeholder="+971 50 000 0000"></label>
      <label class="field"><span>Note (optional)</span><input class="inp" id="ra-note" placeholder="Broker, account size, questions"></label>
      <p class="form-error" id="ra-err" role="alert" hidden></p>
      <div class="btn-row"><button class="btn" type="submit">Send request</button><button class="btn btn-quiet" type="button" data-no>Cancel</button></div>
      <p class="small muted">Prefer to talk first? <a href="#/support" data-no>Book a free onboarding call</a>.</p></form>`;
    document.body.append(m);
    const close = (v) => { m.remove(); removeEventListener("keydown", onKey); done(v); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    addEventListener("keydown", onKey);
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-no]")) close(false); });
    m.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = m.querySelector("#ra-name").value.trim(), email = m.querySelector("#ra-email").value.trim(), err = m.querySelector("#ra-err");
      if (!name || !email.includes("@")) { err.textContent = "Name and a valid email are required."; err.hidden = false; return; }
      const btn = m.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = "Sending…";
      try {
        const r = await api("/api/requests", { method: "POST", body: { name, email, phone: m.querySelector("#ra-phone").value.trim(), kind, id: String(id), plan: plan || "", note: m.querySelector("#ra-note").value.trim() } });
        m.querySelector(".modal-card").innerHTML = `<h2 class="h2">Request sent</h2><p class="muted">${esc(r.message)}</p><p class="small muted">Reference #${r.id}. Keep an eye on ${esc(email)}.</p><div class="btn-row"><button class="btn" type="button" data-no>Done</button></div>`;
      } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = "Send request"; }
    });
    m.querySelector("#ra-name").focus();
  });
}

function needLogin() {
  if (authed()) return false;
  toast("Log in to continue");
  location.hash = `#/login?next=${encodeURIComponent(location.hash.replace(/^#\//, "") || "account")}`;
  return true;
}

// Paid items and anonymous visitors go through "Request access" (manual payment, login sent by the team).
// Logged-in members can take free items directly.
async function purchase(kind, id, plan = "Monthly", priceOverride) {
  const it = itemFor(kind, id);
  const price = priceOverride ?? it.price;
  const period = plan === "Quarterly" ? "/quarter" : plan === "Yearly" ? "/year" : it.period;
  if (price > 0 || !authed()) { await requestAccess(kind, id, it.title, price, period, plan); return false; }
  try { await api("/api/purchase", { method: "POST", body: { kind, id: String(id), plan } }); }
  catch (e) { toast(e.message); return false; }
  await loadAccount();
  return true;
}

const BOUGHT_MSG = { strategy: "Subscribed. Switch it on in the Algo dashboard.", indicator: "Subscribed. Restart MT5 to see it in Navigator.", course: "Enrolled. Find it under My account → Courses.", live: "Seat reserved. Added to My account.", plan: "Plan active. See My account.", script: "Purchased. Download it from My account." };

/* ---------------- shared bits ---------------- */
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.append(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function splitWords(el) {
  if (!el) return;
  let w = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const sp = document.createElement("span");
          sp.textContent = part; sp.style.setProperty("--w", w++);
          frag.append(sp);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  el.classList.add("split");
}

const SEARCH_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

const footer = () => `
  <footer class="foot">
    <span class="brand"><span class="brand-dot" aria-hidden="true"></span>MrMarket</span>
    <nav class="foot-links"><a href="#/learn">Learn</a><a href="#/indicators">Indicators</a><a href="#/strategies">Strategies</a><a href="#/scripts">Scripts</a><a href="#/execute">Execution</a><a href="#/algo">Algo</a><a href="#/support">Handholding</a><a href="#/about">About us</a></nav>
    <p class="muted small">Trading carries risk. Past performance does not guarantee future results.</p>
  </footer>`;

function thumbSVG(hue, seed) {
  const d = curve(seed, 30, 0.4, 3);
  const min = Math.min(...d), max = Math.max(...d);
  const pts = d.map((v, i) => `${(i / 29) * 320},${150 - ((v - min) / (max - min)) * 110}`).join(" ");
  const candles = d.map((v, i) => {
    const x = (i / 29) * 320, y = 160 - ((v - min) / (max - min)) * 110, up = i && v > d[i - 1];
    return `<rect x="${x - 2.5}" y="${y - 8}" width="5" height="16" rx="1" fill="${up ? "#5fd68d" : "#ff6b6b"}" opacity=".5"/>`;
  }).join("");
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="hsl(${hue} 45% 14%)"/>
    <radialGradient id="r${seed}" cx=".8" cy=".1" r=".9"><stop offset="0" stop-color="hsl(${hue} 90% 55%)" stop-opacity=".55"/><stop offset="1" stop-color="hsl(${hue} 90% 55%)" stop-opacity="0"/></radialGradient>
    <rect width="320" height="180" fill="url(#r${seed})"/>${candles}<polyline points="${pts}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/></svg>`;
}

function indArt(kind, seed) {
  const d = curve(seed, 48, 0.2, 2.6), min = Math.min(...d), max = Math.max(...d);
  const Y = (v) => 100 - ((v - min) / (max - min)) * 70;
  const X = (i) => 6 + (i / 47) * 288;
  const candles = d.map((v, i) => {
    const prev = d[i - 1] ?? v, up = v >= prev, y1 = Y(Math.max(v, prev)), y2 = Y(Math.min(v, prev));
    return `<line x1="${X(i)}" x2="${X(i)}" y1="${y1 - 4}" y2="${y2 + 4}" stroke="${up ? "#1f9d55" : "#d63c3c"}" stroke-width=".8"/><rect x="${X(i) - 2}" y="${y1}" width="4" height="${Math.max(1, y2 - y1)}" fill="${up ? "#1f9d55" : "#d63c3c"}"/>`;
  }).join("");
  let over = "";
  if (kind === "ribbon") {
    const ma = d.map((_, i) => { const s = d.slice(Math.max(0, i - 6), i + 1); return s.reduce((a, b) => a + b) / s.length; });
    over = `<polyline points="${ma.map((v, i) => `${X(i)},${Y(v) + 6}`).join(" ")}" fill="none" stroke="#f07c12" stroke-width="3" stroke-opacity=".8"/>`;
  } else if (kind === "zones") {
    over = `<rect x="0" y="${Y(max) - 4}" width="300" height="14" fill="#d63c3c" opacity=".14"/><rect x="0" y="${Y(min) - 10}" width="300" height="14" fill="#1f9d55" opacity=".14"/>`;
  } else if (kind === "box") {
    over = `<rect x="40" y="30" width="80" height="60" fill="#1f6fd1" opacity=".08" stroke="#1f6fd1" stroke-dasharray="3 3"/><rect x="150" y="20" width="90" height="80" fill="#f07c12" opacity=".08" stroke="#f07c12" stroke-dasharray="3 3"/>`;
  } else if (kind === "hist" || kind === "osc") {
    const r = rng(seed + 3);
    over = kind === "hist"
      ? d.map((_, i) => { const v = (r() - 0.45) * 24; return `<rect x="${X(i) - 2}" y="${v > 0 ? 112 - v : 112}" width="4" height="${Math.abs(v)}" fill="${v > 0 ? "#1f9d55" : "#d63c3c"}" opacity=".7"/>`; }).join("")
      : `<polyline points="${d.map((v, i) => `${X(i)},${112 + Math.sin(i / 4) * 6 + (r() - 0.5) * 4}`).join(" ")}" fill="none" stroke="#6c3fc5" stroke-width="1.5"/>`;
  }
  return `<svg viewBox="0 0 300 ${kind === "hist" || kind === "osc" ? 125 : 110}" preserveAspectRatio="none">${over}${candles}</svg>`;
}

/* ---------------- team (shared by home and about) ---------------- */
const TEAM = [
  {
    id: "vinayakk", name: "Vinayakk V Joshi", pronouns: "He/Him", role: "Coach & Trader", tag: "SEBI-registered Research Analyst", photo: "assets/team/vinayakk.jpg", loc: "Dubai, UAE",
    intro: "Vinayakk brings 24+ years of professional experience in large business houses, including overseas roles in Dubai and Mauritius, and nine years of training and coaching traders across 18+ countries.",
    bio: [
      "Registered with the Securities & Exchange Board of India as a Research Analyst (2020) and certified by NISM as a Research Analyst. Member of The Association of Technical Analysts (ATA, India).",
      "Wide knowledge of the stock market, fundamental and technical analysis including chart analysis and astro effects on markets. Studied numerology in 2019 and applies it in financial markets.",
      "Commerce graduate from the University of Mumbai and Associate Member of The Institute of Company Secretaries of India (ICSI) since 1998. Associate (ACSI) Member of the Chartered Institute of Securities & Investment, London. First certification in Capital Markets and Derivatives from NSE Academy in 2000.",
      "Currently based in Dubai, UAE, and part of Finivanta Group and Fortune Signals Group in the GCC countries.",
    ],
    stats: [["24+", "Years in industry"], ["9", "Years coaching"], ["300+", "Traders mentored"], ["18+", "Countries"]],
    creds: ["SEBI Research Analyst (2020)", "NISM Research Analyst", "Member, ATA India", "ACS, ICSI (1998)", "ACSI, CISI London", "NSE Academy, Capital Markets & Derivatives (2000)", "B.Com, University of Mumbai"],
    links: [["Website", "https://www.mrmarket.me"], ["Instagram", "https://www.instagram.com/mrmarket333"]],
  },
  {
    id: "aseem", name: "Aseem Singhal", role: "Algorithmic Trader", tag: "Founder, Unfluke · Author of 51 Trading Strategies", photo: "assets/team/aseem.jpg", loc: "India",
    intro: "Aseem is an algorithmic trader, author and financial educator who built his quantitative edge at JPMorgan and Deutsche Bank in Singapore.",
    bio: [
      "After graduating Magna Cum Laude he explored ventures in technology, fashion and franchising before returning to what he does best: price action analysis and quantitative market strategies.",
      "Author of the best-selling book 51 Trading Strategies, and published researcher on theta decay and delta behaviour in Indian index options.",
      "Founder of Unfluke, a backtesting and trading-analytics platform, and host of the widely followed Trading with Groww series. Visiting faculty at Chitkara University.",
      "Today he mentors aspiring traders in Python-based algorithmic strategies, backtesting and systematic options trading. On MrMarket he leads strategy design, the EA catalogue and the algo desk.",
    ],
    stats: [["JPM · DB", "Quant background"], ["51", "Strategies, the book"], ["Groww", "Trading series host"], ["Unfluke", "Founder"]],
    creds: ["Ex JPMorgan, Deutsche Bank (Singapore)", "Author, 51 Trading Strategies", "Host, Trading with Groww", "Visiting Faculty, Chitkara University", "Published research, index options"],
    links: [["Unfluke", "https://unfluke.in"], ["Coursera", "https://www.coursera.org/instructor/~169872100"]],
  },
];

/* ---------------- home ---------------- */
const PILLARS = [
  ["Learning", "Video courses with practice workbooks, from your first candle to your first EA.", "#/learn"],
  ["Indicator", "31 MT5 signal indicators, each matched to an Expert Advisor.", "#/indicators"],
  ["Strategy", "31 Expert Advisors with one shared risk engine: ATR stops, % risk, trailing, news filter.", "#/strategies"],
  ["Execution Tool", "Pick your broker and get MT5 set up in minutes.", "#/execute"],
  ["Algo", "One dashboard for every strategy, order, position and P&L.", "#/algo"],
  ["Handholding", "Mentors, onboarding calls and a community at your side.", "#/support"],
];
const FEATURES = () => [
  { k: "mt5", kicker: "MetaTrader 5", title: "Expert Advisors & indicators", href: "#/strategies", cta: "Browse the 31 EAs",
    p: "A catalogue of 31 Expert Advisors, from MA crossover and Donchian breakouts to Wyckoff springs, harmonic patterns and session scalping. Every EA ships with its own on-chart signal indicator and the same risk engine: ATR-sized stops, % risk sizing, break-even, trailing, partial close, spread, session and news filters.",
    bullets: ["Compiled .ex5 files for any MT5 broker, hedging or netting", "All 31 signal indicators available on their own for discretionary trading", "Switch strategies on and off from the Algo dashboard"],
    stat: [String(STRATS.length || 31) + " EAs", String(INDICATORS.length || 31) + " indicators"], lock: "Delivered to subscribers after purchase" },
  { k: "video", kicker: "Video courses", title: "Learn the craft on video", href: "#/course/candlesticks", cta: "Watch the free lessons",
    p: "Structured video courses with lesson notes and practice workbooks. Start with Basics of Candlesticks: 33 lessons from the anatomy of a candle to a complete trade plan, with real examples on Emaar, Emirates NBD and Apple. The first lessons are free to watch; members get the full course. Further courses cover price action, risk, smart money, MT5, MQL5 and trading psychology.",
    bullets: ["Watch inside the portal, no downloads", "Excel practice workbooks with answer keys per lesson", "Progress tracking when you log in"],
    stat: [String(COURSES.length || 15) + " courses", COURSES.reduce((a, c) => a + (c.lessons || 0), 0) + " lessons"], lock: "First lessons free, full courses for members" },
  { k: "py", kicker: "Python scripts", title: "Tools around your trading", href: "#/scripts", cta: "See the scripts",
    p: "Six Python tools built to sit next to MT5: a CSV backtester with the MrMarket risk engine, a position size calculator, an MT5 to Excel trade journal exporter, a Telegram signal bridge, an equity curve and Monte Carlo analyser, and an economic calendar filter that keeps your EAs out of the news.",
    bullets: ["Readable Python with a README and one-line install", "Works on Windows, macOS and your VPS", "Source code included for scripts"],
    stat: [String(SCRIPTS.length || 6) + " scripts", "Python 3.10+"], lock: "Delivered to buyers as a zip" },
];

function homeScreen() {
  view.innerHTML = `
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow rise"><i></i>The portal for serious traders</p>
      <h1 class="display split-me">A complete trading <em>ecosystem</em></h1>
      <p class="lede rise" style="--d:500ms">Learn the craft, subscribe to indicators and strategies, execute on MT5 and watch your algos run. With a mentor beside you the whole way.</p>
      <div class="btn-row rise" style="--d:650ms"><a class="btn" href="#/learn">Start learning</a><a class="btn btn-quiet" href="#/strategies">Browse strategies</a></div>
      <dl class="stats rise" style="--d:800ms">
        <div><dt>Expert Advisors</dt><dd>${STRATS.length || 31}</dd></div>
        <div><dt>Video lessons</dt><dd>${COURSES.reduce((a, c) => a + (c.lessons || 0), 0) || 449}</dd></div>
        <div><dt>Python scripts</dt><dd>${SCRIPTS.length || 6}</dd></div>
      </dl>
    </div>
    <div class="hero-art">
      <p class="hero-note"><b>Learning + Tools + Support</b>Everything a trader needs, in one place instead of ten tabs.</p></div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">Six parts, <em>one system</em></h2>
      <p class="lede">Each piece works alone. Together they take you from beginner to running live algos.</p></div>
    <div class="eq">
      ${PILLARS.map(([t, p, href], i) => `<a href="${href}"><span class="n">${i + 1}</span><h3 class="h3">${t}</h3><p>${p}</p><span class="go">Explore →</span></a>`).join("")}
    </div>
    <div class="eq-result">Learning + Indicator + Strategy + Execution + Algo + Handholding = <em>A Complete Trading Ecosystem</em></div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">What we <em>offer</em></h2>
      <p class="lede">Three things, each complete on its own: MT5 robots and indicators, video courses, and Python tools.</p></div>
    <div class="features">
      ${FEATURES().map((f) => `<article class="feature feature-${f.k}">
        <div class="feature-head"><span class="kicker">${f.kicker}</span><div class="feature-stats">${f.stat.map((x) => `<b>${esc(x)}</b>`).join("")}</div></div>
        <h3 class="h2">${f.title}</h3>
        <p class="muted">${f.p}</p>
        <ul class="checklist">${f.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
        <p class="small muted feature-lock">${f.lock}</p>
        <a class="btn" href="${f.href}">${f.cta}</a>
      </article>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">From the <em>EA catalogue</em></h2>
      <p class="lede">Each Expert Advisor runs on your own MT5 account with the broker you choose.</p></div>
    <div class="cards cards-3">${STRATS.slice(0, 3).map(stratCard).join("")}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">How it <em>works</em></h2></div>
    <div class="cards cards-4">
      ${[["Learn", "Pick a course or join a live session."], ["Subscribe", "Choose indicators and strategies that fit your style."], ["Connect", "Pick your broker and install MT5."], ["Run", "Turn strategies on and track them on the Algo dashboard."]]
        .map(([t, p], i) => `<article class="card"><span class="kicker">Step ${i + 1}</span><h3 class="h3">${t}</h3><p class="muted">${p}</p></article>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">Meet the <em>people</em></h2>
      <p class="lede">Two traders with very different roads to the same desk: one from boardrooms and research, one from quant floors and code.</p></div>
    <div class="team-intro">
      ${TEAM.map((m) => `<article class="intro-card">
        <a class="intro-photo" href="#/about#${m.id}"><img src="${m.photo}" alt="${esc(m.name)}" loading="lazy"></a>
        <div class="intro-body">
          <span class="kicker">${esc(m.role)}</span>
          <h3 class="h2">${esc(m.name)}</h3>
          <p class="small muted">${esc(m.tag)} · ${esc(m.loc)}</p>
          <p class="muted">${esc(m.intro)}</p>
          <p class="muted">${esc(m.bio[0])}</p>
          <div class="tags">${m.creds.slice(0, 4).map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
          <a class="btn btn-small btn-quiet" href="#/about">Full profile →</a>
        </div>
      </article>`).join("")}
    </div>
  </section>

  <section class="section split-2">
    <div><h2 class="title">Questions <em>traders ask</em></h2></div>
    <div class="faq">
      <details><summary>Do I need trading experience?</summary><p>No. The free MT5 course and the beginner track start from the basics. A mentor call during onboarding helps you pick a starting path.</p></details>
      <details><summary>Where does my money sit?</summary><p>With your broker, in your own account. Strategies trade on your MT5 terminal. MrMarket never holds client funds.</p></details>
      <details><summary>Which brokers can I use?</summary><p>Any broker that offers MetaTrader 5. The Execution page has step-by-step setup for the most popular ones.</p></details>
      <details><summary>Can I stop a strategy at any time?</summary><p>Yes. Each strategy has a switch on the Algo dashboard. Turning it off stops new trades. You choose whether open positions are closed.</p></details>
      <details><summary>How do I get access?</summary><p>Pick what you want and press Request access. We confirm the price, you pay, and we send your login by email or WhatsApp. There is no self-service sign-up.</p></details>
      <details><summary>Are backtest results guaranteed?</summary><p>No. Backtests and live records show how a strategy behaved in the past. Markets change and losses are possible.</p></details>
    </div>
  </section>

  <section class="cta-band">
    <div><h2 class="title">Stop trading <em>on luck</em></h2><p class="muted" style="color:#b5b5b5;margin-top:14px;max-width:50ch">Build a process with the right tools and the right people beside you.</p></div>
    <a class="btn" href="#/support">Book a free onboarding call</a>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
}

/* ---------------- learning ---------------- */
function courseCard(c, i) {
  const mine = acct.courses[c.id], enrolled = Boolean(mine), prog = mine?.prog ?? 0;
  return `<article class="card hover">
    <div class="thumb">${thumbSVG(c.hue, i + 3)}<span class="lvl tag">${c.lvl}</span><span class="play" aria-hidden="true"></span><span class="dur">${c.dur}</span></div>
    <h3 class="h3">${esc(c.t)}</h3>
    <p class="muted small">${esc(c.by)} · ${c.lessons} lessons · ${c.students ? `<span class="rating"><b>★ ${c.rating}</b> (${c.students.toLocaleString()})</span>` : `<span class="tag tag-amber">New</span>`}</p>
    ${enrolled ? `<div class="progress" style="--v:${prog}%"><i></i></div><p class="small muted">${prog === 100 ? "Completed" : prog ? `${prog}% complete` : "Enrolled · not started"}</p>` : ""}
    <div class="card-foot"><span class="price">${c.price ? `$${c.price}` : "Free"}</span>
      <span class="btn-row">${enrolled ? `<a class="btn btn-small" href="#/course/${c.id}">${prog === 100 ? "Review" : prog ? "Continue" : "Start course"}</a>` : `<a class="btn btn-small btn-quiet" href="#/course/${c.id}">Preview</a>${buyBtn("course", c.id, c.price ? "Buy course" : "Enroll free", "Enrolled ✓", "btn-small")}`}</span></div>
  </article>`;
}

function learnScreen() {
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Learning</p>
    <h1 class="title split-me">Learn at your pace, <em>or live with us</em></h1>
    <p class="lede rise" style="--d:400ms">Recorded courses you can watch any time, and live sessions where you trade the market with a mentor.</p>
  </section>
  <div class="toolbar">
    <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="rec">Recorded courses</button><button role="tab" aria-selected="false" data-tab="live">Live courses</button></div>
    <label class="search">${SEARCH_ICON}<input id="q" placeholder="Search courses" aria-label="Search courses"></label>
  </div>
  <div data-pane="rec">
    <div class="cats" style="margin-bottom:22px">${["All", "Beginner", "Intermediate", "Advanced"].map((l, i) => `<button class="cat" aria-pressed="${i === 0}" data-lvl="${l}">${l}</button>`).join("")}</div>
    <div class="cards cards-3" id="courses"></div>
  </div>
  <div data-pane="live" hidden>
    <ul>${LIVE.map((s) => `<li class="live">
      <div class="date"><b>${s.d}</b><span>${s.m}</span></div>
      <div><div class="tags" style="margin-bottom:8px">${s.live ? `<span class="tag tag-live">Tomorrow</span>` : ""}<span class="tag tag-amber">${s.kind}</span></div>
        <h3 class="h3">${esc(s.t)}</h3>
        <div class="live-meta"><span>with ${esc(s.by)}</span><span>${s.time}</span><span>${s.len}</span><span>${s.seats} seats left</span></div></div>
      ${buyBtn("live", s.id, "Reserve seat", "Seat reserved ✓", "btn-small")}
    </li>`).join("")}</ul>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let lvl = "All", q = "";
  const box = view.querySelector("#courses");
  const draw = () => {
    const list = COURSES.filter((c) => (lvl === "All" || c.lvl.includes(lvl)) && c.t.toLowerCase().includes(q));
    box.innerHTML = list.length ? list.map((c) => courseCard(c, COURSES.indexOf(c))).join("") : `<div class="empty" style="grid-column:1/-1">No courses match.</div>`;
  };
  draw();
  view.querySelectorAll("[data-lvl]").forEach((b) => b.addEventListener("click", () => {
    lvl = b.dataset.lvl; view.querySelectorAll("[data-lvl]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  view.querySelector("#q").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); draw(); });
  wireTabs();
}

function wireTabs() {
  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    const group = b.closest(".tabs");
    group.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    group.querySelectorAll("[data-tab]").forEach((x) => { const p = view.querySelector(`[data-pane="${x.dataset.tab}"]`); if (p) p.hidden = x !== b; });
  }));
}

/* ---------------- indicators ---------------- */
function indicatorsScreen() {
  const cats = ["All", ...new Set(INDICATORS.map((i) => i.cat))];
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Indicators</p>
    <h1 class="title split-me">Indicators that <em>do the watching</em></h1>
    <p class="lede rise" style="--d:400ms">Built for MetaTrader 5. Subscribe and the indicator appears in your terminal under Navigator → Indicators → Market.</p>
  </section>
  <div class="toolbar">
    <div class="cats">${cats.map((c, i) => `<button class="cat" aria-pressed="${i === 0}" data-cat="${c}">${c}</button>`).join("")}</div>
    <label class="search">${SEARCH_ICON}<input id="q" placeholder="Search indicators" aria-label="Search indicators"></label>
  </div>
  <div class="cards cards-3" id="list"></div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let cat = "All", q = "";
  const box = view.querySelector("#list");
  const draw = () => {
    const list = INDICATORS.filter((x) => (cat === "All" || x.cat === cat) && x.t.toLowerCase().includes(q));
    box.innerHTML = list.length ? list.map((x, i) => {
      return `<article class="card hover">
        <a class="ind-art" href="#/indicator/${x.id}" aria-label="${esc(x.t)} details">${indArt(x.kind, (x.n ?? i) * 7 + 2)}</a>
        <div class="strat-head"><h3 class="h3"><a href="#/indicator/${x.id}" style="text-decoration:none">${esc(x.t)}</a></h3>${x.n ? `<span class="small muted">#${String(x.n).padStart(2, "0")}</span>` : `<span class="rating"><b>★ ${x.rating}</b></span>`}</div>
        <div class="tags"><span class="tag">${x.cat}</span><span class="tag">${x.plat}</span>${x.plots?.length ? `<span class="tag">${x.plots.length} plots</span>` : ""}${x.ver ? `<span class="tag">v${x.ver}</span>` : ""}</div>
        <p class="muted small clamp-3">${esc(x.desc)}</p>
        <div class="card-foot"><span class="price">${x.price ? `$${x.price}<small> /month</small>` : "Free"}</span>
          <span class="btn-row"><a class="btn btn-small btn-quiet" href="#/indicator/${x.id}">Details</a>${buyBtn("indicator", x.id, x.price ? "Subscribe" : "Get free", "Subscribed ✓", "btn-small")}</span></div>
      </article>`;
    }).join("") : `<div class="empty" style="grid-column:1/-1">No indicators match.</div>`;
  };
  draw();
  view.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat; view.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  view.querySelector("#q").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); draw(); });
}

/* ---------------- strategies ---------------- */
const artKind = (cat = "") => ({ "Momentum": "osc", "Mean reversion": "osc", "Levels": "zones", "Smart money": "zones", "Session": "box", "Gap": "box", "Pattern": "box", "Price action": "box", "Volume": "hist" }[cat] ?? "ribbon");
function stratCard(s) {
  const riskTag = s.risk === "Low" ? "tag-up" : s.risk === "High" ? "tag-down" : "tag-amber";
  const live = s.trades > 0;
  return `<article class="card hover">
    <div class="strat-head"><div><h3 class="h3"><a href="#/strategy/${s.id}" style="text-decoration:none">${esc(s.t)}</a></h3><p class="muted small">${s.n ? `EA #${String(s.n).padStart(2, "0")} · ` : ""}by ${esc(s.by)}</p></div>${live ? `<span class="rating"><b>★ 4.${(s.seed % 3) + 7}</b></span>` : `<span class="tag">v${s.ver || "1.00"}</span>`}</div>
    <div class="tags"><span class="tag">${esc(s.cat || s.style)}</span><span class="tag">${esc(s.tf)}</span><span class="tag ${riskTag}">${s.risk} risk</span></div>
    ${live ? `<a href="#/strategy/${s.id}" aria-label="${esc(s.t)} details">${sparkSVG(curve(s.seed, 60, s.ret / 60, 2.5))}</a>
    <dl class="mini-stats"><div><dt>12m return</dt><dd class="up">${pct(s.ret)}</dd></div><div><dt>Max DD</dt><dd class="down">${pct(-s.dd)}</dd></div><div><dt>Win rate</dt><dd>${s.win}%</dd></div></dl>`
    : `<a class="ind-art" href="#/strategy/${s.id}" aria-label="${esc(s.t)} details">${indArt(artKind(s.cat), s.seed)}</a>
    <p class="muted small clamp-2">${esc(s.desc || "")}</p>
    <dl class="mini-stats"><div><dt>Timeframe</dt><dd style="font-size:17px">${esc(s.tf)}</dd></div><div><dt>Parameters</dt><dd style="font-size:17px">${s.inputs.length} + risk</dd></div><div><dt>Stop</dt><dd style="font-size:17px">ATR</dd></div></dl>`}
    <div class="card-foot"><span class="price">$${s.price}<small> /month</small></span>
      <span class="btn-row"><a class="btn btn-small btn-quiet" href="#/strategy/${s.id}">Details</a>${buyBtn("strategy", s.id, "Subscribe", "Subscribed ✓", "btn-small")}</span></div>
  </article>`;
}

function strategiesScreen() {
  const styles = ["All", ...new Set(STRATS.map((s) => s.cat || s.style))];
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Strategies</p>
    <h1 class="title split-me">Strategies with <em>a track record</em></h1>
    <p class="lede rise" style="--d:400ms">${STRATS.length} Expert Advisors for MetaTrader 5, each with its own on-chart signal indicator and the same risk engine: ATR stops, % risk sizing, break-even, trailing and news filters. Subscribe, install the compiled EA, switch it on.</p>
  </section>
  <div class="toolbar">
    <div class="cats">${styles.map((c, i) => `<button class="cat" aria-pressed="${i === 0}" data-f="${c}">${c}</button>`).join("")}</div>
    <div class="tabs" role="group" aria-label="Sort"><button aria-selected="true" data-sort="n">Catalogue order</button><button aria-selected="false" data-sort="price">Price</button><button aria-selected="false" data-sort="name">Name</button></div>
  </div>
  <div class="cards cards-3" id="list"></div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let f = "All", sort = "n";
  const box = view.querySelector("#list");
  const draw = () => {
    const list = STRATS.filter((s) => f === "All" || (s.cat || s.style) === f)
      .sort((a, b) => sort === "price" ? a.price - b.price : sort === "name" ? a.t.localeCompare(b.t) : (a.n ?? 0) - (b.n ?? 0));
    box.innerHTML = list.map(stratCard).join("") || `<div class="empty" style="grid-column:1/-1">No strategies match.</div>`;
  };
  draw();
  view.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
    f = b.dataset.f; view.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  view.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    sort = b.dataset.sort; view.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-selected", String(x === b))); draw();
  }));
}

const paramsTable = (inputs, { showGroup = true } = {}) => {
  const groups = [...new Set(inputs.map((i) => i.group || ""))];
  return `<div class="table-wrap params"><table><thead><tr><th>Setting</th><th>Default</th><th class="hide-sm">Type</th></tr></thead><tbody>
    ${groups.map((g) => `${showGroup && g ? `<tr class="grp"><td colspan="3">${esc(g)}</td></tr>` : ""}${inputs.filter((i) => (i.group || "") === g).map((i) => `<tr><td><b>${esc(i.label)}</b><span class="small muted hide-sm" style="display:block">${esc(i.name)}</span></td><td class="num"><code>${esc(i.default)}</code></td><td class="hide-sm muted">${esc(i.type.replace(/^ENUM_/, "").toLowerCase())}</td></tr>`).join("")}`).join("")}
  </tbody></table></div>`;
};
const includedList = (items) => `<ul class="checklist">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;

function strategyScreen(m) {
  view.innerHTML = loadingHTML;
  api(`/api/catalog/strategies/${m[1]}`).then(drawStrategy).catch((e) => { view.innerHTML = errorHTML(e); });
}
function drawStrategy(d) {
  const s = { id: d.id, t: d.title, sym: d.symbol, tf: d.timeframes || d.timeframe, style: d.style, risk: d.risk, ret: d.return_12m, dd: d.max_drawdown, win: d.win_rate, pf: d.profit_factor, trades: d.trades, min: d.min_capital, price: d.price, subs: d.subs, seed: d.seed, by: d.author };
  const live = d.has_track_record;
  const riskPct = (d.common_inputs || []).find((i) => i.name === "InpRiskPct")?.default ?? "1.0";
  const slAtr = (d.common_inputs || []).find((i) => i.name === "InpSLATRMult")?.default ?? "1.5";
  const rr = (d.common_inputs || []).find((i) => i.name === "InpRR")?.default ?? "2.0";
  const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const pair = d.pair_indicator;
  view.innerHTML = `
  <section class="page-head" style="padding-bottom:28px">
    <a class="small muted" href="#/strategies">← All strategies</a>
    <h1 class="title split-me">${esc(s.t)}</h1>
    <div class="tags rise" style="--d:300ms">${d.number ? `<span class="tag">EA #${String(d.number).padStart(2, "0")}</span>` : ""}<span class="tag">${esc(d.category || s.style)}</span><span class="tag">${esc(s.tf)}</span><span class="tag tag-amber">${s.risk} risk</span>${d.version ? `<span class="tag">v${esc(d.version)}</span>` : ""}<span class="tag">MT5</span><span class="tag">by ${esc(s.by)}</span></div>
  </section>
  <div class="detail">
    <div style="display:grid;gap:18px;min-width:0">
      ${live ? `<dl class="kv">
        <div><dt>12m return</dt><dd class="up">${pct(s.ret)}</dd></div>
        <div><dt>Max drawdown</dt><dd class="down">${pct(-s.dd)}</dd></div>
        <div><dt>Win rate</dt><dd>${s.win}%</dd></div>
        <div><dt>Profit factor</dt><dd>${s.pf}</dd></div>
        <div><dt>Trades</dt><dd>${s.trades}</dd></div>
      </dl>
      <div class="sheet"><div class="panel-head" style="margin-bottom:14px"><h2 class="h3">Equity curve, $10,000 start</h2></div>${chartSVG(d.equity_curve, { labels: ["Oct '25", "Jan '26", "Apr '26", "Jul '26", "Sep '26"] })}</div>
      <div class="sheet"><h2 class="h3" style="margin-bottom:14px">Monthly returns</h2>
        <div class="table-wrap" style="border:0"><table><thead><tr>${months.map((x) => `<th class="num">${x}</th>`).join("")}</tr></thead>
        <tbody><tr>${d.monthly_returns.map((v) => `<td class="num ${cls(v.pct)}"><b>${pct(v.pct)}</b></td>`).join("")}</tr></tbody></table></div></div>`
      : `<dl class="kv">
        <div><dt>Style</dt><dd style="font-size:22px">${esc(d.category || s.style)}</dd></div>
        <div><dt>Timeframes</dt><dd style="font-size:22px">${esc(s.tf)}</dd></div>
        <div><dt>Risk per trade</dt><dd style="font-size:22px">${esc(riskPct)}%</dd></div>
        <div><dt>Stop loss</dt><dd style="font-size:22px">${esc(slAtr)}× ATR</dd></div>
        <div><dt>Take profit</dt><dd style="font-size:22px">${esc(rr)}R</dd></div>
      </dl>
`}
      <div class="sheet" style="display:grid;gap:14px"><h2 class="h3">How it trades</h2>
        <p class="muted">${esc(d.description)}</p>
        ${includedList(d.rules)}</div>
      <div class="sheet" style="display:grid;gap:14px"><div class="panel-head"><h2 class="h3">Strategy settings</h2><span class="small muted">${d.inputs.length} inputs, all adjustable in MT5</span></div>
        ${d.inputs.length ? paramsTable(d.inputs) : `<p class="muted">No strategy-specific inputs.</p>`}</div>
      <details class="sheet" style="display:block"><summary class="h3" style="cursor:pointer">Risk, exits and filters <span class="small muted" style="font-weight:400">(shared by every MrMarket EA, ${(d.common_inputs || []).length} settings)</span></summary>
        <div style="margin-top:14px">${paramsTable(d.common_inputs || [])}</div></details>
      ${pair ? `<div class="sheet" style="display:grid;gap:14px"><div class="panel-head"><h2 class="h3">On the chart</h2><a class="small" href="#/indicator/${pair.id}">Indicator details →</a></div>
        <div class="split-2" style="align-items:center"><a class="ind-art" href="#/indicator/${pair.id}">${indArt(pair.kind, (pair.number || 1) * 7 + 2)}</a>
          <div style="display:grid;gap:10px"><b>${esc(pair.title)}</b><p class="muted small">${esc(pair.description)}</p><div class="tags">${(pair.plots || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div><p class="small muted">Embedded in the EA. Also available on its own for discretionary trading.</p></div></div></div>` : ""}
      <div class="sheet" style="display:grid;gap:14px"><h2 class="h3">What you get</h2>${includedList(d.included || [])}<p class="small muted">Delivered as a compiled MetaTrader 5 file. Source code is not included.</p></div>
    </div>
    <aside class="sticky">
      <div class="sheet" style="display:grid;gap:16px">
        <h2 class="h3">Subscribe</h2>
        <div class="plan">
          <label><span><input type="radio" name="plan" value="Monthly" data-price="${d.plans.Monthly}" checked>Monthly</span><b>$${d.plans.Monthly}</b></label>
          <label><span><input type="radio" name="plan" value="Quarterly" data-price="${d.plans.Quarterly}">Quarterly <span class="tag tag-up" style="margin-left:8px">Save 15%</span></span><b>$${d.plans.Quarterly}</b></label>
          <label><span><input type="radio" name="plan" value="Yearly" data-price="${d.plans.Yearly}">Yearly <span class="tag tag-up" style="margin-left:8px">Save 30%</span></span><b>$${d.plans.Yearly}</b></label>
        </div>
        <p class="small muted">Minimum capital $${s.min.toLocaleString()} · Runs on your MT5 account</p>
        ${buyBtn("strategy", s.id, "Subscribe", "Subscribed ✓")}
        ${owns("strategy", s.id) ? dlBtn("strategy", s.id, "Download EA for MT5 (.ex5)") : ""}
        <a class="btn btn-quiet" href="#/execute">Set up MT5 first</a>
      </div>
      <div class="sheet" style="display:grid;gap:10px"><b>Requirements</b><ul class="small muted" style="display:grid;gap:6px;padding-left:18px"><li>MetaTrader 5 (build 3800+), Windows or VPS</li><li>Any broker, hedging or netting account</li><li>Algo Trading enabled in the terminal</li><li>Chart timeframe: ${esc(s.tf)}</li></ul></div>
      <div class="sheet mentor-cta" style="display:grid;gap:10px"><b>Not sure which EA fits you?</b><p class="small muted">A mentor can match a strategy to your capital, hours and broker.</p><a class="btn btn-small btn-quiet" href="#/support">Book a free call</a></div>
    </aside>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
}

/* ---------------- indicator detail ---------------- */
function indicatorScreen(m) {
  view.innerHTML = loadingHTML;
  api(`/api/catalog/indicators/${m[1]}`).then(drawIndicator).catch((e) => { view.innerHTML = errorHTML(e); });
}
function drawIndicator(d) {
  const pair = d.pair_strategy;
  view.innerHTML = `
  <section class="page-head" style="padding-bottom:28px">
    <a class="small muted" href="#/indicators">← All indicators</a>
    <h1 class="title split-me">${esc(d.title)}</h1>
    <div class="tags rise" style="--d:300ms">${d.number ? `<span class="tag">#${String(d.number).padStart(2, "0")}</span>` : ""}<span class="tag">${esc(d.category)}</span><span class="tag">${esc(d.platform)}</span><span class="tag">${d.window === "separate" ? "Separate window" : "On chart"}</span>${d.version ? `<span class="tag">v${esc(d.version)}</span>` : ""}</div>
  </section>
  <div class="detail">
    <div style="display:grid;gap:18px;min-width:0">
      <div class="ind-art" style="height:240px">${indArt(d.kind, (d.number || 1) * 7 + 2)}</div>
      <div class="sheet" style="display:grid;gap:14px"><h2 class="h3">What it shows</h2><p class="muted">${esc(d.description)}</p>
        <div class="tags">${(d.plots || []).map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>
      <div class="sheet" style="display:grid;gap:14px"><div class="panel-head"><h2 class="h3">Inputs</h2><span class="small muted">${(d.inputs || []).length} settings</span></div>
        ${(d.inputs || []).length ? paramsTable(d.inputs, { showGroup: false }) : `<p class="muted">No inputs. Attach and go.</p>`}</div>
      ${pair ? `<div class="sheet" style="display:grid;gap:12px"><div class="panel-head"><h2 class="h3">Trades automatically with</h2><a class="small" href="#/strategy/${pair.id}">EA details →</a></div>
        <p class="muted">${esc(pair.title)}: ${esc(pair.description)}</p><div class="btn-row"><a class="btn btn-small" href="#/strategy/${pair.id}">View the EA</a></div></div>` : ""}
      <div class="sheet" style="display:grid;gap:14px"><h2 class="h3">What you get</h2>${includedList(d.included || [])}<p class="small muted">Delivered as a compiled MetaTrader 5 file. Source code is not included.</p></div>
    </div>
    <aside class="sticky">
      <div class="sheet" style="display:grid;gap:16px"><h2 class="h3">Subscribe</h2>
        <div class="co-row"><span>Monthly</span><b>${d.price ? `$${d.price}<small class="muted"> /month</small>` : "Free"}</b></div>
        ${buyBtn("indicator", d.id, d.price ? "Subscribe" : "Get free", "Subscribed ✓")}
        ${owns("indicator", d.id) ? dlBtn("indicator", d.id, "Download indicator (.ex5)") : ""}
        <a class="btn btn-quiet" href="#/execute">Install MT5 first</a>
        <p class="small muted">After subscribing, restart MT5. The indicator appears under Navigator → Indicators → Market.</p></div>
    </aside>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
}

/* ---------------- course player (videos) ---------------- */
function videoEmbed(url) {
  if (!url) return "";
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `<iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0" title="Lesson video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `<iframe src="https://player.vimeo.com/video/${vm[1]}" title="Lesson video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  return `<video controls playsinline preload="metadata" src="${esc(url)}"></video>`;
}
function courseScreen(m) {
  view.innerHTML = loadingHTML;
  api(`/api/catalog/courses/${m[1]}`).then((d) => drawCourse(d, null)).catch((e) => { view.innerHTML = errorHTML(e); });
}
function drawCourse(d, currentId) {
  const c = COURSES.find((x) => x.id === d.id) ?? { id: d.id, t: d.title, by: d.author, lvl: d.level, dur: d.duration, price: d.price, hue: d.hue, desc: d.description, disclaimer: d.disclaimer };
  const desc = d.description || c.desc || "", disclaimer = d.disclaimer || c.disclaimer || "";
  const lessons = d.lessons;
  const modules = [...new Set(lessons.map((l) => l.module || ""))];
  const cur = lessons.find((l) => l.id === currentId) ?? lessons.find((l) => !l.done && !l.locked) ?? lessons[0];
  const done = lessons.filter((l) => l.done).length;
  const playerBody = !cur ? `<div class="player-msg"><b>No lessons yet</b></div>`
    : cur.locked ? `<div class="player-msg"><span class="tag tag-amber">Members only</span><b>“${esc(cur.title)}” is part of the full course</b><p class="muted small">The first lessons are open to everyone. Members get every lesson, workbook and progress tracking.</p>${buyBtn("course", c.id, c.price ? `Get the course · $${c.price}` : "Join free", "Enrolled ✓")}</div>`
    : cur.video_url ? videoEmbed(cur.video_url)
    : `<div class="player-cover">${thumbSVG(c.hue ?? 30, (c.id || "x").length * 3 + 5)}<div class="player-msg"><span class="tag">Lesson ${cur.idx} · Notes</span><b>${esc(cur.title)}</b><p class="muted small">${esc(cur.module || c.t)}</p></div></div>`;
  view.innerHTML = `
  <section class="page-head" style="padding-bottom:22px">
    <a class="small muted" href="#/learn">← All courses</a>
    <h1 class="title split-me">${esc(c.t)}</h1>
    <div class="tags rise" style="--d:300ms"><span class="tag">${esc(c.lvl)}</span><span class="tag">${lessons.length} lessons</span><span class="tag">${esc(c.dur)}</span><span class="tag">with ${esc(c.by)}</span>${d.enrolled ? `<span class="tag tag-up">Enrolled · ${d.progress}%</span>` : ""}</div>
  </section>
  <div class="course">
    <div style="display:grid;gap:16px;min-width:0">
      <div class="player" id="player">${playerBody}</div>
      ${cur ? `<div class="panel" style="display:grid;gap:12px"><div class="panel-head"><div><span class="kicker">Lesson ${cur.idx}</span><h2 class="h3">${esc(cur.title)}</h2></div>
        ${d.enrolled && !cur.locked ? `<button class="btn btn-small ${cur.done ? "btn-quiet" : ""}" id="done-btn" data-id="${cur.id}" data-done="${cur.done}">${cur.done ? "Mark as not done" : "Mark as complete"}</button>` : ""}</div>
        ${cur.summary ? `<p class="muted" style="max-width:70ch">${esc(cur.summary)}</p>` : ""}
        ${cur.resource_url ? `<div class="resource"><span class="xls-badge" aria-hidden="true">XLS</span><div><b>Practice workbook</b><p class="small muted">Fill-in exercises, trade plan and quiz for this lesson, with answer key.</p></div><a class="btn btn-small btn-quiet" href="${esc(cur.resource_url)}" download>Download .xlsx</a></div>` : ""}
        ${d.enrolled ? `<div class="progress" style="--v:${d.progress}%"><i></i></div><p class="small muted">${done} of ${lessons.length} lessons complete</p>` : authed() ? `<p class="small muted">Join the course to track your progress.</p>` : `<p class="small muted">Watching as a visitor. <a href="#/login">Log in</a> to track progress.</p>`}</div>` : ""}
      ${desc ? `<div class="panel" style="gap:8px"><h2 class="h3">About this course</h2><p class="muted">${esc(desc)}</p></div>` : ""}
      ${disclaimer ? `<div class="panel disclaimer" style="gap:8px"><div class="panel-head"><h2 class="h3">Disclaimer</h2><span class="tag tag-amber">Please read</span></div><p class="small muted">${esc(disclaimer)}</p></div>` : ""}
    </div>
    <aside class="panel lesson-list">
      <div class="panel-head"><h2 class="h3">Lessons</h2><span class="small muted">${esc(c.dur)}</span></div>
      <ol>${modules.map((mod) => `${mod ? `<li class="module"><span>${esc(mod)}</span><span class="small muted">${lessons.filter((l) => (l.module || "") === mod).length}</span></li>` : ""}${lessons.filter((l) => (l.module || "") === mod).map((l) => `<li><button class="lesson ${l.id === cur?.id ? "is-cur" : ""} ${l.done ? "is-done" : ""}" data-lesson="${l.id}">
        <span class="n">${l.done ? "✓" : l.idx}</span>
        <span class="body"><b>${esc(l.title)}</b><span class="small muted">${l.video_url ? "▶ Video" : "Notes"}${l.resource_url ? " · Workbook" : ""}${l.free_preview && !d.enrolled ? " · Free" : ""}${l.locked ? " · Members" : ""}</span></span>
        ${l.locked ? `<span class="lock" aria-hidden="true"></span>` : ""}</button></li>`).join("")}`).join("")}</ol>
      ${d.enrolled ? "" : `<div style="padding:16px 18px 18px;display:grid;gap:10px"><span class="price">${c.price ? `$${c.price}` : "Free"}</span>${buyBtn("course", c.id, c.price ? "Buy course" : "Enroll free", "Enrolled ✓")}</div>`}
    </aside>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  view.querySelectorAll("[data-lesson]").forEach((b) => b.addEventListener("click", () => { drawCourse(d, Number(b.dataset.lesson)); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  view.querySelector("#done-btn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget, id = Number(btn.dataset.id), wasDone = btn.dataset.done === "true";
    btn.disabled = true;
    try {
      const r = await api(`/api/courses/${d.id}/lessons/${id}/complete`, { method: "POST", body: { done: !wasDone } });
      const l = d.lessons.find((x) => x.id === id); l.done = !wasDone; d.progress = r.progress;
      await loadAccount();
      const next = !wasDone ? (d.lessons.find((x) => x.idx > l.idx && !x.done && !x.locked)?.id ?? id) : id;
      drawCourse(d, next);
      toast(!wasDone ? (r.progress === 100 ? "Course complete. Well done!" : "Lesson complete") : "Marked as not done");
    } catch (err) { toast(err.message); btn.disabled = false; }
  });
}

/* ---------------- about us ---------------- */
function aboutScreen() {
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>About us</p>
    <h1 class="title split-me">Built by traders, <em>for traders</em></h1>
    <p class="lede rise" style="--d:400ms">MrMarket brings learning, indicators, strategies, execution, an algo desk and real mentoring into one place. Your money stays with your broker, your strategies run on your own MT5, and a real person is a message away.</p>
  </section>
  <div class="cards cards-3" style="margin-bottom:60px">
    ${[["Education first", "Every tool on MrMarket comes with a course or a mentor who explains it. We would rather you understand a strategy than blindly switch it on."], ["Your money, your account", "We never hold client funds. Strategies and indicators run inside your own MetaTrader 5 terminal, with the broker you choose."], ["Honest numbers", "Backtests are labelled as backtests. Live records appear only after real months on real accounts, including the losing ones."]]
      .map(([t, p], i) => `<article class="card"><span class="kicker">0${i + 1}</span><h3 class="h3">${t}</h3><p class="muted">${p}</p></article>`).join("")}
  </div>
  <div class="section-head"><h2 class="title">The <em>people</em></h2><p class="lede">Two traders with very different roads to the same desk: one from boardrooms and research, one from quant floors and code.</p></div>
  <div class="team">
    ${TEAM.map((m) => `<article class="person" id="${m.id}">
      <div class="person-photo"><img src="${m.photo}" alt="${esc(m.name)}" loading="lazy"></div>
      <div class="person-body">
        <span class="kicker">${esc(m.role)}</span>
        <h3 class="h2">${esc(m.name)}${m.pronouns ? ` <span class="small muted" style="font-weight:400">(${m.pronouns})</span>` : ""}</h3>
        <p class="muted" style="margin-top:-6px">${esc(m.tag)} · ${esc(m.loc)}</p>
        <p class="lede" style="font-size:19px">${esc(m.intro)}</p>
        <dl class="mini-stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">${m.stats.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd style="font-size:20px">${esc(v)}</dd></div>`).join("")}</dl>
        ${m.bio.map((p) => `<p class="muted">${esc(p)}</p>`).join("")}
        <div class="tags">${m.creds.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>
        <div class="btn-row">${m.links.map(([l, h]) => `<a class="btn btn-small btn-quiet" href="${h}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>
      </div>
    </article>`).join("")}
  </div>
  <section class="cta-band" style="margin-top:70px">
    <div><h2 class="title">Talk to us <em>before you trade</em></h2><p class="muted" style="color:#b5b5b5;margin-top:14px;max-width:50ch">A free 30-minute onboarding call: your goals, your capital, the right first course and strategy.</p></div>
    <a class="btn" href="#/support">Book a free onboarding call</a>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
}

/* ---------------- admin (team only; needs ADMIN_KEY) ---------------- */
const adminKey = () => { try { return sessionStorage.getItem("mm_admin"); } catch { return null; } };
async function adminApi(path, opts = {}) {
  const res = await fetch(API + path, { method: opts.method || "GET", headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey() || "" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* none */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
function adminScreen() {
  if (!adminKey()) {
    view.innerHTML = `<section class="login" style="grid-template-columns:1fr;max-width:460px;margin:60px auto"><form class="sheet login-form" novalidate>
      <h2 class="h2">Team admin</h2><p class="small muted">Enter the admin key to manage requests, logins and purchases.</p>
      <label class="field"><span>Admin key</span><input class="inp" type="password" id="ak" autocomplete="off"></label>
      <p class="form-error" id="ak-err" hidden></p><button class="btn" type="submit">Continue</button></form></section>${footer()}`;
    view.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { sessionStorage.setItem("mm_admin", view.querySelector("#ak").value.trim()); await adminApi("/api/admin/ping"); adminScreen(); }
      catch (err) { sessionStorage.removeItem("mm_admin"); const el = view.querySelector("#ak-err"); el.textContent = err.message; el.hidden = false; }
    });
    return;
  }
  view.innerHTML = loadingHTML;
  Promise.all([adminApi("/api/admin/leads"), adminApi("/api/admin/users")]).then(([leads, users]) => drawAdmin(leads, users)).catch((e) => { view.innerHTML = errorHTML(e); });
}
function drawAdmin(leads, users) {
  const items = { strategy: STRATS.map((x) => [x.id, x.t]), indicator: INDICATORS.map((x) => [x.id, x.t]), course: COURSES.map((x) => [x.id, x.t]), script: SCRIPTS.map((x) => [x.id, x.t]), plan: Object.entries(PLANS).map(([k, v]) => [k, v.name]), live: LIVE.map((x) => [String(x.id), x.t]) };
  const kindSel = (id) => `<select class="inp" id="${id}">${Object.keys(items).map((k) => `<option value="${k}">${k}</option>`).join("")}</select>`;
  const itemSel = (id, kind) => `<select class="inp" id="${id}">${items[kind].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select>`;
  const st = (x) => x === "new" ? "tag-amber" : x === "paid" ? "tag-up" : "";
  view.innerHTML = `
  <div class="dash-head"><div><span class="kicker">Team admin</span><h1 class="title" style="font-size:clamp(32px,4vw,52px)">Requests <em class="inline">& logins</em></h1></div>
    <div class="btn-row"><button class="btn btn-small btn-quiet" id="ad-refresh">Refresh</button><button class="btn btn-small btn-quiet" id="ad-out">Sign out</button></div></div>
  <dl class="kpis">
    <div class="kpi hero-kpi"><dt>New requests</dt><dd>${leads.filter((l) => l.status === "new").length}</dd><span class="delta muted">of ${leads.length} total</span></div>
    <div class="kpi"><dt>Users</dt><dd>${users.length}</dd><span class="delta muted">logins created</span></div>
    <div class="kpi"><dt>Active subscriptions</dt><dd>${users.reduce((a, u) => a + u.subscriptions.length, 0)}</dd><span class="delta muted">EAs, indicators, scripts, plans</span></div>
    <div class="kpi"><dt>Enrollments</dt><dd>${users.reduce((a, u) => a + u.courses.length, 0)}</dd><span class="delta muted">courses</span></div>
  </dl>
  <div class="dash-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="panel"><div class="panel-head"><h2 class="h3">1. Create or reset a login</h2></div>
      <form id="f-user" class="admin-form" novalidate>
        <label class="field"><span>Email</span><input class="inp" id="u-email" type="email" required></label>
        <label class="field"><span>Name</span><input class="inp" id="u-name"></label>
        <label class="field"><span>Password (8+ chars)</span><input class="inp" id="u-pass" required value="${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}"></label>
        <button class="btn btn-small" type="submit">Create / reset</button></form>
      <p class="small muted" id="u-msg"></p></div>
    <div class="panel"><div class="panel-head"><h2 class="h3">2. Assign a purchase</h2></div>
      <form id="f-grant" class="admin-form" novalidate>
        <label class="field"><span>User email</span><input class="inp" id="g-email" type="email" required list="user-emails"><datalist id="user-emails">${users.map((u) => `<option value="${esc(u.user.email)}">`).join("")}</datalist></label>
        <label class="field"><span>Kind</span>${kindSel("g-kind")}</label>
        <label class="field"><span>Item</span><span id="g-item-wrap">${itemSel("g-item", "strategy")}</span></label>
        <label class="field"><span>Billing label</span><select class="inp" id="g-plan"><option>Monthly</option><option>Quarterly</option><option>Yearly</option><option>One-time</option></select></label>
        <span class="btn-row"><button class="btn btn-small" type="submit">Assign</button><button class="btn btn-small btn-quiet" type="button" id="g-revoke">Revoke</button></span></form>
      <p class="small muted" id="g-msg"></p></div>
  </div>
  <div class="panel" style="margin-top:12px"><div class="panel-head"><h2 class="h3">Access requests</h2><span class="small muted">Newest first</span></div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>When</th><th>Name</th><th>Contact</th><th>Wants</th><th>Note</th><th>Status</th><th></th></tr></thead>
    <tbody>${leads.map((l) => `<tr><td class="muted">${l.id}</td><td class="muted">${fmtDate(l.created_at)} ${fmtTime(l.created_at).slice(0, 5)}</td><td><b>${esc(l.name)}</b>${l.user_id ? `<span class="small muted" style="display:block">has login</span>` : ""}</td>
      <td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? `<span class="small muted" style="display:block">${esc(l.phone)}</span>` : ""}</td>
      <td><span class="tag">${esc(l.kind)}</span> ${esc(l.item)}${l.plan ? ` <span class="small muted">(${esc(l.plan)})</span>` : ""}</td><td class="muted small">${esc(l.note)}</td>
      <td><span class="tag ${st(l.status)}">${esc(l.status)}</span></td>
      <td><span class="btn-row">${["new", "contacted", "paid", "done", "closed"].filter((x) => x !== l.status).map((x) => `<button class="link-btn" data-lead="${l.id}:${x}">${x}</button>`).join("")}<button class="link-btn" data-fill="${esc(l.email)}:${esc(l.name)}:${l.kind}:${esc(l.item_id)}:${esc(l.plan)}">use ↑</button></span></td></tr>`).join("") || `<tr><td colspan="8" class="muted">No requests yet.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="margin-top:12px"><div class="panel-head"><h2 class="h3">Users</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Since</th><th>Has access to</th></tr></thead>
    <tbody>${users.map((u) => `<tr><td><b>${esc(u.user.email)}</b></td><td>${esc(u.user.name)}</td><td class="muted">${fmtDate(u.user.created_at)}</td>
      <td><div class="tags">${u.subscriptions.map((x) => `<span class="tag ${x.kind === "strategy" ? "tag-amber" : ""}" title="${x.kind}">${esc(x.title)}</span>`).join("")}${u.courses.map((c) => `<span class="tag tag-up">${esc(c.course.title)}</span>`).join("")}${!u.subscriptions.length && !u.courses.length ? `<span class="small muted">nothing yet</span>` : ""}</div></td></tr>`).join("")}</tbody></table></div></div>
  ${footer()}`;
  const say = (id, msg, bad) => { const el = view.querySelector(id); el.textContent = msg; el.style.color = bad ? "var(--down)" : "var(--up)"; };
  view.querySelector("#ad-refresh").addEventListener("click", adminScreen);
  view.querySelector("#ad-out").addEventListener("click", () => { sessionStorage.removeItem("mm_admin"); adminScreen(); });
  view.querySelector("#g-kind").addEventListener("change", (e) => { view.querySelector("#g-item-wrap").innerHTML = itemSel("g-item", e.target.value); });
  view.querySelector("#f-user").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const r = await adminApi("/api/admin/users", { method: "POST", body: { email: view.querySelector("#u-email").value.trim(), name: view.querySelector("#u-name").value.trim(), password: view.querySelector("#u-pass").value } });
      say("#u-msg", `${r.message}: ${r.user.email}. Send them: email ${r.user.email} / password ${view.querySelector("#u-pass").value}`); view.querySelector("#g-email").value = r.user.email; }
    catch (err) { say("#u-msg", err.message, true); }
  });
  const grant = async (method) => {
    try { const r = await adminApi("/api/admin/grant", { method, body: { email: view.querySelector("#g-email").value.trim(), kind: view.querySelector("#g-kind").value, id: view.querySelector("#g-item").value, plan: view.querySelector("#g-plan").value } }); say("#g-msg", r.message + " · " + view.querySelector("#g-item").selectedOptions[0].textContent); }
    catch (err) { say("#g-msg", err.message, true); }
  };
  view.querySelector("#f-grant").addEventListener("submit", (e) => { e.preventDefault(); grant("POST"); });
  view.querySelector("#g-revoke").addEventListener("click", () => grant("DELETE"));
  view.querySelectorAll("[data-lead]").forEach((b) => b.addEventListener("click", async () => {
    const [id, status] = b.dataset.lead.split(":");
    try { await adminApi(`/api/admin/leads/${id}`, { method: "PUT", body: { status } }); adminScreen(); } catch (err) { toast(err.message); }
  }));
  view.querySelectorAll("[data-fill]").forEach((b) => b.addEventListener("click", () => {
    const [email, name, kind, item, plan] = b.dataset.fill.split(":");
    view.querySelector("#u-email").value = email; view.querySelector("#u-name").value = name; view.querySelector("#g-email").value = email;
    view.querySelector("#g-kind").value = kind; view.querySelector("#g-item-wrap").innerHTML = itemSel("g-item", kind); view.querySelector("#g-item").value = item;
    if (plan) view.querySelector("#g-plan").value = plan;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

/* ---------------- python scripts ---------------- */
function scriptsScreen() {
  const cats = ["All", ...new Set(SCRIPTS.map((x) => x.cat))];
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Python scripts</p>
    <h1 class="title split-me">Tools around <em>your trading</em></h1>
    <p class="lede rise" style="--d:400ms">Backtesting, risk, reporting and alerts in Python, built to work with MT5 and the MrMarket EAs. Each script ships with a README and a one-line install, and is delivered as a zip after purchase.</p>
  </section>
  <div class="toolbar">
    <div class="cats">${cats.map((c, i) => `<button class="cat" aria-pressed="${i === 0}" data-cat="${c}">${c}</button>`).join("")}</div>
    <label class="search">${SEARCH_ICON}<input id="q" placeholder="Search scripts" aria-label="Search scripts"></label>
  </div>
  <div class="cards cards-3" id="list"></div>
  <section class="section split-2" style="margin-top:60px">
    <div><h2 class="title">How scripts <em>are delivered</em></h2></div>
    <div class="faq">
      <details><summary>What do I need to run them?</summary><p>Python 3.10 or newer on Windows, macOS or your VPS. Each script lists its own extra packages and installs them with one command.</p></details>
      <details><summary>Do they connect to my MT5 account?</summary><p>Only the ones that say so, and only through the official MetaTrader5 Python package on the same Windows machine as your terminal. Nothing leaves your computer.</p></details>
      <details><summary>Will I get the source code?</summary><p>Yes. Scripts are delivered as readable Python with a README, unlike the compiled EAs and indicators.</p></details>
    </div>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let cat = "All", q = "";
  const box = view.querySelector("#list");
  const draw = () => {
    const list = SCRIPTS.filter((x) => (cat === "All" || x.cat === cat) && (x.t + " " + x.desc).toLowerCase().includes(q));
    box.innerHTML = list.length ? list.map((x) => `<article class="card hover">
      <div class="strat-head"><div><span class="py-badge" aria-hidden="true">Py</span></div>${x.status === "available" ? `<span class="tag tag-up">Available</span>` : `<span class="tag tag-amber">In development</span>`}</div>
      <h3 class="h3">${esc(x.t)}</h3>
      <div class="tags"><span class="tag">${esc(x.cat)}</span>${x.ver ? `<span class="tag">v${esc(x.ver)}</span>` : ""}${(x.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <p class="muted small">${esc(x.desc)}</p>
      <p class="small muted"><b style="color:var(--text)">Needs:</b> ${esc(x.req)}</p>
      <div class="card-foot"><span class="price">${x.price ? `$${x.price}<small> one-time</small>` : "Free"}</span>
        ${x.status !== "available" ? `<button class="btn btn-small btn-quiet" data-waitlist="script:${x.id}">Notify me</button>` : owns("script", x.id) ? dlBtn("script", x.id, "Download .zip", "btn-small") : buyBtn("script", x.id, x.price ? "Buy script" : "Get free", "Purchased ✓", "btn-small")}</div>
    </article>`).join("") : `<div class="empty" style="grid-column:1/-1">No scripts match.</div>`;
  };
  draw();
  view.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat; view.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  view.querySelector("#q").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); draw(); });
}

/* ---------------- execution ---------------- */
function executeScreen() {
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Execution tool</p>
    <h1 class="title split-me">Choose your broker, <em>we'll set up MT5</em></h1>
    <p class="lede rise" style="--d:400ms">Every strategy and indicator on MrMarket runs on MetaTrader 5. Pick the broker you trade with and follow the steps for your computer.</p>
  </section>
  <h2 class="h2" style="margin-bottom:18px"><span class="kicker" style="display:block;margin-bottom:4px">Step 1</span>Select your broker</h2>
  <div class="brokers">
    ${BROKERS.map((b) => `<button class="broker" data-broker="${b.id}" aria-pressed="${state.broker === b.id}">
      <span class="logo" style="background:${b.c}">${b.n.slice(0, 2).toUpperCase()}</span>
      <b>${b.n}</b><span>${b.reg}</span><span>Spreads ${b.spread} · Min deposit ${b.min}</span></button>`).join("")}
  </div>
  <p class="small muted" style="margin-top:14px">Broker not listed? Any broker offering MT5 works. <a href="#/support">Ask a mentor</a>.</p>
  <section id="setup" style="margin-top:70px"></section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  const drawSetup = () => {
    const box = view.querySelector("#setup");
    const b = BROKERS.find((x) => x.id === state.broker);
    if (!b) { box.innerHTML = `<div class="empty"><b style="color:var(--text);font-size:18px">Select a broker above</b>Your personalised MT5 setup steps will appear here.</div>`; return; }
    const server = `${b.n.replace(/\s/g, "")}-MT5Real`;
    box.innerHTML = `
    <div class="split-2">
      <div style="display:grid;gap:18px;align-content:start">
        <span class="kicker">Step 2</span>
        <h2 class="title">Install MT5 for <em>${b.n}</em></h2>
        <p class="lede">About 10 minutes. Your account details stay with ${b.n}. MrMarket only needs the terminal running to deliver strategies.</p>
        <div class="tabs" role="tablist" style="margin-top:6px"><button role="tab" aria-selected="true" data-tab="win">Windows</button><button role="tab" aria-selected="false" data-tab="mac">macOS</button><button role="tab" aria-selected="false" data-tab="mob">Android / iOS</button></div>
        <div class="screen-mock" style="margin-top:10px"><div class="win"><i></i><i></i><i></i><span style="margin-left:8px">MetaTrader 5: Login to trade account</span></div>
          <div class="in"><div class="row"><span>Login</span><span>81234567</span></div><div class="row"><span>Password</span><span>••••••••</span></div><div class="row hl"><span>Server</span><span>${server}</span></div><div class="row"><span>Save password</span><span>✓</span></div></div></div>
      </div>
      <ol class="steps-v" id="steps"></ol>
    </div>`;
    const STEPS = {
      win: [
        ["Open a ${b} live or demo account", `Sign up on the ${b.n} website and choose an MT5 account. Start with demo if you are new.`, `<a class="btn btn-small btn-quiet" href="#" onclick="return false">Open ${b.n} account ↗</a>`],
        ["Download MT5 for Windows", `Download the ${b.n} build of MetaTrader 5. It comes with the right servers preloaded.`, `<a class="btn btn-small" href="#" onclick="return false">Download ${b.n.toLowerCase().replace(/\s/g, "")}5setup.exe</a>`],
        ["Install and launch", "Run the installer, accept the defaults and open MetaTrader 5 when it finishes.", ""],
        ["Log in to your account", "File → Login to Trade Account. Enter the login and password from your broker email, and pick this server:", `<div class="code"><span>${server}</span><button data-copy="${server}">Copy</button></div>`],
        ["Allow algo trading", "Tools → Options → Expert Advisors. Tick 'Allow algorithmic trading', then press the Algo Trading button on the toolbar until it turns green.", ""],
        ["Connect to MrMarket", "Paste your personal key into the MrMarket Connector EA so strategies and indicators can sync.", `<div class="code"><span>MRM-7Q2M-9XK4-B81D</span><button data-copy="MRM-7Q2M-9XK4-B81D">Copy</button></div>`],
      ],
      mac: [
        ["Open a ${b} live or demo account", `Sign up on the ${b.n} website and choose an MT5 account.`, ""],
        ["Download MT5 for macOS", "Download the official MetaTrader 5 .pkg for Mac (Apple silicon and Intel).", `<a class="btn btn-small" href="#" onclick="return false">Download MetaTrader5.pkg</a>`],
        ["Install and allow the app", "Open the .pkg and follow the installer. If macOS blocks it, go to System Settings → Privacy & Security → Open Anyway.", ""],
        ["Log in to your account", "File → Login to Trade Account, then search for your broker server:", `<div class="code"><span>${server}</span><button data-copy="${server}">Copy</button></div>`],
        ["Allow algo trading", "MetaTrader 5 → Settings → Expert Advisors → Allow algorithmic trading.", ""],
        ["Connect to MrMarket", "Paste your personal key into the MrMarket Connector EA.", `<div class="code"><span>MRM-7Q2M-9XK4-B81D</span><button data-copy="MRM-7Q2M-9XK4-B81D">Copy</button></div>`],
      ],
      mob: [
        ["Install MetaTrader 5", "Get MetaTrader 5 from the Play Store or App Store.", `<span class="btn-row"><a class="btn btn-small" href="#" onclick="return false">Google Play</a><a class="btn btn-small" href="#" onclick="return false">App Store</a></span>`],
        ["Add your account", `Settings → New Account → search “${b.n}” and log in.`, `<div class="code"><span>${server}</span><button data-copy="${server}">Copy</button></div>`],
        ["Monitor on the go", "Mobile MT5 cannot run Expert Advisors. Keep strategies on a desktop or a VPS, and use the phone and the MrMarket Algo dashboard to watch them.", `<a class="btn btn-small btn-quiet" href="#/support">Ask about a VPS</a>`],
      ],
    };
    const drawSteps = (os) => {
      view.querySelector("#steps").innerHTML = STEPS[os].map(([t, p, extra], i) => `<li data-i="${i}"><div class="body">
        <h3 class="h3">${t.replace("${b}", b.n)}</h3><p class="muted">${p}</p>${extra}
        <label class="small muted" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-done style="accent-color:var(--up)"> Mark as done</label></div></li>`).join("")
        + `<li class="last"><div class="body"><h3 class="h3">You're ready</h3><p class="muted">Head to Strategies, subscribe, then turn it on in Algo.</p><span class="btn-row"><a class="btn btn-small" href="#/strategies">Browse strategies</a><a class="btn btn-small btn-quiet" href="#/algo">Open Algo dashboard</a></span></div></li>`;
      view.querySelectorAll("[data-done]").forEach((c) => c.addEventListener("change", () => c.closest("li").classList.toggle("done", c.checked)));
      view.querySelectorAll("[data-copy]").forEach((c) => c.addEventListener("click", () => { navigator.clipboard?.writeText(c.dataset.copy).catch(() => {}); toast("Copied"); }));
    };
    drawSteps("win");
    view.querySelectorAll("#setup [data-tab]").forEach((t) => t.addEventListener("click", () => {
      view.querySelectorAll("#setup [data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === t))); drawSteps(t.dataset.tab);
    }));
  };
  drawSetup();
  view.querySelectorAll("[data-broker]").forEach((btn) => btn.addEventListener("click", () => {
    state.broker = btn.dataset.broker;
    view.querySelectorAll("[data-broker]").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
    drawSetup();
    view.querySelector("#setup").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

/* ---------------- algo dashboard ---------------- */
function posPnl(p) {
  const mult = p.sym === "XAUUSD" ? 100 : p.sym === "NAS100" ? 10 : p.sym === "USDJPY" ? 1000 / 1.495 : 100000;
  return (p.side === "buy" ? 1 : -1) * (p.now - p.open) * p.lots * mult;
}
const fmtPx = (sym, v) => v.toFixed(sym === "XAUUSD" ? 2 : sym === "NAS100" ? 0 : sym === "USDJPY" ? 2 : 4);

function algoScreen() {
  view.innerHTML = loadingHTML;
  api("/api/algo").then(drawAlgo).catch((e) => { view.innerHTML = errorHTML(e); });
}
function drawAlgo(d) {
  const stratName = (id) => STRATS.find((x) => x.id === id)?.t ?? id;
  const running = d.strategies.map((x) => ({ ...(STRATS.find((s) => s.id === x.strategy.id) ?? { id: x.strategy.id, t: x.strategy.title, sym: x.strategy.symbol, seed: x.strategy.seed }), on: x.running, lot: x.lot_size, monthPnl: x.month_pnl, tradesToday: x.trades_today }));
  const POSITIONS = d.positions.map((p) => ({ sym: p.symbol, side: p.side, lots: p.lots, open: p.open_price, now: p.current_price, pnl: p.pnl, strat: stratName(p.strategy_id) }));
  const ORDERS = d.orders.map((o) => ({ time: fmtTime(o.placed_at), sym: o.symbol, side: o.side, type: o.type, lots: o.lots, price: o.price, status: o.status, strat: stratName(o.strategy_id) }));
  const HISTORY = d.history.map((h) => ({ sym: h.symbol, side: h.side, lots: h.lots, open: h.open_price, close: h.close_price, pnl: h.pnl, strat: stratName(h.strategy_id), when: `${fmtDate(h.closed_at)} ${fmtTime(h.closed_at).slice(0, 5)}` }));
  const eq = d.summary.equity_curve;
  const openPnl = d.summary.open_pnl;
  const byDay = Object.fromEntries(d.calendar.map((x) => [x.day, x.pnl]));
  const today = new Date(); const todayKey = today.toISOString().slice(0, 10);
  const cal = Array.from({ length: 30 }, (_, i) => { const dt = new Date(today); dt.setDate(today.getDate() - 29 + i); const k = dt.toISOString().slice(0, 10); const wd = dt.getDay(); return { day: dt.getDate(), v: wd === 0 || wd === 6 ? null : (byDay[k] ?? 0) }; });
  const todayPnl = byDay[todayKey] ?? 0;
  const monthPnl = d.summary.month_pnl;
  const stratPnl = (s) => s.monthPnl;
  const nRunning = running.filter((s) => s.on).length;
  const broker = d.broker ? `MT5 ${d.broker.status} · ${esc(d.broker.mt5_server || d.broker.broker_id)} · #${esc(d.broker.mt5_login)}` : `MT5 not linked · <a href="#/execute">set up your broker</a>`;
  view.innerHTML = `
  <div class="dash-head">
    <div style="display:grid;gap:8px"><span class="dot-live">${broker}</span>
      <h1 class="title" style="font-size:clamp(34px,4vw,54px)">Algo <em class="inline">dashboard</em></h1></div>
    <div class="acct">
      <div class="tabs"><button aria-selected="true">Today</button><button aria-selected="false">Week</button><button aria-selected="false">Month</button><button aria-selected="false">All</button></div>
      <button class="btn btn-small btn-quiet" id="kill">${nRunning ? "Pause all" : "Resume all"}</button>
    </div>
  </div>
  <dl class="kpis">
    <div class="kpi hero-kpi"><dt>Account equity</dt><dd>$${Math.round(d.summary.equity || eq.at(-1)).toLocaleString()}</dd><span class="delta" style="color:${monthPnl >= 0 ? "#7be0a4" : "#ff8a8a"}">${money(Math.round(monthPnl), true)} this month</span></div>
    <div class="kpi"><dt>Today's P&amp;L</dt><dd class="${cls(todayPnl)}">${money(Math.round(todayPnl), true)}</dd><span class="delta ${cls(todayPnl)}">${d.summary.equity ? pct(todayPnl / d.summary.equity * 100) : "–"}</span></div>
    <div class="kpi"><dt>Open P&amp;L</dt><dd class="${cls(openPnl)}">${money(Math.round(openPnl), true)}</dd><span class="delta muted">${POSITIONS.length} positions</span></div>
    <div class="kpi"><dt>Running strategies</dt><dd>${nRunning}</dd><span class="delta muted">of ${running.length} subscribed</span></div>
    <div class="kpi"><dt>Balance</dt><dd>$${Math.round(d.summary.balance).toLocaleString()}</dd><span class="delta muted">Closed trades: ${HISTORY.length}</span></div>
  </dl>
  <div class="dash-grid">
    <div class="panel"><div class="panel-head"><h2 class="h3">Equity</h2><span class="tag tag-up">+${pct((eq.at(-1) / eq[0] - 1) * 100, false)} in 90 days</span></div>
      ${chartSVG(eq, { h: 260, labels: ["90d ago", "60d", "30d", "Today"] })}</div>
    <div class="panel"><div class="panel-head"><h2 class="h3">P&amp;L by strategy</h2><span class="small muted">This month</span></div>
      <div class="alloc">${running.map((s) => { const v = stratPnl(s); return `<div class="alloc-row"><span>${esc(s.t)}</span><b class="${cls(v)}">${money(v, true)}</b><div class="bar-t"><i style="--v:${Math.min(100, Math.abs(v) / 24)}%;--c:${v >= 0 ? "var(--up)" : "var(--down)"}"></i></div></div>`; }).join("")}</div></div>
  </div>

  <div class="panel" style="margin-top:12px">
    <div class="panel-head">
      <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="strats">Strategies (${running.length})</button><button role="tab" aria-selected="false" data-tab="pos">Positions (${POSITIONS.length})</button><button role="tab" aria-selected="false" data-tab="ord">Orders (${ORDERS.length})</button><button role="tab" aria-selected="false" data-tab="hist">History</button></div>
      <a class="btn btn-small btn-quiet" href="#/strategies">+ Add strategy</a>
    </div>
    <div data-pane="strats"><div class="table-wrap"><table>
      <thead><tr><th>Strategy</th><th>Symbol</th><th>Status</th><th class="num">Lot size</th><th class="num">Trades today</th><th class="num">Month P&amp;L</th><th>Last 30 days</th><th>Run</th></tr></thead>
      <tbody>${running.map((s) => { const v = stratPnl(s); const on = s.on; return `<tr>
        <td><b><a href="#/strategy/${s.id}" style="text-decoration:none">${esc(s.t)}</a></b></td><td>${s.sym}</td>
        <td><span class="tag ${on ? "tag-up" : ""}" data-status>${on ? "Running" : "Paused"}</span></td>
        <td class="num">${s.lot.toFixed(1)}</td><td class="num">${s.tradesToday}</td>
        <td class="num ${cls(v)}"><b>${money(v, true)}</b></td>
        <td style="width:140px">${sparkSVG(curve(s.seed + 1, 30, v / 300, 3), { h: 30, fill: false })}</td>
        <td><label class="switch"><input type="checkbox" ${on ? "checked" : ""} data-run data-id="${s.id}" aria-label="Run ${esc(s.t)}"><i></i></label></td></tr>`; }).join("")
        || `<tr><td colspan="8" class="muted">No strategies yet. <a href="#/strategies">Subscribe to one</a>.</td></tr>`}</tbody></table></div></div>
    <div data-pane="pos" hidden><div class="table-wrap"><table>
      <thead><tr><th>Symbol</th><th>Side</th><th class="num">Lots</th><th class="num">Open</th><th class="num">Current</th><th class="num">P&amp;L</th><th>Strategy</th><th></th></tr></thead>
      <tbody>${POSITIONS.map((p) => { const v = posPnl(p); return `<tr><td><b>${p.sym}</b></td><td><span class="side ${p.side}">${p.side.toUpperCase()}</span></td><td class="num">${p.lots}</td><td class="num">${fmtPx(p.sym, p.open)}</td><td class="num">${fmtPx(p.sym, p.now)}</td><td class="num ${cls(v)}"><b>${money(Math.round(v), true)}</b></td><td class="muted">${esc(p.strat)}</td><td><button class="btn btn-small btn-quiet" data-toast="Close order sent for ${p.sym}">Close</button></td></tr>`; }).join("")}</tbody></table></div></div>
    <div data-pane="ord" hidden><div class="table-wrap"><table>
      <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Type</th><th class="num">Lots</th><th class="num">Price</th><th>Status</th><th>Strategy</th></tr></thead>
      <tbody>${ORDERS.map((o) => `<tr><td class="muted">${o.time}</td><td><b>${o.sym}</b></td><td><span class="side ${o.side}">${o.side.toUpperCase()}</span></td><td>${o.type}</td><td class="num">${o.lots}</td><td class="num">${fmtPx(o.sym, o.price)}</td><td><span class="tag ${o.status === "Filled" ? "tag-up" : o.status === "Pending" ? "tag-amber" : ""}">${o.status}</span></td><td class="muted">${esc(o.strat)}</td></tr>`).join("")}</tbody></table></div></div>
    <div data-pane="hist" hidden><div class="table-wrap"><table>
      <thead><tr><th>Closed</th><th>Symbol</th><th>Side</th><th class="num">Lots</th><th class="num">Open</th><th class="num">Close</th><th class="num">P&amp;L</th><th>Strategy</th></tr></thead>
      <tbody>${HISTORY.map((h) => `<tr><td class="muted">${h.when}</td><td><b>${h.sym}</b></td><td><span class="side ${h.side}">${h.side.toUpperCase()}</span></td><td class="num">${h.lots}</td><td class="num">${fmtPx(h.sym, h.open)}</td><td class="num">${fmtPx(h.sym, h.close)}</td><td class="num ${cls(h.pnl)}"><b>${money(h.pnl, true)}</b></td><td class="muted">${esc(h.strat)}</td></tr>`).join("")}</tbody></table></div></div>
  </div>

  <div class="dash-grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="panel"><div class="panel-head"><h2 class="h3">Daily P&amp;L, last 30 days</h2><span class="small muted">Weekends closed</span></div>
      <div class="cal">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="h">${d}</span>`).join("")}
        ${cal.map(({ day, v }) => v === null ? `<span style="background:#f6f6f6">${day}</span>` : `<span title="${money(v, true)}" style="background:${v >= 0 ? `rgba(31,157,85,${0.15 + Math.min(.7, v / 900)})` : `rgba(214,60,60,${0.15 + Math.min(.7, -v / 600)})`}">${day}</span>`).join("")}</div></div>
    <div class="panel"><div class="panel-head"><h2 class="h3">Activity</h2><span class="dot-live">Live</span></div>
      <ul class="feed">${d.activity.map((a) => { const t = a.tag.toLowerCase(); const badge = t === "buy" || t === "sell" ? `<span class="side ${t}">${esc(a.tag)}</span>` : `<span class="tag ${t === "tp" || t === "run" || t === "sub" ? "tag-up" : t === "pause" ? "tag-down" : "tag-amber"}">${esc(a.tag)}</span>`; return `<li>${badge}<span>${esc(a.text)}</span><time>${fmtTime(a.at).slice(0, 5)}</time></li>`; }).join("") || `<li><span class="tag">—</span><span>No activity yet</span></li>`}
      </ul></div>
  </div>
  ${footer()}`;
  wireTabs();
  view.querySelectorAll(".dash-head .tabs button").forEach((b) => b.addEventListener("click", () => b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)))));
  const paint = (c) => { const tag = c.closest("tr").querySelector("[data-status]"); tag.textContent = c.checked ? "Running" : "Paused"; tag.classList.toggle("tag-up", c.checked); };
  view.querySelectorAll("[data-run]").forEach((c) => c.addEventListener("change", () => {
    paint(c);
    api(`/api/algo/strategies/${c.dataset.id}`, { method: "PUT", body: { running: c.checked } })
      .then((r) => toast(r.message)).catch((e) => { c.checked = !c.checked; paint(c); toast(e.message); });
  }));
  view.querySelector("#kill").addEventListener("click", (e) => {
    const pause = e.target.textContent === "Pause all";
    e.target.disabled = true;
    api(`/api/algo/${pause ? "pause-all" : "resume-all"}`, { method: "POST" })
      .then((r) => { toast(r.message); api("/api/algo").then(drawAlgo); }).catch((err) => { toast(err.message); e.target.disabled = false; });
  });
}

/* ---------------- handholding ---------------- */
function supportScreen() {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(2026, 9, 2 + i); return [d.toLocaleDateString("en", { weekday: "short" }), d.getDate()]; });
  const slots = ["10:00", "11:30", "13:00", "15:00", "16:30", "18:00", "19:30", "21:00"];
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Handholding</p>
    <h1 class="title split-me">You won't <em>trade alone</em></h1>
    <p class="lede rise" style="--d:400ms">From the first MT5 install to your hundredth live trade, a real person is a message away.</p>
  </section>
  <div class="tiers">
    <article class="card tier"><span class="kicker">Community</span><span class="price">Free</span><p class="muted">For everyone with an MrMarket account.</p>
      <ul class="checklist"><li>Trader community and daily market notes</li><li>Weekly group Q&amp;A</li><li>Setup guides and help centre</li></ul>
      ${buyBtn("plan", "community", "Join community", "Current plan ✓", "btn-quiet")}</article>
    <article class="card card-dark tier"><span class="kicker">Mentor plan · Most chosen</span><span class="price">$99<small style="color:#b5b5b5"> /month</small></span><p class="muted">A dedicated mentor who knows your account and goals.</p>
      <ul class="checklist"><li>2 one-to-one calls a month</li><li>Strategy selection and risk review</li><li>Priority WhatsApp support</li><li>Free MT5 + VPS setup</li></ul>
      ${buyBtn("plan", "mentor", "Get a mentor", "Current plan ✓")}</article>
    <article class="card tier"><span class="kicker">Pro desk</span><span class="price">$299<small> /month</small></span><p class="muted">For traders running several algos with larger capital.</p>
      <ul class="checklist"><li>Weekly calls with a senior trader</li><li>Portfolio-level drawdown monitoring</li><li>Custom strategy tweaks</li><li>Same-day issue resolution</li></ul>
      ${buyBtn("plan", "pro", "Get Pro desk", "Current plan ✓", "btn-quiet")}</article>
  </div>

  <section class="section split-2">
    <div style="display:grid;gap:18px;align-content:start">
      <h2 class="title">Book a free <em>onboarding call</em></h2>
      <p class="lede">30 minutes on video. We look at your experience and capital, then set up your broker, MT5 and a first strategy together.</p>
      <div style="display:grid;gap:14px;margin-top:10px">${MENTORS.map((m) => `<div class="mentor"><span class="avatar">${m.i}</span><div><b>${m.n}</b><p class="small muted">${m.r}</p></div></div>`).join("")}</div>
    </div>
    <div class="sheet" style="display:grid;gap:20px">
      <div><p class="small muted" style="margin-bottom:10px">Choose a day · October 2026</p>
        <div class="days">${days.map(([w, d], i) => `<button class="day" aria-pressed="${i === 0}" data-day="${d}"><span>${w}</span><b>${d}</b></button>`).join("")}</div></div>
      <div><p class="small muted" style="margin-bottom:10px">Choose a time (IST)</p>
        <div class="slots">${slots.map((s, i) => `<button class="slot" ${[1, 4].includes(i) ? "disabled" : ""} aria-pressed="false" data-slot="${s}">${s}</button>`).join("")}</div></div>
      <button class="btn" id="book">Confirm booking</button>
    </div>
  </section>
  <section class="section split-2">
    <div><h2 class="title">Help <em>when it matters</em></h2></div>
    <div class="faq">
      <details><summary>My strategy isn't placing trades</summary><p>Check the Algo Trading button in MT5 is green and the terminal is open. If you use a VPS, confirm it is running. Still stuck? Message support with a screenshot of the Experts tab.</p></details>
      <details><summary>Do I need a VPS?</summary><p>Strategies only run while MT5 is open. A VPS keeps it running 24/5 even when your computer is off. Mentor plans include VPS setup.</p></details>
      <details><summary>How do I change my risk per trade?</summary><p>Open the strategy's settings in MT5 or ask your mentor. We recommend no more than 1% risk per trade when starting.</p></details>
    </div>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  view.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => view.querySelectorAll("[data-day]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)))));
  view.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => view.querySelectorAll("[data-slot]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)))));
  view.querySelector("#book").addEventListener("click", () => {
    const d = view.querySelector('[data-day][aria-pressed="true"]')?.dataset.day, s = view.querySelector('[data-slot][aria-pressed="true"]')?.dataset.slot;
    if (!s) { toast("Pick a time first"); return; }
    if (needLogin()) return;
    api("/api/bookings", { method: "POST", body: { mentor_id: "", scheduled_at: `${d} Oct 2026, ${s} IST`, note: "" } })
      .then(() => loadAccount()).then(() => toast(`Booked for ${d} Oct at ${s} IST. See My account.`))
      .catch((e) => toast(e.message));
  });
}

/* ---------------- my account ---------------- */
function accountScreen() {
  const subs = [
    ...Object.entries(acct.subs).map(([id, v]) => ({ kind: "strategy", id, title: STRATS.find((x) => x.id === id)?.t ?? v.title, type: "Strategy", ...v })),
    ...Object.entries(acct.inds).map(([id, v]) => ({ kind: "indicator", id, title: INDICATORS.find((x) => x.id === id)?.t ?? v.title, type: "Indicator", ...v })),
    ...Object.entries(acct.scripts).map(([id, v]) => ({ kind: "script", id, title: SCRIPTS.find((x) => x.id === id)?.t ?? v.title, type: "Script", ...v })),
  ];
  const monthly = (v) => v.plan === "Quarterly" ? v.price / 3 : v.plan === "Yearly" ? v.price / 12 : v.plan === "One-time" ? 0 : v.price;
  const spend = subs.reduce((a, v) => a + monthly(v), 0) + (acct.plan?.price ?? 0);
  const courses = Object.entries(acct.courses).map(([id, v]) => ({ c: COURSES.find((x) => x.id === id), ...v })).filter((x) => x.c);
  const lives = Object.keys(acct.live).map((i) => LIVE.find((l) => l.id === Number(i))).filter(Boolean);
  const upcoming = lives.length + acct.bookings.length;
  view.innerHTML = `
  <div class="dash-head">
    <div class="mentor"><span class="avatar" style="width:64px;height:64px;font-size:20px">${initials(me().name)}</span>
      <div><h1 class="title" style="font-size:clamp(32px,4vw,52px)">My <em class="inline">account</em></h1><p class="muted small">${esc(me().name ?? "")} · ${esc(me().email ?? "")} · Member since ${fmtDate(me().created_at, true)}</p></div></div>
    <div class="btn-row"><a class="btn btn-small btn-quiet" href="#/algo">Algo dashboard</a><button class="btn btn-small btn-quiet" data-logout>Log out</button></div>
  </div>
  <dl class="kpis">
    <div class="kpi hero-kpi"><dt>Active subscriptions</dt><dd>${subs.length + (acct.plan ? 1 : 0)}</dd><span class="delta" style="color:#ffb066">${subs.filter((x) => x.kind === "strategy").length} strategies · ${subs.filter((x) => x.kind === "indicator").length} indicators</span></div>
    <div class="kpi"><dt>Monthly spend</dt><dd>$${Math.round(spend)}</dd><span class="delta muted">Next bill 1 Nov 2026</span></div>
    <div class="kpi"><dt>Courses</dt><dd>${courses.length}</dd><span class="delta muted">${courses.filter((x) => x.prog === 100).length} completed</span></div>
    <div class="kpi"><dt>Upcoming sessions</dt><dd>${upcoming}</dd><span class="delta muted">Live classes and calls</span></div>
    <div class="kpi"><dt>Support plan</dt><dd style="font-size:24px;padding-top:6px">${acct.plan ? esc(acct.plan.name) : "None"}</dd><span class="delta muted">${acct.plan ? (acct.plan.price ? `$${acct.plan.price}/month` : "Free") : `<a href="#/support">Choose a plan</a>`}</span></div>
  </dl>

  <div class="panel" style="margin-top:12px">
    <div class="panel-head">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" data-tab="a-subs">Subscriptions (${subs.length + (acct.plan ? 1 : 0)})</button>
        <button role="tab" aria-selected="false" data-tab="a-courses">Courses (${courses.length})</button>
        <button role="tab" aria-selected="false" data-tab="a-sessions">Sessions (${upcoming})</button>
        <button role="tab" aria-selected="false" data-tab="a-bill">Billing (${acct.orders.length})</button>
      </div>
      <a class="btn btn-small btn-quiet" href="#/strategies">+ Browse more</a>
    </div>

    <div data-pane="a-subs">${subs.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Billing</th><th>Since</th><th class="num">Price</th><th>Status</th><th></th></tr></thead>
      <tbody>${subs.map((v) => `<tr>
        <td><b>${v.kind === "strategy" ? `<a href="#/strategy/${v.id}" style="text-decoration:none">${esc(v.title)}</a>` : esc(v.title)}</b></td>
        <td><span class="tag ${v.kind === "strategy" ? "tag-amber" : ""}">${v.type}</span></td>
        <td>${v.price ? v.plan : "Free"}</td><td class="muted">${v.since}</td>
        <td class="num"><b>${v.price ? `$${v.price}` : "Free"}</b></td>
        <td><span class="tag tag-up">Active</span></td>
        <td><span class="btn-row">${dlBtn(v.kind, v.id, v.kind === "script" ? "Download" : "MT5 file", "btn-small btn-quiet")}<button class="link-btn" data-cancel="${v.kind}:${v.id}">Cancel</button></span></td></tr>`).join("")}
      ${acct.plan ? `<tr><td><b>${esc(acct.plan.name)}</b></td><td><span class="tag">Support plan</span></td><td>${acct.plan.price ? "Monthly" : "Free"}</td><td class="muted">${acct.plan.since}</td><td class="num"><b>${acct.plan.price ? `$${acct.plan.price}` : "Free"}</b></td><td><span class="tag tag-up">Active</span></td><td><button class="link-btn" data-cancel="plan:${acct.plan.id}">Cancel</button></td></tr>` : ""}
      </tbody></table></div>` : `<div class="empty"><b style="color:var(--text)">No subscriptions yet</b><a class="btn btn-small" href="#/strategies">Browse strategies</a></div>`}</div>

    <div data-pane="a-courses" hidden>${courses.length ? `<div class="cards cards-3">${courses.map(({ c, prog, since }) => `<article class="card">
      <div class="thumb">${thumbSVG(c.hue, COURSES.indexOf(c) + 3)}<span class="play" aria-hidden="true"></span><span class="dur">${c.dur}</span></div>
      <h3 class="h3">${esc(c.t)}</h3><p class="small muted">${esc(c.by)} · Enrolled ${since}</p>
      <div class="progress" style="--v:${prog}%"><i></i></div>
      <div class="card-foot"><span class="small muted">${prog === 100 ? "Completed" : prog ? `${prog}% complete` : "Not started"}</span><a class="btn btn-small" href="#/course/${c.id}">${prog === 100 ? "Review" : prog ? "Continue" : "Start"}</a></div>
    </article>`).join("")}</div>` : `<div class="empty"><b style="color:var(--text)">No courses yet</b><a class="btn btn-small" href="#/learn">Browse courses</a></div>`}</div>

    <div data-pane="a-sessions" hidden>${upcoming ? `<ul>
      ${acct.bookings.map((b) => `<li class="live"><div class="date"><b>${b.when.split(" ")[0]}</b><span>Oct</span></div><div><span class="tag tag-amber">Onboarding call</span><h3 class="h3" style="margin-top:8px">${esc(b.what)}</h3><div class="live-meta"><span>${esc(b.when)}</span><span>Video call link sent by email</span></div></div><button class="btn btn-small btn-quiet" data-toast="Reschedule request sent">Reschedule</button></li>`).join("")}
      ${lives.map((l) => `<li class="live"><div class="date"><b>${l.d}</b><span>${l.m}</span></div><div><span class="tag tag-amber">${l.kind}</span><h3 class="h3" style="margin-top:8px">${esc(l.t)}</h3><div class="live-meta"><span>with ${esc(l.by)}</span><span>${l.time}</span><span>${l.len}</span></div></div><button class="btn btn-small btn-quiet" data-toast="Added to your calendar">Add to calendar</button></li>`).join("")}
    </ul>` : `<div class="empty"><b style="color:var(--text)">Nothing booked</b><span class="btn-row"><a class="btn btn-small" href="#/learn">Live courses</a><a class="btn btn-small btn-quiet" href="#/support">Book a call</a></span></div>`}</div>

    <div data-pane="a-bill" hidden><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${acct.orders.map((o, i) => `<tr><td class="muted">${o.date}</td><td><b>${esc(o.item)}</b></td><td style="text-transform:capitalize">${o.kind === "live" ? "Live session" : o.kind}</td><td class="num"><b>${o.amount ? `$${o.amount}` : "Free"}</b>${o.amount ? `<small class="muted">${o.period}</small>` : ""}</td><td><span class="tag tag-up">${o.amount ? "Paid" : "Confirmed"}</span></td><td>${o.amount ? `<button class="link-btn" data-toast="Invoice INV-${2026100 + acct.orders.length - i} downloaded">Invoice</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted" style="margin-top:12px">Payments are handled by the MrMarket team. Need an invoice or a change? <a href="#/support">Message support</a>.</p></div>
  </div>
  ${footer()}`;
  wireTabs();
  view.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => {
    const [kind, id] = b.dataset.cancel.split(":");
    b.disabled = true;
    api(`/api/subscriptions/${kind}/${id}`, { method: "DELETE" }).then(() => loadAccount())
      .then(() => { toast("Subscription cancelled"); accountScreen(); }).catch((e) => { toast(e.message); b.disabled = false; });
  }));
}

/* ---------------- login ---------------- */
const authed = () => Boolean(token());
function setAuthed(on, tok, user) {
  try {
    if (on) { localStorage.setItem("mm_token", tok); localStorage.setItem("mm_user", JSON.stringify(user)); }
    else { localStorage.removeItem("mm_token"); localStorage.removeItem("mm_user"); }
  } catch { /* private mode */ }
}

function loginScreen() {
  const next = new URLSearchParams(location.hash.split("?")[1] ?? "").get("next") || "algo";
  view.innerHTML = `
  <section class="login">
    <div class="login-copy">
      <p class="eyebrow rise"><i></i>Welcome back</p>
      <h1 class="title split-me">Log in to <em>your desk</em></h1>
      <p class="lede rise" style="--d:400ms">Your courses, subscriptions, MT5 connection and live algo dashboard, in one account.</p>
      <ul class="checklist rise" style="--d:550ms"><li>Track every strategy's P&amp;L live</li><li>Resume courses where you left off</li><li>Message your mentor directly</li></ul>
    </div>
    <form class="sheet login-form rise" style="--d:200ms" novalidate>
      <h2 class="h2">Log in</h2>
      <p class="small muted">Use the login we sent you after your purchase.</p>
      <label class="field"><span>Email</span><input class="inp" type="email" id="email" autocomplete="username" placeholder="you@example.com" required></label>
      <label class="field"><span>Password</span>
        <span class="pw"><input class="inp" type="password" id="pass" autocomplete="current-password" placeholder="••••••••" required><button type="button" id="toggle-pw" aria-label="Show password">Show</button></span></label>
      <div class="login-row"><label class="small"><input type="checkbox" checked style="accent-color:var(--amber)"> Remember me</label><a class="small" href="#/support">Forgot password? Message support</a></div>
      <p class="form-error" id="err" role="alert" hidden></p>
      <button class="btn" type="submit">Log in</button>
      <div class="or"><span>no account yet?</span></div>
      <p class="small muted" style="text-align:center">Access is sent after purchase. Pick an EA, course or script and press <b>Request access</b>, or <a href="#/support">book a free onboarding call</a>.</p>
    </form>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  const email = view.querySelector("#email"), pass = view.querySelector("#pass"), err = view.querySelector("#err");
  view.querySelector("#toggle-pw").addEventListener("click", (e) => {
    const show = pass.type === "password"; pass.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show";
  });
  view.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = "Logging in…"; err.hidden = true;
    try {
      const r = await api("/api/auth/login", { method: "POST", body: { email: email.value.trim().toLowerCase(), password: pass.value } });
      setAuthed(true, r.token, r.user);
      await loadAccount();
      toast(`Welcome back, ${r.user.name}`); location.hash = `#/${next}`;
    } catch (ex) {
      err.textContent = ex.status === 401 ? "Email or password is incorrect." : ex.message; err.hidden = false;
      btn.disabled = false; btn.textContent = "Log in";
    }
  });
}

/* ---------------- router ---------------- */
const NAV = [["learn", "#/learn", "Learn"], ["indicators", "#/indicators", "Indicators"], ["strategies", "#/strategies", "Strategies"], ["scripts", "#/scripts", "Scripts"], ["execute", "#/execute", "Execution"], ["algo", "#/algo", "Algo"], ["support", "#/support", "Handholding"], ["about", "#/about", "About"]];
const ROUTES = [
  [/^#\/learn$/, learnScreen, 1, "learn"],
  [/^#\/indicators$/, indicatorsScreen, 1, "indicators"],
  [/^#\/strategies$/, strategiesScreen, 1, "strategies"],
  [/^#\/strategy\/([\w-]+)$/, strategyScreen, 2, "strategies"],
  [/^#\/indicator\/([\w-]+)$/, indicatorScreen, 2, "indicators"],
  [/^#\/course\/([\w-]+)$/, courseScreen, 2, "learn"],
  [/^#\/scripts$/, scriptsScreen, 1, "scripts"],
  [/^#\/about$/, aboutScreen, 1, "about"],
  [/^#\/admin/, adminScreen, 1, ""],
  [/^#\/execute$/, executeScreen, 1, "execute"],
  [/^#\/algo$/, algoScreen, 1, "algo"],
  [/^#\/support$/, supportScreen, 1, "support"],
  [/^#\/login/, loginScreen, 1, ""],
  [/^#\/account$/, accountScreen, 1, ""],
  [/.*/, homeScreen, 0, ""],
];

function renderHeader(nav) {
  const el = document.getElementById("nav");
  el.innerHTML = NAV.map(([k, href, label]) => `<a href="${href}" ${k === nav ? 'aria-current="page"' : ""}>${label}</a>`).join("");
  el.classList.remove("open");
  document.getElementById("bar-right").innerHTML = authed()
    ? `<a class="btn btn-quiet btn-small hide-sm" href="#/algo">Dashboard</a>
       <a class="user" href="#/account" title="My account"><span class="avatar">${initials(me().name)}</span><span class="user-name">My account</span></a>`
    : `<a class="btn btn-small" href="#/login">Log in</a>`;

  document.getElementById("menu-btn").setAttribute("aria-expanded", "false");
}
document.getElementById("menu-btn").addEventListener("click", (e) => {
  const open = document.getElementById("nav").classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", String(open));
});

/* generic toast buttons */
view.addEventListener("click", (e) => { const b = e.target.closest("[data-toast]"); if (b) toast(b.dataset.toast); });
view.addEventListener("click", (e) => { if (e.target.closest("[data-logout]")) { setAuthed(false); loadAccount(); toast("Logged out"); location.hash = "#/"; } });

/* download buttons */
view.addEventListener("click", (e) => { const b = e.target.closest("[data-download]"); if (!b || b.disabled) return; const [kind, id] = b.dataset.download.split(":"); downloadItem(kind, id, b); });

/* waitlist buttons */
view.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-waitlist]");
  if (!b || b.disabled || needLogin()) return;
  const [kind, id] = b.dataset.waitlist.split(":");
  b.disabled = true;
  try { const r = await api("/api/waitlist", { method: "POST", body: { kind, id } }); b.textContent = "On the list ✓"; toast(r.message); }
  catch (err) { toast(err.message); b.disabled = false; }
});

/* purchase buttons: buy once, then the button links to My account */
view.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-buy]");
  if (!b || b.disabled) return;
  const [kind, raw] = b.dataset.buy.split(":");
  const id = kind === "live" ? Number(raw) : raw;
  if (owns(kind, id)) { location.hash = "#/account"; return; }
  let plan = "Monthly", price;
  const picked = b.closest(".sticky")?.querySelector('input[name="plan"]:checked');
  if (picked) { plan = picked.value; price = Number(picked.dataset.price); }
  if (!(await purchase(kind, id, plan, price))) return;
  if (kind === "script" && location.hash === "#/scripts") { toast(BOUGHT_MSG[kind]); scriptsScreen(); return; }
  if (kind === "course" && location.hash === `#/course/${id}`) { toast("Enrolled. All lessons are unlocked."); courseScreen([null, id]); return; }
  view.querySelectorAll("[data-buy]").forEach((x) => {
    const [k, i] = x.dataset.buy.split(":");
    const on = owns(k, k === "live" ? Number(i) : i);
    x.classList.toggle("is-on", on); x.textContent = on ? x.dataset.owned : x.dataset.label;
  });
  toast(BOUGHT_MSG[kind]);
});

let depth = 0, order = 0;
async function swap(dir, render) {
  document.documentElement.dataset.dir = dir;
  if (document.startViewTransition) {
    const tr = document.startViewTransition(() => { render(); window.scrollTo(0, 0); });
    tr.ready.catch(() => { /* skipped */ }); tr.finished.catch(() => { /* a newer transition replaced this one */ });
    try { await tr.updateCallbackDone; } catch { /* ignore */ }
  } else {
    document.documentElement.classList.add("no-vt");
    render(); window.scrollTo(0, 0);
  }
}
function route() {
  const hash = location.hash || "#/";
  const gated = hash.match(/^#\/(algo|account)$/);
  if (gated && !authed()) { location.hash = `#/login?next=${gated[1]}`; return; }
  const [re, render, level, nav] = ROUTES.find(([r]) => r.test(hash));
  const idx = ROUTES.findIndex(([r]) => r.test(hash));
  const dir = level > depth || (level === depth && idx >= order) ? "forward" : "back";
  depth = level; order = idx;
  renderHeader(nav);
  swap(dir, () => render(hash.match(re)));
  view.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);
/* ---------------- background market chart ---------------- */
function drawBgChart() {
  const W = 1600, H = 900, N = 110, cw = W / N, r = rng(2026);
  let v = 520; const c = [];
  for (let i = 0; i < N; i++) {
    const o = v, cl = o + (r() - 0.46) * 34 + Math.sin(i / 9) * 14, hi = Math.max(o, cl) + r() * 16, lo = Math.min(o, cl) - r() * 16;
    c.push([o, cl, hi, lo]); v = Math.min(760, Math.max(160, cl - 1.6));
  }
  const lo0 = Math.min(...c.map((k) => k[3])), hi0 = Math.max(...c.map((k) => k[2]));
  const y = (p) => H * 0.82 - ((p - lo0) / (hi0 - lo0)) * H * 0.62;
  const ma = (n) => c.map((_, i) => { const s = c.slice(Math.max(0, i - n), i + 1); return s.reduce((a, b) => a + b[1], 0) / s.length; });
  const line = (arr) => arr.map((p, i) => `${i ? "L" : "M"}${(i * cw + cw / 2).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const grid = Array.from({ length: 13 }, (_, i) => `<line x1="0" x2="${W}" y1="${i * 75}" y2="${i * 75}"/>`).join("")
    + Array.from({ length: 17 }, (_, i) => `<line y1="0" y2="${H}" x1="${i * 100}" x2="${i * 100}"/>`).join("");
  const candles = c.map(([o, cl, hi, lo], i) => {
    const x = i * cw + cw / 2, up = cl >= o, col = up ? "#1f9d55" : "#d63c3c";
    return `<line x1="${x}" x2="${x}" y1="${y(hi)}" y2="${y(lo)}" stroke="${col}"/><rect x="${x - cw * 0.3}" y="${y(Math.max(o, cl))}" width="${cw * 0.6}" height="${Math.max(2, Math.abs(y(cl) - y(o)))}" fill="${col}"/>`;
  }).join("");
  const vol = c.map(([o, cl], i) => `<rect x="${i * cw + cw * 0.2}" y="${H - 20 - r() * 70}" width="${cw * 0.6}" height="90" fill="${cl >= o ? "#1f9d55" : "#d63c3c"}"/>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
    <g stroke="#000" stroke-opacity=".045" stroke-width="1">${grid}</g>
    <g opacity=".05">${vol}</g>
    <g opacity=".2">${candles}</g>
    <path d="${line(ma(9))}" fill="none" stroke="#f07c12" stroke-opacity=".4" stroke-width="2.5"/>
    <path d="${line(ma(26))}" fill="none" stroke="#1f6fd1" stroke-opacity=".25" stroke-width="2"/></svg>`;
  document.getElementById("bg-chart").innerHTML = `<div class="bg-track">${svg}${svg}</div>`;
}
drawBgChart();
view.innerHTML = loadingHTML;
Promise.allSettled([loadCatalog(), loadAccount()]).then(([cat]) => {
  if (cat.status === "rejected") toast("Showing offline catalogue. " + cat.reason.message);
  route();
});
