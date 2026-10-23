# Position Size Calculator

Turns account size, risk % and stop distance into a lot size, with presets for forex, metals, indices and crypto CFDs.

## Run
```
python position_size.py --balance 10000 --risk 1 --stop-points 250 --instrument XAUUSD
python position_size.py --balance 5000 --risk 0.5 --entry 1.0850 --stop 1.0820 --instrument EURUSD
python position_size.py --list
```
Requirements: Python 3.10+. No extra packages.

Point values are typical for USD accounts; check your broker's contract specification and override with `--point-value` if it differs.
