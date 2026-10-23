#!/usr/bin/env python3
"""MrMarket CSV Backtester.

Replays simple rule-based strategies (the same logic family as the MrMarket EAs) on OHLC bars
exported from MT5 or TradingView, with ATR stops, R-multiple targets and % risk sizing.

CSV columns (header names are matched case-insensitively): time, open, high, low, close [, volume]
MT5 export: right-click chart -> Save As... (CSV)  or  Tools -> History Center -> Export.

Examples:
  python backtest.py EURUSD_H1.csv --strategy ma-cross --fast 20 --slow 50
  python backtest.py XAUUSD_M15.csv --strategy donchian --period 20 --rr 2 --sl-atr 1.5
  python backtest.py NAS100_M30.csv --strategy rsi --period 14 --lower 30 --upper 70 --plot
"""
import argparse, csv, math, statistics, sys
from datetime import datetime

def read_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        sample = f.read(4096); f.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        r = csv.DictReader(f, dialect=dialect)
        cols = {c.lower().strip("<>"): c for c in r.fieldnames}
        def pick(*names):
            for n in names:
                if n in cols: return cols[n]
            return None
        t, o, h, l, c = pick("time", "date", "datetime"), pick("open"), pick("high"), pick("low"), pick("close")
        d = pick("date") if pick("time") and pick("date") and pick("time") != pick("date") else None
        if not all([t, o, h, l, c]): raise SystemExit(f"Need time/open/high/low/close columns, got {r.fieldnames}")
        for x in r:
            ts = (x[d] + " " + x[t]) if d else x[t]
            rows.append((ts, float(x[o]), float(x[h]), float(x[l]), float(x[c])))
    return rows

def sma(vals, n):
    out, s = [None] * len(vals), 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= n: s -= vals[i - n]
        if i >= n - 1: out[i] = s / n
    return out

def ema(vals, n):
    out, k, prev = [None] * len(vals), 2 / (n + 1), None
    for i, v in enumerate(vals):
        prev = v if prev is None else v * k + prev * (1 - k)
        if i >= n - 1: out[i] = prev
    return out

def atr(bars, n=14):
    trs = []
    for i, (_, o, h, l, c) in enumerate(bars):
        pc = bars[i - 1][4] if i else c
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    return sma(trs, n)

def rsi(closes, n=14):
    out, gains, losses = [None] * len(closes), [], []
    ag = al = None
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        g, lo = max(ch, 0), max(-ch, 0)
        if i <= n:
            gains.append(g); losses.append(lo)
            if i == n:
                ag, al = sum(gains) / n, sum(losses) / n
        else:
            ag, al = (ag * (n - 1) + g) / n, (al * (n - 1) + lo) / n
        if ag is not None:
            out[i] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    return out

def signals(bars, a):
    closes = [b[4] for b in bars]; n = len(bars); sig = [0] * n
    if a.strategy == "ma-cross":
        f, s = ema(closes, a.fast), ema(closes, a.slow)
        for i in range(1, n):
            if None in (f[i], s[i], f[i - 1], s[i - 1]): continue
            if f[i - 1] <= s[i - 1] and f[i] > s[i]: sig[i] = 1
            elif f[i - 1] >= s[i - 1] and f[i] < s[i]: sig[i] = -1
    elif a.strategy == "donchian":
        p = a.period
        for i in range(p, n):
            hh = max(b[2] for b in bars[i - p:i]); ll = min(b[3] for b in bars[i - p:i])
            if bars[i][4] > hh: sig[i] = 1
            elif bars[i][4] < ll: sig[i] = -1
    elif a.strategy == "rsi":
        r = rsi(closes, a.period)
        for i in range(1, n):
            if r[i] is None or r[i - 1] is None: continue
            if r[i - 1] < a.lower <= r[i]: sig[i] = 1
            elif r[i - 1] > a.upper >= r[i]: sig[i] = -1
    return sig

def run(bars, a):
    sig, at = signals(bars, a), atr(bars, a.atr)
    equity, trades, pos = a.balance, [], None
    curve = [(bars[0][0], equity)]
    for i in range(1, len(bars)):
        t, o, h, l, c = bars[i]
        if pos:
            d, entry, sl, tp, size, r_dist, _t0 = pos
            exit_px = None
            if d == 1 and l <= sl: exit_px = sl
            elif d == 1 and tp and h >= tp: exit_px = tp
            elif d == -1 and h >= sl: exit_px = sl
            elif d == -1 and tp and l <= tp: exit_px = tp
            elif sig[i] == -d: exit_px = o
            if exit_px is not None:
                pnl = (exit_px - entry) * d * size
                equity += pnl
                trades.append({"entry_time": pos[6], "exit_time": t, "dir": "long" if d == 1 else "short", "entry": entry, "exit": exit_px, "pnl": round(pnl, 2), "r": round(pnl / (r_dist * size), 2) if r_dist else 0})
                pos = None
        if pos is None and sig[i] and at[i]:
            d = sig[i]; entry = c; r_dist = at[i] * a.sl_atr
            sl = entry - d * r_dist; tp = entry + d * r_dist * a.rr if a.rr > 0 else None
            size = (equity * a.risk / 100) / r_dist if r_dist > 0 else 0
            pos = (d, entry, sl, tp, size, r_dist, t)
        curve.append((t, equity))
    return trades, curve

def report(trades, curve, a):
    if not trades:
        print("No trades."); return
    pnl = [t["pnl"] for t in trades]; wins = [p for p in pnl if p > 0]; losses = [p for p in pnl if p <= 0]
    peak, mdd = curve[0][1], 0.0
    for _, e in curve:
        peak = max(peak, e); mdd = max(mdd, (peak - e) / peak * 100)
    pf = (sum(wins) / abs(sum(losses))) if losses and sum(losses) != 0 else float("inf")
    print(f"Strategy      : {a.strategy}   bars: {len(curve)}   trades: {len(trades)}")
    print(f"Net P&L       : {sum(pnl):,.2f}   ({sum(pnl) / a.balance * 100:+.1f}%)")
    print(f"Win rate      : {len(wins) / len(trades) * 100:.1f}%   profit factor: {pf:.2f}")
    print(f"Avg R         : {statistics.mean(t['r'] for t in trades):+.2f}   max drawdown: {mdd:.1f}%")
    print(f"Final equity  : {curve[-1][1]:,.2f}")
    with open(a.out + "_trades.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(trades[0].keys())); w.writeheader(); w.writerows(trades)
    with open(a.out + "_equity.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["time", "equity"]); w.writerows(curve)
    print(f"Wrote {a.out}_trades.csv and {a.out}_equity.csv")
    if a.plot:
        try:
            import matplotlib.pyplot as plt
            plt.plot([e for _, e in curve]); plt.title(f"Equity: {a.strategy}"); plt.xlabel("bar"); plt.ylabel("equity"); plt.tight_layout(); plt.savefig(a.out + "_equity.png", dpi=120)
            print(f"Wrote {a.out}_equity.png")
        except ImportError:
            print("matplotlib not installed; skipping plot (pip install matplotlib)")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv"); ap.add_argument("--strategy", choices=["ma-cross", "donchian", "rsi"], default="ma-cross")
    ap.add_argument("--fast", type=int, default=20); ap.add_argument("--slow", type=int, default=50)
    ap.add_argument("--period", type=int, default=20); ap.add_argument("--lower", type=float, default=30); ap.add_argument("--upper", type=float, default=70)
    ap.add_argument("--atr", type=int, default=14); ap.add_argument("--sl-atr", type=float, default=1.5); ap.add_argument("--rr", type=float, default=2.0)
    ap.add_argument("--balance", type=float, default=10000); ap.add_argument("--risk", type=float, default=1.0)
    ap.add_argument("--out", default="backtest"); ap.add_argument("--plot", action="store_true")
    a = ap.parse_args()
    bars = read_csv(a.csv)
    if len(bars) < 100: raise SystemExit("Need at least 100 bars")
    trades, curve = run(bars, a)
    report(trades, curve, a)

if __name__ == "__main__":
    main()
