# Trade Journal Exporter (MT5 → Excel)

Builds a tagged trade journal from MT5: per-strategy P&L (by magic number), R multiples, hour-of-day stats and a monthly sheet.

## Run
```
python journal_export.py --mt5 --days 90 --out journal.xlsx      # live from the terminal (Windows)
python journal_export.py --csv history.csv --out journal.xlsx    # from an exported History CSV
```
Requirements: Python 3.10+. `openpyxl` for a single .xlsx (otherwise CSVs are written). `MetaTrader5` package for `--mt5` (Windows, same machine as the terminal).
