# Telegram Signal Bridge

Forwards every EA entry, exit and error line from the MT5 Experts log to a Telegram chat or channel, within seconds.

## Run
```
python telegram_bridge.py --token <BOT_TOKEN> --chat <CHAT_ID> --logs "C:/Users/<you>/AppData/Roaming/MetaQuotes/Terminal/<ID>/MQL5/Logs"
```
Requirements: Python 3.10+, a Telegram bot token (free from @BotFather). No extra packages.
Run it on the same machine or VPS as MT5. Keep it running with Task Scheduler or NSSM.
