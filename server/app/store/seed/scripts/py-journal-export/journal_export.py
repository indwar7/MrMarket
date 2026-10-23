#!/usr/bin/env python3
"""MrMarket Trade Journal Exporter.

Reads closed deals either live from MetaTrader 5 (Windows, MetaTrader5 package) or from a CSV you
exported from the MT5 History tab, and writes a tagged journal workbook:
  Trades        every closed trade with R multiple and hour-of-day
  By strategy   P&L, win rate, profit factor per magic number / comment
  By hour       when your money is made and lost
  Monthly       monthly P&L and trade count

Examples:
  python journal_export.py --mt5 --days 90 --out journal.xlsx
  python journal_export.py --csv history.csv --out journal.xlsx
"""
import argparse, csv, sys
from collections import defaultdict
from datetime import datetime, timedelta

def from_mt5(days):
    try:
        import MetaTrader5 as mt5
    except ImportError:
        raise SystemExit("pip install MetaTrader5 (Windows only), or use --csv")
    if not mt5.initialize(): raise SystemExit(f"MT5 initialize failed: {mt5.last_error()}")
    deals = mt5.history_deals_get(datetime.now() - timedelta(days=days), datetime.now()) or []
    mt5.shutdown()
    # pair entry/exit deals by position id
    pos = defaultdict(dict)
    for d in deals:
        if d.type not in (0, 1): continue
        key = d.position_id
        if d.entry == 0: pos[key].update(entry_time=datetime.fromtimestamp(d.time), symbol=d.symbol, dir="long" if d.type == 0 else "short", entry=d.price, lots=d.volume, magic=d.magic, comment=d.comment)
        else: pos[key].update(exit_time=datetime.fromtimestamp(d.time), exit=d.price, pnl=d.profit + d.swap + d.commission)
    return [p for p in pos.values() if "exit" in p and "entry" in p]

def from_csv(path):
    out = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f, dialect=csv.Sniffer().sniff(f.read(4096), delimiters=",;\t")); f.seek(0)
        cols = {c.lower(): c for c in r.fieldnames}
        def g(row, *names):
            for n in names:
                if n in cols and row[cols[n]] != "": return row[cols[n]]
            return ""
        for row in r:
            try:
                out.append(dict(entry_time=parse_t(g(row, "open time", "time", "entry_time")), exit_time=parse_t(g(row, "close time", "exit_time", "time")),
                    symbol=g(row, "symbol"), dir="long" if g(row, "type", "dir").lower().startswith(("buy", "long")) else "short",
                    entry=float(g(row, "price", "open price", "entry") or 0), exit=float(g(row, "close price", "exit", "price") or 0),
                    lots=float(g(row, "volume", "lots") or 0), pnl=float(g(row, "profit", "pnl") or 0), magic=g(row, "magic"), comment=g(row, "comment")))
            except ValueError:
                continue
    return out

def parse_t(s):
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"):
        try: return datetime.strptime(s.strip(), fmt)
        except ValueError: pass
    raise ValueError(s)

def summarise(trades):
    for t in trades:
        risk = abs(t["entry"] - t["exit"]) * t["lots"] if t["pnl"] < 0 else None
        t["strategy"] = str(t.get("magic") or t.get("comment") or "manual")
        t["hour"] = t["entry_time"].hour
        t["month"] = t["exit_time"].strftime("%Y-%m")
    losses = [abs(t["pnl"]) for t in trades if t["pnl"] < 0]
    avg_loss = sum(losses) / len(losses) if losses else 1.0
    for t in trades: t["r"] = round(t["pnl"] / avg_loss, 2)
    def group(key):
        g = defaultdict(list)
        for t in trades: g[t[key]].append(t["pnl"])
        rows = []
        for k, v in sorted(g.items(), key=lambda kv: str(kv[0])):
            w = [x for x in v if x > 0]; l = [x for x in v if x <= 0]
            rows.append([k, len(v), round(sum(v), 2), f"{len(w) / len(v) * 100:.0f}%", round(sum(w) / abs(sum(l)), 2) if l and sum(l) else "inf"])
        return rows
    return group("strategy"), group("hour"), group("month")

def write(trades, by_strat, by_hour, by_month, out):
    head = ["entry_time", "exit_time", "symbol", "dir", "lots", "entry", "exit", "pnl", "r", "strategy", "hour", "month"]
    sheets = {"Trades": [head] + [[str(t[h]) if "time" in h else t[h] for h in head] for t in trades],
              "By strategy": [["strategy", "trades", "pnl", "win rate", "profit factor"]] + by_strat,
              "By hour": [["hour", "trades", "pnl", "win rate", "profit factor"]] + by_hour,
              "Monthly": [["month", "trades", "pnl", "win rate", "profit factor"]] + by_month}
    try:
        from openpyxl import Workbook
        wb = Workbook(); wb.remove(wb.active)
        for name, rows in sheets.items():
            ws = wb.create_sheet(name)
            for r in rows: ws.append(r)
            ws.freeze_panes = "A2"
        wb.save(out); print(f"Wrote {out}")
    except ImportError:
        for name, rows in sheets.items():
            p = out.rsplit(".", 1)[0] + "_" + name.lower().replace(" ", "_") + ".csv"
            with open(p, "w", newline="") as f: csv.writer(f).writerows(rows)
            print(f"Wrote {p} (install openpyxl for a single .xlsx)")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--mt5", action="store_true", help="read from the running MT5 terminal (Windows)")
    src.add_argument("--csv", help="CSV exported from the MT5 History tab")
    ap.add_argument("--days", type=int, default=90); ap.add_argument("--out", default="journal.xlsx")
    a = ap.parse_args()
    trades = from_mt5(a.days) if a.mt5 else from_csv(a.csv)
    if not trades: raise SystemExit("No closed trades found")
    trades.sort(key=lambda t: t["exit_time"])
    write(trades, *summarise(trades), a.out)
    print(f"{len(trades)} trades, net {sum(t['pnl'] for t in trades):,.2f}")

if __name__ == "__main__":
    main()
