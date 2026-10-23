# Equity Curve Analyser

Expectancy, drawdown, streaks and a Monte Carlo drawdown distribution from any trade list, so you know what to expect before going live.

## Run
```
python equity_analyser.py backtest_trades.csv --balance 10000
python equity_analyser.py journal_trades.csv --balance 25000 --sims 5000 --plot
```
Requirements: Python 3.10+. `matplotlib` only for `--plot`.
