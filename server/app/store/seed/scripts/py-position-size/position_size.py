#!/usr/bin/env python3
"""MrMarket Position Size Calculator.

Lots = (account balance x risk %) / (stop distance in points x value per point per lot)

Examples:
  python position_size.py --balance 10000 --risk 1 --stop-points 250 --instrument XAUUSD
  python position_size.py --balance 5000 --risk 0.5 --entry 1.0850 --stop 1.0820 --instrument EURUSD
  python position_size.py --list
"""
import argparse, sys

# value of 1 point (minimum price step) per 1.0 lot, in account currency terms (USD), and point size
INSTRUMENTS = {
    # symbol: (point, usd_per_point_per_lot, min_lot, lot_step)
    "EURUSD": (0.00001, 1.0, 0.01, 0.01), "GBPUSD": (0.00001, 1.0, 0.01, 0.01), "AUDUSD": (0.00001, 1.0, 0.01, 0.01),
    "NZDUSD": (0.00001, 1.0, 0.01, 0.01), "USDJPY": (0.001, 0.67, 0.01, 0.01), "USDCHF": (0.00001, 1.12, 0.01, 0.01),
    "USDCAD": (0.00001, 0.73, 0.01, 0.01), "XAUUSD": (0.01, 1.0, 0.01, 0.01), "XAGUSD": (0.001, 5.0, 0.01, 0.01),
    "NAS100": (0.1, 0.1, 0.1, 0.1), "US30": (0.1, 0.1, 0.1, 0.1), "SPX500": (0.1, 0.1, 0.1, 0.1), "GER40": (0.1, 0.1, 0.1, 0.1),
    "BTCUSD": (0.01, 0.01, 0.01, 0.01), "ETHUSD": (0.01, 0.01, 0.01, 0.01), "USOIL": (0.01, 10.0, 0.01, 0.01),
}

def round_down(x, step):
    return int(x / step + 1e-9) * step

def calc(balance, risk_pct, stop_points, instrument=None, point_value=None, min_lot=0.01, lot_step=0.01):
    if instrument:
        if instrument.upper() not in INSTRUMENTS:
            raise SystemExit(f"Unknown instrument {instrument}. Use --list or pass --point-value.")
        _, point_value, min_lot, lot_step = INSTRUMENTS[instrument.upper()]
    if point_value is None:
        raise SystemExit("Pass --instrument or --point-value")
    risk_money = balance * risk_pct / 100.0
    raw = risk_money / (stop_points * point_value)
    lots = max(min_lot, round_down(raw, lot_step))
    actual_risk = lots * stop_points * point_value
    return {"risk_money": risk_money, "raw_lots": raw, "lots": lots, "actual_risk": actual_risk, "actual_pct": actual_risk / balance * 100}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--balance", type=float, help="account balance or equity")
    ap.add_argument("--risk", type=float, default=1.0, help="risk per trade in %% (default 1)")
    ap.add_argument("--stop-points", type=float, help="stop distance in points")
    ap.add_argument("--entry", type=float, help="entry price (alternative to --stop-points)")
    ap.add_argument("--stop", type=float, help="stop price (alternative to --stop-points)")
    ap.add_argument("--instrument", help="symbol preset, see --list")
    ap.add_argument("--point-value", type=float, help="USD per point per 1.0 lot (overrides preset)")
    ap.add_argument("--list", action="store_true", help="show instrument presets")
    a = ap.parse_args()
    if a.list:
        print(f"{'Symbol':8} {'Point':>8} {'USD/pt/lot':>11} {'MinLot':>7}")
        for k, (pt, pv, ml, _) in INSTRUMENTS.items():
            print(f"{k:8} {pt:>8} {pv:>11} {ml:>7}")
        return
    if a.balance is None:
        ap.error("--balance is required")
    stop_points = a.stop_points
    if stop_points is None:
        if a.entry is None or a.stop is None or not a.instrument:
            ap.error("give --stop-points, or --entry and --stop with --instrument")
        point = INSTRUMENTS[a.instrument.upper()][0]
        stop_points = abs(a.entry - a.stop) / point
    r = calc(a.balance, a.risk, stop_points, a.instrument, a.point_value)
    print(f"Balance          : {a.balance:,.2f}")
    print(f"Risk             : {a.risk}%  = {r['risk_money']:,.2f}")
    print(f"Stop distance    : {stop_points:,.0f} points")
    print(f"Position size    : {r['lots']:.2f} lots  (raw {r['raw_lots']:.4f})")
    print(f"Actual risk      : {r['actual_risk']:,.2f}  ({r['actual_pct']:.2f}%)")
    if r["actual_pct"] > a.risk * 1.5:
        print("WARNING: minimum lot risks more than planned. Widen the account or skip the trade.", file=sys.stderr)

if __name__ == "__main__":
    main()
