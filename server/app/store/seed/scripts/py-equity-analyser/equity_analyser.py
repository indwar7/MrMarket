#!/usr/bin/env python3
"""MrMarket Equity Curve Analyser.

Reads a trade list (CSV with a pnl column, e.g. backtest_trades.csv or an MT5 history export) and reports
what to expect before going live: drawdown, streaks, expectancy and a Monte Carlo of drawdowns.

Examples:
  python equity_analyser.py backtest_trades.csv --balance 10000
  python equity_analyser.py journal_trades.csv --balance 25000 --sims 5000 --plot
"""
import argparse, csv, random, statistics

def load(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f); col = next((c for c in r.fieldnames if c.lower() in ("pnl", "profit", "p&l", "net")), None)
        if not col: raise SystemExit(f"No pnl/profit column in {r.fieldnames}")
        return [float(x[col]) for x in r if x[col] not in ("", None)]

def drawdown(pnls, balance):
    eq, peak, mdd, cur, longest = balance, balance, 0.0, 0, 0
    for p in pnls:
        eq += p
        if eq > peak: peak, cur = eq, 0
        else: cur += 1; longest = max(longest, cur)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return mdd, longest, eq

def streaks(pnls):
    best = worst = run = 0; prev = None
    for p in pnls:
        s = p > 0
        run = run + 1 if s == prev else 1; prev = s
        if s: best = max(best, run)
        else: worst = max(worst, run)
    return best, worst

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv"); ap.add_argument("--balance", type=float, default=10000); ap.add_argument("--sims", type=int, default=2000); ap.add_argument("--plot", action="store_true")
    a = ap.parse_args()
    pnls = load(a.csv)
    if len(pnls) < 10: raise SystemExit("Need at least 10 trades")
    wins = [p for p in pnls if p > 0]; losses = [p for p in pnls if p <= 0]
    wr = len(wins) / len(pnls); aw = statistics.mean(wins) if wins else 0; al = abs(statistics.mean(losses)) if losses else 0
    exp = wr * aw - (1 - wr) * al
    mdd, longest, final = drawdown(pnls, a.balance); bw, bl = streaks(pnls)
    sd = statistics.pstdev(pnls); sharpe = statistics.mean(pnls) / sd * (len(pnls) ** 0.5) if sd else 0
    print(f"Trades        : {len(pnls)}   win rate {wr * 100:.1f}%   avg win {aw:,.2f}   avg loss {al:,.2f}")
    print(f"Expectancy    : {exp:,.2f} per trade   profit factor {sum(wins) / abs(sum(losses)) if losses and sum(losses) else float('inf'):.2f}")
    print(f"Net           : {sum(pnls):,.2f}   final equity {final:,.2f}   trade-level Sharpe {sharpe:.2f}")
    print(f"Max drawdown  : {mdd:.1f}%   longest underwater {longest} trades   streaks: {bw} wins / {bl} losses")
    random.seed(7); mdds = []
    for _ in range(a.sims):
        s = pnls[:]; random.shuffle(s); mdds.append(drawdown(s, a.balance)[0])
    mdds.sort(); q = lambda p: mdds[int(p * (len(mdds) - 1))]
    print(f"Monte Carlo   : {a.sims} shuffles  median DD {q(.5):.1f}%   95th {q(.95):.1f}%   99th {q(.99):.1f}%")
    print("Rule of thumb : size so the 95th percentile drawdown is one you could sit through.")
    if a.plot:
        try:
            import matplotlib.pyplot as plt
            eq, cur = a.balance, []
            for p in pnls: eq += p; cur.append(eq)
            fig, ax = plt.subplots(2, 1, figsize=(8, 7)); ax[0].plot(cur); ax[0].set_title("Equity"); ax[1].hist(mdds, bins=40); ax[1].set_title("Monte Carlo max drawdown %")
            plt.tight_layout(); plt.savefig("equity_analysis.png", dpi=120); print("Wrote equity_analysis.png")
        except ImportError:
            print("matplotlib not installed; skipping plot")

if __name__ == "__main__":
    main()
