# ORB (Opening Range Breakout) — dual-range strategy

Python implementation of a dual-range ORB strategy, with backtesting and
paper/live execution. Works across US equities, forex and futures using the
same strategy engine.

**Not financial advice.** Backtested performance does not guarantee future
results. Test thoroughly in paper mode before risking real capital.

## Strategy logic

1. **OR15** — the first 15 minutes of the session define a high/low range.
2. From minute 15 to minute 30, a close beyond the OR15 high/low triggers an
   entry. Stop-loss = the opposite OR15 bound. Target = entry ± `reward_risk_ratio`
   × risk (2R by default).
3. If OR15 didn't break out, **OR30** (the first 30 minutes) defines a wider
   range. From minute 30 to minute 40 (`max_entry_minutes`), a close beyond OR30
   triggers the entry instead, with the stop at the opposite OR30 bound.
4. At most one trade per symbol per session. Exit on stop, target, or the
   session's last bar (whichever comes first).

All of this is configurable in `config.yaml`.

## Project layout

```
trading-orb/
  config.yaml          strategy params, backtest window, symbol lists
  orb/
    strategy.py         core ORB logic (asset-agnostic)
    session.py          default session-open time/timezone per asset class
    data.py              historical/intraday data via yfinance
    backtest.py          session-by-session backtest engine + stats
    broker.py             Broker interface, PaperBroker, AlpacaBroker
    live.py                 polling paper/live loop
  run_backtest.py       CLI: backtest
  run_live.py             CLI: paper/live trade
  tests/test_strategy.py  unit tests (synthetic data, no network needed)
```

## Setup

```bash
cd trading-orb
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Backtest

```bash
python run_backtest.py --asset-class us_equity          # runs every symbol in config.yaml
python run_backtest.py --asset-class forex --symbol EURUSD=X
python run_backtest.py --asset-class futures --symbol ES=F
```

Prints a summary (win rate, average R, total R, max drawdown in R) per
symbol and writes per-trade detail to `results/<symbol>_trades.csv`.

Data comes from `yfinance` (free): 5-minute bars, up to ~60 days of history.
Switch `backtest.interval` to `1m` in `config.yaml` for finer opening-range
precision, but note Yahoo only keeps ~7 days of 1-minute history. For longer
or higher-quality backtests, swap `orb/data.py`'s `fetch_intraday` for a paid
provider (Polygon, Databento, etc.) — the rest of the pipeline is unaffected.

## Paper / live trading

```bash
python run_live.py --symbol SPY --symbol QQQ --asset-class us_equity
```

Defaults to `PaperBroker`, an in-memory simulator — no API keys, no real
orders, works for any asset class. It polls Yahoo for 1-minute bars and
prints fills/PnL as they happen.

For real paper/live execution on US equities via Alpaca:

```bash
export ALPACA_API_KEY=...
export ALPACA_SECRET_KEY=...
pip install alpaca-py
python run_live.py --symbol SPY --asset-class us_equity --broker alpaca
```

Forex and futures **backtesting** works out of the box (yfinance covers both
via tickers like `EURUSD=X` and `ES=F`), but live *execution* for those asset
classes isn't wired up — you'd need an OANDA account (forex) or Interactive
Brokers (futures). `orb/broker.py`'s `Broker` interface is the extension
point: implement `submit_bracket_order` / `get_position` / `close_position`
against that API and pass an instance to `run_live()`.

## Tests

```bash
python -m pytest tests/
```

Unit tests use synthetic OHLC bars (no network access needed) and cover:
primary-range breakout, fallback to the extended range, no-trade sessions,
and both exit paths (stop-loss / session close).

## Known limitations

- Free Yahoo data is delayed and rate-limited — fine for backtesting and
  paper trading, not for low-latency real execution.
- Session-open times in `orb/session.py` are defaults (NYSE 09:30 for
  equities/futures, London 08:00 for forex). Override per your instrument if
  it trades a different session.
- `AlpacaBroker` is the only wired-in live broker; see above for extending
  to forex/futures.
