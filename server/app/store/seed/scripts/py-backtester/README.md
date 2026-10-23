# MT5 Strategy Backtester (CSV)

Replays MA crossover, Donchian breakout and RSI mean-reversion rules on OHLC bars with the MrMarket risk engine: ATR stop, R-multiple target, % risk sizing.

## Run
```
python backtest.py EURUSD_H1.csv --strategy ma-cross --fast 20 --slow 50
python backtest.py XAUUSD_M15.csv --strategy donchian --period 20 --rr 2 --sl-atr 1.5 --plot
```
Outputs: console stats, `backtest_trades.csv`, `backtest_equity.csv`, optional `backtest_equity.png`.

Requirements: Python 3.10+. `matplotlib` only for `--plot`.

Input CSV needs time, open, high, low, close columns (MT5 and TradingView exports work as-is).
Results are illustrative: no spread, slippage or swap is modelled unless you add them.
