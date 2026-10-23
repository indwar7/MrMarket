#!/usr/bin/env python3
"""MrMarket Economic Calendar Filter.

Downloads this week's economic calendar, keeps high-impact events for the currencies you trade and writes
a pause-window file that EAs can read, so strategies stand aside around NFP, CPI and rate decisions.

Output (CSV, UTC): start,end,currency,title   e.g.  2026-10-23 12:15,2026-10-23 13:15,USD,Non-Farm Employment Change

Examples:
  python news_filter.py --currencies USD,EUR,GBP --before 30 --after 30 --out news_pause.csv
  python news_filter.py --currencies USD --impact High,Medium --out "C:/Users/you/AppData/Roaming/MetaQuotes/Terminal/Common/Files/news_pause.csv"
Run it daily (Task Scheduler / cron). Source: ForexFactory weekly feed (free, no key).
"""
import argparse, csv, json, urllib.request
from datetime import datetime, timedelta, timezone

FEED = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

def fetch(cache=".calendar_cache.json"):
    """Download the weekly feed; fall back to the last good copy if the feed is unreachable or rate-limited."""
    req = urllib.request.Request(FEED, headers={"User-Agent": "MrMarket-news-filter/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
        with open(cache, "w") as f: json.dump(data, f)
        return data
    except Exception as e:  # 429 Too Many Requests is common if you run it repeatedly; the feed updates hourly
        try:
            with open(cache) as f:
                print(f"feed unavailable ({e}); using cached copy {cache}")
                return json.load(f)
        except OSError:
            raise SystemExit(f"Could not download the calendar ({e}) and no cached copy exists. Try again in a few minutes.")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--currencies", default="USD,EUR,GBP,JPY"); ap.add_argument("--impact", default="High")
    ap.add_argument("--before", type=int, default=30, help="minutes to pause before the event"); ap.add_argument("--after", type=int, default=30)
    ap.add_argument("--out", default="news_pause.csv")
    a = ap.parse_args()
    cur = {c.strip().upper() for c in a.currencies.split(",")}; imp = {i.strip().lower() for i in a.impact.split(",")}
    rows = []
    for ev in fetch():
        if ev.get("country", "").upper() not in cur or ev.get("impact", "").lower() not in imp: continue
        try: t = datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(timezone.utc)
        except (KeyError, ValueError): continue
        rows.append(((t - timedelta(minutes=a.before)).strftime("%Y-%m-%d %H:%M"), (t + timedelta(minutes=a.after)).strftime("%Y-%m-%d %H:%M"), ev["country"], ev.get("title", "")))
    rows.sort()
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["start_utc", "end_utc", "currency", "title"]); w.writerows(rows)
    print(f"{len(rows)} pause windows written to {a.out}")
    for r in rows[:10]: print("  ", *r)

if __name__ == "__main__":
    main()
