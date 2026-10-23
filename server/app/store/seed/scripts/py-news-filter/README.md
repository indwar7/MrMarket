# Economic Calendar Filter

Writes a weekly pause-window file (UTC) of high-impact events for your currencies, so EAs stand aside around NFP, CPI and rate decisions.

## Run
```
python news_filter.py --currencies USD,EUR,GBP --before 30 --after 30 --out news_pause.csv
```
Point `--out` at your MT5 `Common/Files` folder and schedule it daily. Requirements: Python 3.10+, internet access. No extra packages.
