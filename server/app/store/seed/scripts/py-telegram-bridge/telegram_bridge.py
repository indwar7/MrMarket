#!/usr/bin/env python3
"""MrMarket Telegram Signal Bridge.

Watches the MT5 Experts log and forwards every EA entry, exit and error to a Telegram chat.
Works with any MrMarket EA (they print to the Experts tab) and with your own EAs.

1. Create a bot with @BotFather, copy the token.
2. Send the bot a message, then open https://api.telegram.org/bot<TOKEN>/getUpdates to read your chat id.
3. Run:
   python telegram_bridge.py --token 123:abc --chat 987654 --logs "C:/Users/you/AppData/Roaming/MetaQuotes/Terminal/<ID>/MQL5/Logs"

Options:
   --pattern   regex a log line must match (default: order|deal|position|buy|sell|error|failed|stop|profit)
   --from-start  also send lines already in today's log
"""
import argparse, glob, json, os, re, sys, time, urllib.parse, urllib.request

def send(token, chat, text):
    data = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000], "disable_web_page_preview": "true"}).encode()
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data, timeout=15) as r:
            return json.load(r).get("ok", False)
    except Exception as e:
        print(f"telegram error: {e}", file=sys.stderr); return False

def latest_log(folder):
    files = sorted(glob.glob(os.path.join(folder, "*.log")))
    return files[-1] if files else None

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--token", required=True); ap.add_argument("--chat", required=True); ap.add_argument("--logs", required=True, help="MQL5/Logs folder")
    ap.add_argument("--pattern", default=r"order|deal|position|buy|sell|error|failed|stop|profit|MrMarket"); ap.add_argument("--from-start", action="store_true")
    ap.add_argument("--prefix", default="MT5", help="text put before every message")
    a = ap.parse_args()
    rx = re.compile(a.pattern, re.I)
    send(a.token, a.chat, f"{a.prefix}: bridge started, watching {a.logs}")
    current, pos = None, 0
    while True:
        f = latest_log(a.logs)
        if f != current:
            current, pos = f, 0 if a.from_start or current is None and a.from_start else (os.path.getsize(f) if f else 0)
            print(f"watching {current}")
        if current:
            with open(current, "r", encoding="utf-16", errors="ignore") as fh:
                fh.seek(pos); chunk = fh.read(); pos = fh.tell()
            for line in chunk.splitlines():
                line = line.strip()
                if line and rx.search(line):
                    print(line); send(a.token, a.chat, f"{a.prefix}: {line}")
        time.sleep(2)

if __name__ == "__main__":
    main()
