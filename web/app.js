
const view = document.getElementById("view");
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
const COURSES = [
  { id: "price-action", t: "Price Action Mastery", by: "Aseem Singhal", lvl: "Beginner", lessons: 42, dur: "9h 20m", price: 49, rating: 4.9, students: 12840, prog: 64, hue: 24 },
  { id: "mt5-basics", t: "MT5 from Zero to Live", by: "Rohit Mehra", lvl: "Beginner", lessons: 28, dur: "5h 10m", price: 0, rating: 4.8, students: 20113, prog: 100, hue: 210 },
  { id: "risk", t: "Risk Management & Position Sizing", by: "Aseem Singhal", lvl: "Intermediate", lessons: 18, dur: "3h 45m", price: 39, rating: 4.9, students: 8402, prog: 20, hue: 150 },
  { id: "smc", t: "Smart Money Concepts", by: "Kavya Iyer", lvl: "Intermediate", lessons: 36, dur: "8h 05m", price: 79, rating: 4.7, students: 6120, prog: 0, hue: 280 },
  { id: "algo-mql5", t: "Build Your First EA in MQL5", by: "Neel Shah", lvl: "Advanced", lessons: 51, dur: "12h 30m", price: 129, rating: 4.8, students: 3390, prog: 0, hue: 340 },
  { id: "psychology", t: "Trading Psychology", by: "Dr. Meera Rao", lvl: "All levels", lessons: 14, dur: "2h 50m", price: 29, rating: 4.9, students: 9870, prog: 0, hue: 45 },
];
const LIVE = [
  { d: 4, m: "Oct", t: "Gold (XAUUSD) Live Market Session", by: "Aseem Singhal", time: "7:00 PM IST", len: "90 min", seats: 38, kind: "Live trading", live: true },
  { d: 7, m: "Oct", t: "Q&A: Fixing Your Strategy Drawdown", by: "Neel Shah", time: "8:30 PM IST", len: "60 min", seats: 112, kind: "Webinar" },
  { d: 12, m: "Oct", t: "6-Week Forex Bootcamp, Cohort 14", by: "Kavya Iyer", time: "Sat & Sun, 10 AM", len: "6 weeks", seats: 9, kind: "Cohort" },
  { d: 18, m: "Oct", t: "Reading the Economic Calendar", by: "Rohit Mehra", time: "6:00 PM IST", len: "75 min", seats: 64, kind: "Webinar" },
];
const INDICATORS = [
  { id: "trend-matrix", t: "Trend Matrix Pro", cat: "Trend", plat: "MT5", desc: "Multi-timeframe trend dashboard that colours bias from M5 to D1 in one panel.", price: 19, rating: 4.8, subs: 4210, kind: "ribbon" },
  { id: "smart-sr", t: "Smart S/R Zones", cat: "Levels", plat: "MT5", desc: "Auto-draws supply and demand zones and fades them as price tests them.", price: 15, rating: 4.7, subs: 3880, kind: "zones" },
  { id: "volume-delta", t: "Volume Delta Histogram", cat: "Volume", plat: "MT5", desc: "Buying versus selling pressure per candle, with divergence alerts.", price: 12, rating: 4.6, subs: 2105, kind: "hist" },
  { id: "session-box", t: "Session Range Box", cat: "Levels", plat: "MT5", desc: "Asia, London and New York ranges boxed, with breakout arrows.", price: 0, rating: 4.9, subs: 9640, kind: "box" },
  { id: "rsi-div", t: "RSI Divergence Scanner", cat: "Oscillator", plat: "MT5", desc: "Scans 28 pairs for regular and hidden divergence and sends push alerts.", price: 14, rating: 4.5, subs: 1970, kind: "osc" },
  { id: "atr-stop", t: "ATR Trailing Stop", cat: "Trend", plat: "MT5", desc: "Volatility-adjusted stop line that flips colour on trend change.", price: 9, rating: 4.7, subs: 3312, kind: "ribbon" },
];
const STRATS = [
  { id: "gold-breakout", t: "Gold London Breakout", sym: "XAUUSD", tf: "M15", style: "Breakout", risk: "Medium", ret: 38.4, dd: 9.8, win: 58, pf: 1.92, trades: 412, min: 1000, price: 49, subs: 1840, seed: 7, by: "Aseem Singhal" },
  { id: "euro-mean", t: "EURUSD Mean Reversion", sym: "EURUSD", tf: "H1", style: "Mean reversion", risk: "Low", ret: 18.2, dd: 4.6, win: 66, pf: 1.71, trades: 688, min: 500, price: 29, subs: 2410, seed: 11, by: "Neel Shah" },
  { id: "nas-momentum", t: "NAS100 Momentum Rider", sym: "NAS100", tf: "M30", style: "Momentum", risk: "High", ret: 61.7, dd: 17.3, win: 47, pf: 2.08, trades: 296, min: 2000, price: 79, subs: 960, seed: 23, by: "Kavya Iyer" },
  { id: "carry-grid", t: "Asian Session Scalper", sym: "USDJPY", tf: "M5", style: "Scalping", risk: "Medium", ret: 27.9, dd: 8.1, win: 71, pf: 1.55, trades: 1930, min: 500, price: 39, subs: 1325, seed: 5, by: "Rohit Mehra" },
  { id: "gbp-swing", t: "GBP Swing Trend", sym: "GBPUSD", tf: "H4", style: "Trend following", risk: "Low", ret: 22.5, dd: 6.2, win: 44, pf: 1.88, trades: 164, min: 1000, price: 29, subs: 870, seed: 31, by: "Aseem Singhal" },
  { id: "btc-range", t: "BTC Weekend Range", sym: "BTCUSD", tf: "H1", style: "Range", risk: "High", ret: 44.1, dd: 15.4, win: 55, pf: 1.67, trades: 238, min: 1500, price: 59, subs: 540, seed: 43, by: "Neel Shah" },
];
const BROKERS = [
  { id: "exness", n: "Exness", c: "#1a1a1a", reg: "FSCA, CySEC", spread: "from 0.0 pips", min: "$10" },
  { id: "icmarkets", n: "IC Markets", c: "#1f6fd1", reg: "ASIC, CySEC", spread: "from 0.0 pips", min: "$200" },
  { id: "xm", n: "XM", c: "#c0392b", reg: "CySEC, ASIC", spread: "from 0.6 pips", min: "$5" },
  { id: "pepperstone", n: "Pepperstone", c: "#2c3e50", reg: "FCA, ASIC", spread: "from 0.0 pips", min: "$0" },
  { id: "vantage", n: "Vantage", c: "#0e7c86", reg: "ASIC, FCA", spread: "from 0.0 pips", min: "$50" },
  { id: "fbs", n: "FBS", c: "#2e9e4f", reg: "CySEC, ASIC", spread: "from 0.7 pips", min: "$5" },
  { id: "octa", n: "Octa", c: "#6c3fc5", reg: "CySEC", spread: "from 0.6 pips", min: "$25" },
  { id: "tickmill", n: "Tickmill", c: "#d4650a", reg: "FCA, CySEC", spread: "from 0.0 pips", min: "$100" },
];
const POSITIONS = [
  { sym: "XAUUSD", side: "buy", lots: 0.5, open: 2652.4, now: 2667.9, strat: "Gold London Breakout" },
  { sym: "EURUSD", side: "sell", lots: 1.2, open: 1.0912, now: 1.0897, strat: "EURUSD Mean Reversion" },
  { sym: "NAS100", side: "buy", lots: 0.3, open: 20140, now: 20098, strat: "NAS100 Momentum Rider" },
  { sym: "USDJPY", side: "buy", lots: 0.8, open: 149.32, now: 149.51, strat: "Asian Session Scalper" },
  { sym: "GBPUSD", side: "sell", lots: 0.6, open: 1.3088, now: 1.3102, strat: "GBP Swing Trend" },
];
const ORDERS = [
  { time: "14:32:08", sym: "XAUUSD", side: "buy", type: "Market", lots: 0.5, price: 2652.4, status: "Filled", strat: "Gold London Breakout" },
  { time: "13:58:41", sym: "EURUSD", side: "sell", type: "Limit", lots: 1.2, price: 1.0912, status: "Filled", strat: "EURUSD Mean Reversion" },
  { time: "13:15:02", sym: "NAS100", side: "buy", type: "Stop", lots: 0.3, price: 20140, status: "Filled", strat: "NAS100 Momentum Rider" },
  { time: "12:47:19", sym: "XAUUSD", side: "sell", type: "Limit", lots: 0.5, price: 2689.0, status: "Pending", strat: "Gold London Breakout" },
  { time: "11:20:55", sym: "USDJPY", side: "buy", type: "Market", lots: 0.8, price: 149.32, status: "Filled", strat: "Asian Session Scalper" },
  { time: "10:02:13", sym: "GBPUSD", side: "buy", type: "Stop", lots: 0.6, price: 1.3150, status: "Cancelled", strat: "GBP Swing Trend" },
];
const HISTORY = [
  { sym: "XAUUSD", side: "buy", lots: 0.5, open: 2631.2, close: 2644.8, pnl: 680, strat: "Gold London Breakout", when: "Yesterday 16:40" },
  { sym: "EURUSD", side: "sell", lots: 1.2, open: 1.0951, close: 1.0930, pnl: 252, strat: "EURUSD Mean Reversion", when: "Yesterday 11:05" },
  { sym: "NAS100", side: "buy", lots: 0.3, open: 20210, close: 20155, pnl: -165, strat: "NAS100 Momentum Rider", when: "29 Sep 19:22" },
  { sym: "USDJPY", side: "sell", lots: 0.8, open: 149.90, close: 149.61, pnl: 155, strat: "Asian Session Scalper", when: "29 Sep 03:14" },
  { sym: "GBPUSD", side: "buy", lots: 0.6, open: 1.3021, close: 1.3069, pnl: 288, strat: "GBP Swing Trend", when: "27 Sep 08:50" },
];
const MENTORS = [
  { n: "Aseem Singhal", r: "Founder, 15 yrs trading", i: "AS" },
  { n: "Kavya Iyer", r: "Forex & SMC mentor", i: "KI" },
  { n: "Neel Shah", r: "Algo & MQL5 mentor", i: "NS" },
];

const state = { broker: null };

/* ---------------- account (purchases persist in this browser) ---------------- */
const TODAY = "1 Oct 2026";
const PLANS = { community: { name: "Community", price: 0 }, mentor: { name: "Mentor plan", price: 99 }, pro: { name: "Pro desk", price: 299 } };
const BUCKET = { strategy: "subs", indicator: "inds", course: "courses", live: "live" };
const emptyAccount = () => ({ subs: {}, inds: {}, courses: {}, live: {}, plan: null, bookings: [], orders: [] });
function seedAccount() {
  const a = emptyAccount();
  const add = (kind, id, title, price, date, extra = {}) => {
    a[BUCKET[kind]][id] = { since: date, price, plan: "Monthly", ...extra };
    a.orders.push({ date, item: title, kind, amount: price, period: price && kind !== "course" ? "/month" : "" });
  };
  add("strategy", "gold-breakout", "Gold London Breakout", 49, "14 Sep 2026");
  add("strategy", "gbp-swing", "GBP Swing Trend", 29, "10 Sep 2026");
  add("strategy", "carry-grid", "Asian Session Scalper", 39, "2 Sep 2026");
  add("strategy", "nas-momentum", "NAS100 Momentum Rider", 79, "28 Aug 2026");
  add("strategy", "euro-mean", "EURUSD Mean Reversion", 29, "20 Aug 2026");
  add("indicator", "session-box", "Session Range Box", 0, "18 Aug 2026");
  add("course", "risk", "Risk Management & Position Sizing", 39, "12 Aug 2026", { prog: 20 });
  add("course", "price-action", "Price Action Mastery", 49, "5 Aug 2026", { prog: 64 });
  add("course", "mt5-basics", "MT5 from Zero to Live", 0, "1 Aug 2026", { prog: 100 });
  return a;
}
let acct = emptyAccount();
function loadAccount() {
  if (!authed()) { acct = emptyAccount(); return; }
  try { acct = JSON.parse(localStorage.getItem("mm_account")) ?? seedAccount(); } catch { acct = seedAccount(); }
  saveAccount();
}
function saveAccount() { try { if (authed()) localStorage.setItem("mm_account", JSON.stringify(acct)); } catch { /* private mode */ } }
const owns = (kind, id) => kind === "plan" ? acct.plan?.id === id : Boolean(acct[BUCKET[kind]]?.[id]);

function itemFor(kind, id) {
  if (kind === "strategy") { const s = STRATS.find((x) => x.id === id); return { title: s.t, price: s.price, period: "/month" }; }
  if (kind === "indicator") { const x = INDICATORS.find((i) => i.id === id); return { title: x.t, price: x.price, period: "/month" }; }
  if (kind === "course") { const c = COURSES.find((x) => x.id === id); return { title: c.t, price: c.price, period: "" }; }
  if (kind === "live") { const l = LIVE[id]; return { title: l.t, price: 0, period: "" }; }
  if (kind === "plan") { const p = PLANS[id]; return { title: p.name, price: p.price, period: "/month" }; }
}

const buyBtn = (kind, id, label, ownedLabel, extra = "") => {
  const on = owns(kind, id);
  return `<button class="btn ${extra} ${on ? "is-on" : ""}" data-buy="${kind}:${id}" data-label="${esc(label)}" data-owned="${esc(ownedLabel)}">${esc(on ? ownedLabel : label)}</button>`;
};

function checkout(title, price, period) {
  return new Promise((done) => {
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="co-t">
      <h2 class="h2" id="co-t">Confirm purchase</h2>
      <div class="co-row"><span>${esc(title)}</span><b>$${price}<small class="muted">${period}</small></b></div>
      <div class="co-row"><span class="muted">Tax</span><span>$0</span></div>
      <div class="co-row co-total"><span>Total today</span><b>$${price}</b></div>
      <div class="co-card"><span class="visa">VISA</span><span>•••• 4242</span><span class="muted small">Exp 08/29</span></div>
      <div class="btn-row"><button class="btn" data-ok>Pay $${price}</button><button class="btn btn-quiet" data-no>Cancel</button></div>
      <p class="small muted">Demo checkout. No real payment is taken.</p></div>`;
    document.body.append(m);
    const close = (v) => { m.remove(); removeEventListener("keydown", onKey); done(v); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    addEventListener("keydown", onKey);
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-no]")) close(false);
      const ok = e.target.closest("[data-ok]");
      if (ok) { ok.textContent = "Processing…"; ok.disabled = true; setTimeout(() => close(true), 800); }
    });
    m.querySelector("[data-ok]").focus();
  });
}

function needLogin() {
  if (authed()) return false;
  toast("Log in to continue");
  location.hash = `#/login?next=${encodeURIComponent(location.hash.replace(/^#\//, "") || "account")}`;
  return true;
}

async function purchase(kind, id, plan = "Monthly", priceOverride) {
  if (needLogin()) return false;
  const it = itemFor(kind, id);
  const price = priceOverride ?? it.price;
  const period = plan === "Quarterly" ? "/quarter" : plan === "Yearly" ? "/year" : it.period;
  if (price > 0 && !(await checkout(it.title, price, period))) return false;
  if (kind === "plan") acct.plan = { id, name: it.title, price, since: TODAY };
  else acct[BUCKET[kind]][id] = { since: TODAY, price, plan, prog: 0 };
  acct.orders.unshift({ date: TODAY, item: it.title, kind, amount: price, period: price ? period : "" });
  saveAccount();
  return true;
}

const BOUGHT_MSG = { strategy: "Subscribed. Switch it on in the Algo dashboard.", indicator: "Subscribed. Restart MT5 to see it in Navigator.", course: "Enrolled. Find it under My account → Courses.", live: "Seat reserved. Added to My account.", plan: "Plan active. See My account." };

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
    <nav class="foot-links"><a href="#/learn">Learn</a><a href="#/indicators">Indicators</a><a href="#/strategies">Strategies</a><a href="#/execute">Execution</a><a href="#/algo">Algo</a><a href="#/support">Handholding</a></nav>
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

/* ---------------- home ---------------- */
const PILLARS = [
  ["Learning", "Recorded courses and live sessions, from first chart to first EA.", "#/learn"],
  ["Indicator", "A marketplace of MT5 indicators you can subscribe to in one click.", "#/indicators"],
  ["Strategy", "Verified, backtested strategies with live track records.", "#/strategies"],
  ["Execution Tool", "Pick your broker and get MT5 set up in minutes.", "#/execute"],
  ["Algo", "One dashboard for every strategy, order, position and P&L.", "#/algo"],
  ["Handholding", "Mentors, onboarding calls and a community at your side.", "#/support"],
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
        <div><dt>Traders learning</dt><dd>48,000+</dd></div>
        <div><dt>Strategies live</dt><dd>120</dd></div>
        <div><dt>Brokers supported</dt><dd>8</dd></div>
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
    <div class="section-head"><h2 class="title">Popular <em>strategies</em></h2>
      <p class="lede">Backtested and running live. Subscribe and they trade on your own MT5 account.</p></div>
    <div class="cards cards-3">${STRATS.slice(0, 3).map(stratCard).join("")}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2 class="title">How it <em>works</em></h2></div>
    <div class="cards cards-4">
      ${[["Learn", "Pick a course or join a live session."], ["Subscribe", "Choose indicators and strategies that fit your style."], ["Connect", "Pick your broker and install MT5."], ["Run", "Turn strategies on and track them on the Algo dashboard."]]
        .map(([t, p], i) => `<article class="card"><span class="kicker">Step ${i + 1}</span><h3 class="h3">${t}</h3><p class="muted">${p}</p></article>`).join("")}
    </div>
  </section>

  <section class="section split-2">
    <div><h2 class="title">Questions <em>traders ask</em></h2></div>
    <div class="faq">
      <details><summary>Do I need trading experience?</summary><p>No. The free MT5 course and the beginner track start from the basics. A mentor call during onboarding helps you pick a starting path.</p></details>
      <details><summary>Where does my money sit?</summary><p>With your broker, in your own account. Strategies trade on your MT5 terminal. MrMarket never holds client funds.</p></details>
      <details><summary>Which brokers can I use?</summary><p>Any broker that offers MetaTrader 5. The Execution page has step-by-step setup for the most popular ones.</p></details>
      <details><summary>Can I stop a strategy at any time?</summary><p>Yes. Each strategy has a switch on the Algo dashboard. Turning it off stops new trades. You choose whether open positions are closed.</p></details>
      <details><summary>Are backtest results guaranteed?</summary><p>No. Backtests and live records show how a strategy behaved in the past. Markets change and losses are possible.</p></details>
    </div>
  </section>

  <section class="cta-band">
    <div><h2 class="title">Stop trading <em>on luck</em></h2><p class="muted" style="color:#b5b5b5;margin-top:14px;max-width:50ch">Join 48,000 traders building a process with the right tools and the right people.</p></div>
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
    <p class="muted small">${esc(c.by)} · ${c.lessons} lessons · <span class="rating"><b>★ ${c.rating}</b> (${c.students.toLocaleString()})</span></p>
    ${enrolled ? `<div class="progress" style="--v:${prog}%"><i></i></div><p class="small muted">${prog === 100 ? "Completed" : prog ? `${prog}% complete` : "Enrolled · not started"}</p>` : ""}
    <div class="card-foot"><span class="price">${c.price ? `$${c.price}` : "Free"}</span>
      ${enrolled ? `<button class="btn btn-small btn-quiet" data-toast="Opening ${esc(c.t)}">${prog === 100 ? "Review" : prog ? "Continue" : "Start course"}</button>` : buyBtn("course", c.id, c.price ? "Buy course" : "Enroll free", "Enrolled ✓", "btn-small")}</div>
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
    <ul>${LIVE.map((s, i) => `<li class="live">
      <div class="date"><b>${s.d}</b><span>${s.m}</span></div>
      <div><div class="tags" style="margin-bottom:8px">${s.live ? `<span class="tag tag-live">Tomorrow</span>` : ""}<span class="tag tag-amber">${s.kind}</span></div>
        <h3 class="h3">${esc(s.t)}</h3>
        <div class="live-meta"><span>with ${esc(s.by)}</span><span>${s.time}</span><span>${s.len}</span><span>${s.seats} seats left</span></div></div>
      ${buyBtn("live", i, "Reserve seat", "Seat reserved ✓", "btn-small")}
    </li>`).join("")}</ul>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let lvl = "All", q = "";
  const box = view.querySelector("#courses");
  const draw = () => {
    const list = COURSES.filter((c) => (lvl === "All" || c.lvl === lvl) && c.t.toLowerCase().includes(q));
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
        <div class="ind-art">${indArt(x.kind, i * 7 + 2)}</div>
        <div class="strat-head"><h3 class="h3">${esc(x.t)}</h3><span class="rating"><b>★ ${x.rating}</b></span></div>
        <div class="tags"><span class="tag">${x.cat}</span><span class="tag">${x.plat}</span><span class="tag">${x.subs.toLocaleString()} users</span></div>
        <p class="muted small">${esc(x.desc)}</p>
        <div class="card-foot"><span class="price">${x.price ? `$${x.price}<small> /month</small>` : "Free"}</span>
          ${buyBtn("indicator", x.id, x.price ? "Subscribe" : "Get free", "Subscribed ✓", "btn-small")}</div>
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
function stratCard(s) {
  const riskTag = s.risk === "Low" ? "tag-up" : s.risk === "High" ? "tag-down" : "tag-amber";
  return `<article class="card hover">
    <div class="strat-head"><div><h3 class="h3"><a href="#/strategy/${s.id}" style="text-decoration:none">${esc(s.t)}</a></h3><p class="muted small">by ${esc(s.by)}</p></div><span class="rating"><b>★ 4.${(s.seed % 3) + 7}</b></span></div>
    <div class="tags"><span class="tag">${s.sym}</span><span class="tag">${s.tf}</span><span class="tag">${s.style}</span><span class="tag ${riskTag}">${s.risk} risk</span></div>
    <a href="#/strategy/${s.id}" aria-label="${esc(s.t)} details">${sparkSVG(curve(s.seed, 60, s.ret / 60, 2.5))}</a>
    <dl class="mini-stats"><div><dt>12m return</dt><dd class="up">${pct(s.ret)}</dd></div><div><dt>Max DD</dt><dd class="down">${pct(-s.dd)}</dd></div><div><dt>Win rate</dt><dd>${s.win}%</dd></div></dl>
    <div class="card-foot"><span class="price">$${s.price}<small> /month</small></span>
      <span class="btn-row"><a class="btn btn-small btn-quiet" href="#/strategy/${s.id}">Details</a>${buyBtn("strategy", s.id, "Subscribe", "Subscribed ✓", "btn-small")}</span></div>
  </article>`;
}

function strategiesScreen() {
  const styles = ["All", ...new Set(STRATS.map((s) => s.risk + " risk"))];
  view.innerHTML = `
  <section class="page-head">
    <p class="eyebrow rise"><i></i>Strategies</p>
    <h1 class="title split-me">Strategies with <em>a track record</em></h1>
    <p class="lede rise" style="--d:400ms">Each strategy runs as an Expert Advisor on your MT5 account. Every number below is from live trading over the last 12 months.</p>
  </section>
  <div class="toolbar">
    <div class="cats">${styles.map((c, i) => `<button class="cat" aria-pressed="${i === 0}" data-f="${c}">${c}</button>`).join("")}</div>
    <div class="tabs" role="group" aria-label="Sort"><button aria-selected="true" data-sort="ret">Top return</button><button aria-selected="false" data-sort="dd">Lowest drawdown</button><button aria-selected="false" data-sort="subs">Most popular</button></div>
  </div>
  <div class="cards cards-3" id="list"></div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  let f = "All", sort = "ret";
  const box = view.querySelector("#list");
  const draw = () => {
    const list = STRATS.filter((s) => f === "All" || `${s.risk} risk` === f)
      .sort((a, b) => (sort === "dd" ? a.dd - b.dd : b[sort] - a[sort]));
    box.innerHTML = list.map(stratCard).join("");
    };
  draw();
  view.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => {
    f = b.dataset.f; view.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw();
  }));
  view.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    sort = b.dataset.sort; view.querySelectorAll("[data-sort]").forEach((x) => x.setAttribute("aria-selected", String(x === b))); draw();
  }));
}

function strategyScreen(m) {
  const s = STRATS.find((x) => x.id === m[1]) ?? STRATS[0];
  const eq = curve(s.seed, 120, s.ret / 120, 2.2).map((v) => v * 100);
  const r = rng(s.seed + 9);
  const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const monthly = months.map(() => +((r() - 0.25) * s.ret / 4).toFixed(1));
  view.innerHTML = `
  <section class="page-head" style="padding-bottom:28px">
    <a class="small muted" href="#/strategies">← All strategies</a>
    <h1 class="title split-me">${esc(s.t)}</h1>
    <div class="tags rise" style="--d:300ms"><span class="tag">${s.sym}</span><span class="tag">${s.tf}</span><span class="tag">${s.style}</span><span class="tag tag-amber">${s.risk} risk</span><span class="tag">${s.subs.toLocaleString()} subscribers</span><span class="tag">by ${esc(s.by)}</span></div>
  </section>
  <div class="detail">
    <div style="display:grid;gap:18px;min-width:0">
      <dl class="kv">
        <div><dt>12m return</dt><dd class="up">${pct(s.ret)}</dd></div>
        <div><dt>Max drawdown</dt><dd class="down">${pct(-s.dd)}</dd></div>
        <div><dt>Win rate</dt><dd>${s.win}%</dd></div>
        <div><dt>Profit factor</dt><dd>${s.pf}</dd></div>
        <div><dt>Trades</dt><dd>${s.trades}</dd></div>
      </dl>
      <div class="sheet"><div class="panel-head" style="margin-bottom:14px"><h2 class="h3">Equity curve, $10,000 start</h2><div class="tabs"><button aria-selected="false">3M</button><button aria-selected="false">6M</button><button aria-selected="true">1Y</button></div></div>
        ${chartSVG(eq, { labels: ["Oct '25", "Jan '26", "Apr '26", "Jul '26", "Sep '26"] })}</div>
      <div class="sheet"><h2 class="h3" style="margin-bottom:14px">Monthly returns</h2>
        <div class="table-wrap" style="border:0"><table><thead><tr>${months.map((x) => `<th class="num">${x}</th>`).join("")}</tr></thead>
        <tbody><tr>${monthly.map((v) => `<td class="num ${cls(v)}"><b>${pct(v)}</b></td>`).join("")}</tr></tbody></table></div></div>
      <div class="sheet" style="display:grid;gap:14px"><h2 class="h3">How it trades</h2>
        <p class="muted">Waits for the ${s.sym} range to form, then enters on a confirmed break with a volatility-sized stop. Takes partial profit at 1R, trails the rest, and closes all positions before the weekend. No martingale, no grid, every trade has a stop loss.</p>
        <ul class="checklist"><li>Stop loss on every trade</li><li>Max 1% account risk per trade by default</li><li>Pauses during high-impact news</li><li>Works on any MT5 broker</li></ul></div>
    </div>
    <aside class="sticky">
      <div class="sheet" style="display:grid;gap:16px">
        <h2 class="h3">Subscribe</h2>
        <div class="plan">
          <label><span><input type="radio" name="plan" value="Monthly" data-price="${s.price}" checked>Monthly</span><b>$${s.price}</b></label>
          <label><span><input type="radio" name="plan" value="Quarterly" data-price="${Math.round(s.price * 3 * 0.85)}">Quarterly <span class="tag tag-up" style="margin-left:8px">Save 15%</span></span><b>$${Math.round(s.price * 3 * 0.85)}</b></label>
          <label><span><input type="radio" name="plan" value="Yearly" data-price="${Math.round(s.price * 12 * 0.7)}">Yearly <span class="tag tag-up" style="margin-left:8px">Save 30%</span></span><b>$${Math.round(s.price * 12 * 0.7)}</b></label>
        </div>
        <p class="small muted">Minimum capital $${s.min.toLocaleString()} · Runs on your MT5 account</p>
        ${buyBtn("strategy", s.id, "Subscribe", "Subscribed ✓")}
        <a class="btn btn-quiet" href="#/execute">Set up MT5 first</a>
      </div>
      <div class="sheet mentor"><span class="avatar">${s.by.split(" ").map((w) => w[0]).join("")}</span><div><b>${esc(s.by)}</b><p class="small muted">Strategy author. Ask questions in the community or book a call.</p></div></div>
    </aside>
  </div>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  view.querySelectorAll(".sheet .tabs button").forEach((b) => b.addEventListener("click", () => b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)))));
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
  const running = STRATS.filter((s) => owns("strategy", s.id));
  const eq = curve(77, 90, 55, 160).map((v) => v + 24500);
  const openPnl = POSITIONS.reduce((a, p) => a + posPnl(p), 0);
  const r = rng(5);
  const cal = Array.from({ length: 30 }, (_, i) => (i % 7 >= 5 ? null : Math.round((r() - 0.38) * 900)));
  const stratPnl = (s) => Math.round((s.ret * 31 + s.seed * 13) % 2400 - (s.risk === "High" ? 300 : 0));
  view.innerHTML = `
  <div class="dash-head">
    <div style="display:grid;gap:8px"><span class="dot-live">MT5 connected · Exness-MT5Real · #81234567</span>
      <h1 class="title" style="font-size:clamp(34px,4vw,54px)">Algo <em class="inline">dashboard</em></h1></div>
    <div class="acct">
      <div class="tabs"><button aria-selected="true">Today</button><button aria-selected="false">Week</button><button aria-selected="false">Month</button><button aria-selected="false">All</button></div>
      <button class="btn btn-small btn-quiet" id="kill">Pause all</button>
    </div>
  </div>
  <dl class="kpis">
    <div class="kpi hero-kpi"><dt>Account equity</dt><dd>$${Math.round(eq.at(-1)).toLocaleString()}</dd><span class="delta" style="color:#7be0a4">+4.8% this month</span></div>
    <div class="kpi"><dt>Today's P&amp;L</dt><dd class="up">+$1,284</dd><span class="delta up">+2.6%</span></div>
    <div class="kpi"><dt>Open P&amp;L</dt><dd class="${cls(openPnl)}">${money(Math.round(openPnl), true)}</dd><span class="delta muted">${POSITIONS.length} positions</span></div>
    <div class="kpi"><dt>Running strategies</dt><dd>${running.length}</dd><span class="delta muted">of ${running.length} subscribed</span></div>
    <div class="kpi"><dt>Margin level</dt><dd>1,842%</dd><span class="delta muted">Free margin $22,910</span></div>
  </dl>
  <div class="dash-grid">
    <div class="panel"><div class="panel-head"><h2 class="h3">Equity</h2><span class="tag tag-up">+${pct((eq.at(-1) / eq[0] - 1) * 100, false)} in 90 days</span></div>
      ${chartSVG(eq, { h: 260, labels: ["Jul 3", "Jul 31", "Aug 28", "Sep 30"] })}</div>
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
      <tbody>${running.map((s, i) => { const v = stratPnl(s); const on = i !== 3; return `<tr>
        <td><b><a href="#/strategy/${s.id}" style="text-decoration:none">${esc(s.t)}</a></b></td><td>${s.sym}</td>
        <td><span class="tag ${on ? "tag-up" : ""}" data-status>${on ? "Running" : "Paused"}</span></td>
        <td class="num">${(0.2 + (s.seed % 5) * 0.2).toFixed(1)}</td><td class="num">${s.seed % 6}</td>
        <td class="num ${cls(v)}"><b>${money(v, true)}</b></td>
        <td style="width:140px">${sparkSVG(curve(s.seed + 1, 30, v / 300, 3), { h: 30, fill: false })}</td>
        <td><label class="switch"><input type="checkbox" ${on ? "checked" : ""} data-run aria-label="Run ${esc(s.t)}"><i></i></label></td></tr>`; }).join("")
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
    <div class="panel"><div class="panel-head"><h2 class="h3">Daily P&amp;L, September</h2><span class="small muted">Weekends closed</span></div>
      <div class="cal">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="h">${d}</span>`).join("")}
        ${cal.map((v, i) => v === null ? `<span style="background:#f6f6f6">${i + 1}</span>` : `<span title="${money(v, true)}" style="background:${v >= 0 ? `rgba(31,157,85,${0.15 + Math.min(.7, v / 900)})` : `rgba(214,60,60,${0.15 + Math.min(.7, -v / 600)})`}">${i + 1}</span>`).join("")}</div></div>
    <div class="panel"><div class="panel-head"><h2 class="h3">Activity</h2><span class="dot-live">Live</span></div>
      <ul class="feed">
        <li><span class="side buy">BUY</span><span>Gold London Breakout opened 0.5 lots XAUUSD @ 2652.40</span><time>14:32</time></li>
        <li><span class="side sell">SELL</span><span>EURUSD Mean Reversion limit filled @ 1.0912</span><time>13:58</time></li>
        <li><span class="tag tag-amber">NEWS</span><span>Strategies paused 15 min around US jobless claims</span><time>13:30</time></li>
        <li><span class="side buy">BUY</span><span>NAS100 Momentum Rider stop triggered @ 20140</span><time>13:15</time></li>
        <li><span class="tag tag-up">TP</span><span>Asian Session Scalper closed USDJPY, +$155</span><time>03:14</time></li>
      </ul></div>
  </div>
  ${footer()}`;
  wireTabs();
  view.querySelectorAll(".dash-head .tabs button").forEach((b) => b.addEventListener("click", () => b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)))));
  view.querySelectorAll("[data-run]").forEach((c) => c.addEventListener("change", () => {
    const tag = c.closest("tr").querySelector("[data-status]");
    tag.textContent = c.checked ? "Running" : "Paused"; tag.classList.toggle("tag-up", c.checked);
    toast(c.checked ? "Strategy started" : "Strategy paused. Open positions kept.");
  }));
  view.querySelector("#kill").addEventListener("click", (e) => {
    const pause = e.target.textContent === "Pause all";
    view.querySelectorAll("[data-run]").forEach((c) => { c.checked = !pause; c.dispatchEvent(new Event("change")); });
    e.target.textContent = pause ? "Resume all" : "Pause all";
    toast(pause ? "All strategies paused" : "All strategies resumed");
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
    acct.bookings.unshift({ when: `${d} Oct 2026, ${s} IST`, what: "Onboarding call (30 min)", booked: TODAY });
    saveAccount();
    toast(`Booked for ${d} Oct at ${s} IST. See My account.`);
  });
}

/* ---------------- my account ---------------- */
function accountScreen() {
  const subs = [
    ...Object.entries(acct.subs).map(([id, v]) => ({ kind: "strategy", id, title: STRATS.find((x) => x.id === id)?.t, type: "Strategy", ...v })),
    ...Object.entries(acct.inds).map(([id, v]) => ({ kind: "indicator", id, title: INDICATORS.find((x) => x.id === id)?.t, type: "Indicator", ...v })),
  ];
  const monthly = (v) => v.plan === "Quarterly" ? v.price / 3 : v.plan === "Yearly" ? v.price / 12 : v.price;
  const spend = subs.reduce((a, v) => a + monthly(v), 0) + (acct.plan?.price ?? 0);
  const courses = Object.entries(acct.courses).map(([id, v]) => ({ c: COURSES.find((x) => x.id === id), ...v })).filter((x) => x.c);
  const lives = Object.keys(acct.live).map((i) => LIVE[i]).filter(Boolean);
  const upcoming = lives.length + acct.bookings.length;
  view.innerHTML = `
  <div class="dash-head">
    <div class="mentor"><span class="avatar" style="width:64px;height:64px;font-size:20px">DT</span>
      <div><h1 class="title" style="font-size:clamp(32px,4vw,52px)">My <em class="inline">account</em></h1><p class="muted small">${DEMO.name} · ${DEMO.email} · Member since Aug 2026</p></div></div>
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
        <td><button class="link-btn" data-cancel="${v.kind}:${v.id}">Cancel</button></td></tr>`).join("")}
      ${acct.plan ? `<tr><td><b>${esc(acct.plan.name)}</b></td><td><span class="tag">Support plan</span></td><td>${acct.plan.price ? "Monthly" : "Free"}</td><td class="muted">${acct.plan.since}</td><td class="num"><b>${acct.plan.price ? `$${acct.plan.price}` : "Free"}</b></td><td><span class="tag tag-up">Active</span></td><td><button class="link-btn" data-cancel="plan:${acct.plan.id}">Cancel</button></td></tr>` : ""}
      </tbody></table></div>` : `<div class="empty"><b style="color:var(--text)">No subscriptions yet</b><a class="btn btn-small" href="#/strategies">Browse strategies</a></div>`}</div>

    <div data-pane="a-courses" hidden>${courses.length ? `<div class="cards cards-3">${courses.map(({ c, prog, since }) => `<article class="card">
      <div class="thumb">${thumbSVG(c.hue, COURSES.indexOf(c) + 3)}<span class="play" aria-hidden="true"></span><span class="dur">${c.dur}</span></div>
      <h3 class="h3">${esc(c.t)}</h3><p class="small muted">${esc(c.by)} · Enrolled ${since}</p>
      <div class="progress" style="--v:${prog}%"><i></i></div>
      <div class="card-foot"><span class="small muted">${prog === 100 ? "Completed" : prog ? `${prog}% complete` : "Not started"}</span><button class="btn btn-small" data-toast="Opening ${esc(c.t)}">${prog === 100 ? "Review" : prog ? "Continue" : "Start"}</button></div>
    </article>`).join("")}</div>` : `<div class="empty"><b style="color:var(--text)">No courses yet</b><a class="btn btn-small" href="#/learn">Browse courses</a></div>`}</div>

    <div data-pane="a-sessions" hidden>${upcoming ? `<ul>
      ${acct.bookings.map((b) => `<li class="live"><div class="date"><b>${b.when.split(" ")[0]}</b><span>Oct</span></div><div><span class="tag tag-amber">Onboarding call</span><h3 class="h3" style="margin-top:8px">${esc(b.what)}</h3><div class="live-meta"><span>${esc(b.when)}</span><span>Video call link sent by email</span></div></div><button class="btn btn-small btn-quiet" data-toast="Reschedule request sent">Reschedule</button></li>`).join("")}
      ${lives.map((l) => `<li class="live"><div class="date"><b>${l.d}</b><span>${l.m}</span></div><div><span class="tag tag-amber">${l.kind}</span><h3 class="h3" style="margin-top:8px">${esc(l.t)}</h3><div class="live-meta"><span>with ${esc(l.by)}</span><span>${l.time}</span><span>${l.len}</span></div></div><button class="btn btn-small btn-quiet" data-toast="Added to your calendar">Add to calendar</button></li>`).join("")}
    </ul>` : `<div class="empty"><b style="color:var(--text)">Nothing booked</b><span class="btn-row"><a class="btn btn-small" href="#/learn">Live courses</a><a class="btn btn-small btn-quiet" href="#/support">Book a call</a></span></div>`}</div>

    <div data-pane="a-bill" hidden><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${acct.orders.map((o, i) => `<tr><td class="muted">${o.date}</td><td><b>${esc(o.item)}</b></td><td style="text-transform:capitalize">${o.kind === "live" ? "Live session" : o.kind}</td><td class="num"><b>${o.amount ? `$${o.amount}` : "Free"}</b>${o.amount ? `<small class="muted">${o.period}</small>` : ""}</td><td><span class="tag tag-up">${o.amount ? "Paid" : "Confirmed"}</span></td><td>${o.amount ? `<button class="link-btn" data-toast="Invoice INV-${2026100 + acct.orders.length - i} downloaded">Invoice</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted" style="margin-top:12px">Paying with Visa •••• 4242 · <button class="link-btn" data-toast="Card update is not connected in this demo">Update card</button></p></div>
  </div>
  ${footer()}`;
  wireTabs();
  view.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => {
    const [kind, id] = b.dataset.cancel.split(":");
    if (kind === "plan") acct.plan = null; else delete acct[BUCKET[kind]][id];
    saveAccount(); toast("Subscription cancelled"); accountScreen();
  }));
}

/* ---------------- login ---------------- */
const DEMO = { email: "demo@mrmarket.com", pass: "demo1234", name: "Demo Trader" };
const authed = () => { try { return localStorage.getItem("mm_user") === DEMO.email; } catch { return false; } };
function setAuthed(on) { try { on ? localStorage.setItem("mm_user", DEMO.email) : localStorage.removeItem("mm_user"); } catch { /* private mode */ } }

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
      <div class="demo-box">
        <div><b>Demo account</b><p class="small muted">Email: <code>${DEMO.email}</code><br>Password: <code>${DEMO.pass}</code></p></div>
        <button type="button" class="btn btn-small btn-quiet" id="fill-demo">Use demo</button>
      </div>
      <label class="field"><span>Email</span><input class="inp" type="email" id="email" autocomplete="username" placeholder="you@example.com" required></label>
      <label class="field"><span>Password</span>
        <span class="pw"><input class="inp" type="password" id="pass" autocomplete="current-password" placeholder="••••••••" required><button type="button" id="toggle-pw" aria-label="Show password">Show</button></span></label>
      <div class="login-row"><label class="small"><input type="checkbox" checked style="accent-color:var(--amber)"> Remember me</label><a class="small" href="#" data-toast="Reset link sent (demo)" onclick="return false">Forgot password?</a></div>
      <p class="form-error" id="err" role="alert" hidden></p>
      <button class="btn" type="submit">Log in</button>
      <div class="or"><span>or</span></div>
      <button type="button" class="btn btn-quiet" data-toast="Google sign-in is not connected in this demo">Continue with Google</button>
      <p class="small muted" style="text-align:center">New to MrMarket? <a href="#/support">Book a free onboarding call</a></p>
    </form>
  </section>
  ${footer()}`;
  splitWords(view.querySelector(".split-me"));
  const email = view.querySelector("#email"), pass = view.querySelector("#pass"), err = view.querySelector("#err");
  view.querySelector("#fill-demo").addEventListener("click", () => { email.value = DEMO.email; pass.value = DEMO.pass; err.hidden = true; });
  view.querySelector("#toggle-pw").addEventListener("click", (e) => {
    const show = pass.type === "password"; pass.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show";
  });
  view.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (email.value.trim().toLowerCase() === DEMO.email && pass.value === DEMO.pass) {
      setAuthed(true); loadAccount(); toast(`Welcome back, ${DEMO.name}`); location.hash = `#/${next}`;
    } else {
      err.textContent = "Email or password is incorrect. Use the demo account above."; err.hidden = false;
    }
  });
}

/* ---------------- router ---------------- */
const NAV = [["learn", "#/learn", "Learn"], ["indicators", "#/indicators", "Indicators"], ["strategies", "#/strategies", "Strategies"], ["execute", "#/execute", "Execution"], ["algo", "#/algo", "Algo"], ["support", "#/support", "Handholding"]];
const ROUTES = [
  [/^#\/learn$/, learnScreen, 1, "learn"],
  [/^#\/indicators$/, indicatorsScreen, 1, "indicators"],
  [/^#\/strategies$/, strategiesScreen, 1, "strategies"],
  [/^#\/strategy\/([\w-]+)$/, strategyScreen, 2, "strategies"],
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
       <a class="user" href="#/account" title="My account"><span class="avatar">DT</span><span class="user-name">My account</span></a>`
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
loadAccount();
route();
