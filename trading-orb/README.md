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
    broker.py             Broker interface, PaperBroker, AlpacaBroker, IBKRBroker
    live.py                 polling paper/live loop
  run_backtest.py       CLI: backtest
  run_live.py             CLI: paper/live trade
  tests/test_strategy.py  unit tests (synthetic data, no network needed)
  pinescript/
    orb_dual_range.pine  TradingView indicator: same logic, visual signals + alerts
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

### Alpaca setup (US equities paper/live)

1. Create a free account at [alpaca.markets](https://alpaca.markets/) — no
   identity verification needed to use paper trading.
2. In the dashboard, switch to **Paper Trading** (top-left toggle) and open
   **API Keys** to generate a key + secret.
3. In `trading-orb/`, copy the env template and paste your keys in:
   ```bash
   cp .env.example .env
   # edit .env: ALPACA_API_KEY=..., ALPACA_SECRET_KEY=...
   ```
   `.env` is gitignored — your keys never get committed.
4. Install the extra dependencies and run:
   ```bash
   pip install alpaca-py python-dotenv
   python run_live.py --symbol SPY --asset-class us_equity --broker alpaca
   ```

This trades on Alpaca's **paper** endpoint by default (`AlpacaBroker(paper=True)`
in `orb/broker.py`) — simulated fills against real market data, zero risk.
Only flip that to `paper=False` once you've validated the strategy and are
ready to risk real capital. Note: Alpaca does not accept Canadian tax
residents — use IBKR below if that's you.

### Interactive Brokers setup (equities, forex and futures — paper/live)

IBKR covers all three asset classes on one account, which is why it's the
default recommendation if Alpaca isn't available to you (e.g. Canadian
residents).

1. In **TWS** or **IB Gateway**, go to Configure/File > Global Configuration
   > API > Settings, check **Enable ActiveX and Socket Clients**, and note
   the socket port (defaults: TWS paper `7497`, TWS live `7496`, Gateway
   paper `4002`, Gateway live `4001`).
2. Log in to TWS/Gateway with your **paper trading** account first — it must
   stay running while the bot trades, since it's the bridge between the API
   and IBKR's servers.
3. Install the extra dependency and run:
   ```bash
   pip install ib_async
   python run_live.py --symbol SPY --asset-class us_equity --broker ibkr --ib-port 7497
   python run_live.py --symbol EURUSD=X --asset-class forex --broker ibkr --ib-port 7497
   ```
4. For futures, `--symbol` must be IBKR's specific contract **local symbol**
   (e.g. `ESZ4`), not the continuous root (`ES=F`) used for backtesting —
   futures contracts expire, so the exact contract has to be named. Adjust
   the `exchange` in `IBKRBroker._contract()` (`orb/broker.py`) if you're
   trading something other than CME products.

Like Alpaca, the bracket order (entry + stop-loss + take-profit) is placed
directly on IBKR's servers, so the stop/target execute there — the bot
doesn't need to stay connected for them to trigger once the position is open.

## TradingView indicator (visual signals, no auto-execution)

TWS itself has no scripting language for custom on-chart alerts, so if you
want the strategy to show entries directly on a chart and just tell you when
to trade — rather than run headless and place orders itself — use
`pinescript/orb_dual_range.pine` on TradingView instead. Same dual-range
logic as `orb/strategy.py`, but it only plots the OR15/OR30 levels, marks
breakouts with arrows/labels showing entry/stop/target, and fires alerts.
You execute the trade yourself in TWS.

1. Open any chart on [tradingview.com](https://www.tradingview.com/), open
   the **Pine Editor** (bottom panel), paste in the contents of
   `orb_dual_range.pine`, and click **Add to chart**.
2. In the indicator's settings, set **Session Start** and **Timezone** to
   match what you're trading (defaults: `0930` / `America/New_York` for US
   stocks; use `0800` / `Europe/London` for forex, matching `orb/session.py`).
   Note TradingView's own symbols differ from the Yahoo ones used for Python
   backtesting — e.g. `EURUSD` instead of `EURUSD=X`, `ES1!` instead of `ES=F`.
3. Right-click the chart > **Add alert**. Set condition to the indicator's
   name, choose **Once Per Bar Close** (important — the logic breaks out on
   a confirmed close, matching the Python backtest, not on intrabar wicks),
   and pick a notification (popup, sound, mobile push, email, or webhook).
   To get the full entry/stop/target text in the alert, set the alert's
   condition to **"Any alert() function call"** instead of the indicator
   name directly.

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
- `AlpacaBroker` (US equities) and `IBKRBroker` (equities/forex/futures) are
  the wired-in live brokers. `orb/broker.py`'s `Broker` interface is the
  extension point for others (OANDA, etc.).
