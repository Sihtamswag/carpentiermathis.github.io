"""Streaming/paper live loop for the dual-range ORB strategy.

Polls yfinance for the latest 1-minute bars and feeds them into a
LiveORBSession per symbol, which mirrors strategy.ORBStrategy but processes
bars incrementally (no lookahead) and drives a Broker.

Free Yahoo data is delayed and rate-limited: this loop is meant for paper
trading / demos, not low-latency real execution.
"""

import time as time_module
from datetime import datetime
from datetime import time as dtime
from zoneinfo import ZoneInfo

import pandas as pd

from .broker import Broker, PaperBroker
from .data import fetch_intraday
from .session import SESSION_OPEN_DEFAULTS
from .strategy import ORBConfig


class LiveORBSession:
    def __init__(self, symbol: str, session_open: pd.Timestamp, config: ORBConfig, broker: Broker, qty: float):
        self.symbol = symbol
        self.session_open = session_open
        self.cfg = config
        self.broker = broker
        self.qty = qty

        self.primary_cutoff = session_open + pd.Timedelta(minutes=config.primary_range_minutes)
        self.extended_cutoff = session_open + pd.Timedelta(minutes=config.extended_range_minutes)
        self.entry_deadline = session_open + pd.Timedelta(minutes=config.max_entry_minutes)

        self._primary_bars: list[pd.Series] = []
        self._extended_bars: list[pd.Series] = []
        self.or_high = self.or_low = self.ext_high = self.ext_low = None
        self.trade_taken = False
        self.done = False

    def on_new_bar(self, ts: pd.Timestamp, bar: pd.Series) -> None:
        if self.done:
            return

        if ts < self.primary_cutoff:
            self._primary_bars.append(bar)
            return

        if self.or_high is None:
            self.or_high = max(b["high"] for b in self._primary_bars)
            self.or_low = min(b["low"] for b in self._primary_bars)
            self._extended_bars.extend(self._primary_bars)

        if ts < self.extended_cutoff:
            self._extended_bars.append(bar)

        if self.trade_taken:
            self._manage_open_position(bar)
            return

        if ts >= self.entry_deadline:
            self.done = True
            return

        range_used = "primary" if ts < self.extended_cutoff else "extended"
        if range_used == "extended" and self.ext_high is None:
            self.ext_high = max(b["high"] for b in self._extended_bars)
            self.ext_low = min(b["low"] for b in self._extended_bars)

        hi = self.or_high if range_used == "primary" else self.ext_high
        lo = self.or_low if range_used == "primary" else self.ext_low
        buf = self.cfg.entry_buffer_pct / 100

        if bar["close"] > hi * (1 + buf):
            stop = self.or_low if range_used == "primary" else self.ext_low
            risk = bar["close"] - stop
            if risk > 0:
                target = bar["close"] + self.cfg.reward_risk_ratio * risk
                self.broker.submit_bracket_order(self.symbol, "long", self.qty, bar["close"], stop, target)
                self.trade_taken = True
        elif bar["close"] < lo * (1 - buf):
            stop = self.or_high if range_used == "primary" else self.ext_high
            risk = stop - bar["close"]
            if risk > 0:
                target = bar["close"] - self.cfg.reward_risk_ratio * risk
                self.broker.submit_bracket_order(self.symbol, "short", self.qty, bar["close"], stop, target)
                self.trade_taken = True

    def _manage_open_position(self, bar: pd.Series) -> None:
        pos = self.broker.get_position(self.symbol)
        if pos is None:
            self.done = True
            return
        if pos.side == "long":
            hit_stop, hit_target = bar["low"] <= pos.stop_price, bar["high"] >= pos.target_price
        else:
            hit_stop, hit_target = bar["high"] >= pos.stop_price, bar["low"] <= pos.target_price

        if hit_stop:
            self.broker.close_position(self.symbol, pos.stop_price)
            self.done = True
        elif hit_target:
            self.broker.close_position(self.symbol, pos.target_price)
            self.done = True


def run_live(
    symbols: list[str],
    asset_class: str,
    config: ORBConfig,
    broker: Broker | None = None,
    qty: float = 1,
    poll_seconds: int = 60,
) -> Broker:
    broker = broker or PaperBroker()
    session_info = SESSION_OPEN_DEFAULTS[asset_class]
    tz = ZoneInfo(session_info["tz"])
    open_h, open_m = (int(x) for x in session_info["time"].split(":"))
    today = datetime.now(tz).date()
    session_open = pd.Timestamp(datetime.combine(today, dtime(open_h, open_m), tzinfo=tz))

    sessions = {s: LiveORBSession(s, session_open, config, broker, qty) for s in symbols}
    seen_bars: dict[str, set] = {s: set() for s in symbols}

    print(f"Session open: {session_open}. Watching {symbols} ({asset_class}).")
    while not all(s.done for s in sessions.values()):
        for symbol, session in sessions.items():
            if session.done:
                continue
            df = fetch_intraday(symbol, interval="1m", period="1d").tz_convert(tz)
            for ts, bar in df.iterrows():
                if ts in seen_bars[symbol] or ts < session_open:
                    continue
                seen_bars[symbol].add(ts)
                session.on_new_bar(ts, bar)
        time_module.sleep(poll_seconds)

    print("All sessions done for today.")
    if isinstance(broker, PaperBroker):
        print(f"Paper broker cash: {broker.cash:.2f}")
        for fill in broker.fills:
            print(fill)
    return broker
