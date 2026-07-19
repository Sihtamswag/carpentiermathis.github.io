"""Core dual-range Opening Range Breakout (ORB) logic.

Rules:
  1. The first `primary_range_minutes` (default 15) of a session define OR15
     (high/low).
  2. From minute `primary_range_minutes` to `extended_range_minutes`, a close
     beyond the OR15 high/low triggers an entry, stop at the opposite OR15
     bound.
  3. If no OR15 breakout happened, the first `extended_range_minutes`
     (default 30) define a wider OR30. From minute `extended_range_minutes`
     to `max_entry_minutes` (default 40), a close beyond OR30 triggers an
     entry, stop at the opposite OR30 bound.
  4. At most one trade per symbol per session. Exit on stop, target
     (entry +/- reward_risk_ratio * risk), or the session's last bar.

This module is asset-agnostic: it only needs OHLC bars and a session-open
timestamp, so the same logic drives stocks, forex and futures.
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Optional

import pandas as pd


@dataclass
class ORBConfig:
    primary_range_minutes: int = 15
    extended_range_minutes: int = 30
    max_entry_minutes: int = 40
    reward_risk_ratio: float = 2.0
    entry_buffer_pct: float = 0.0


@dataclass
class Trade:
    symbol: str
    session_date: pd.Timestamp
    direction: Literal["long", "short"]
    range_used: Literal["primary", "extended"]
    entry_time: pd.Timestamp
    entry_price: float
    stop_price: float
    target_price: float
    exit_time: Optional[pd.Timestamp] = None
    exit_price: Optional[float] = None
    exit_reason: Optional[str] = None

    @property
    def r_multiple(self) -> Optional[float]:
        if self.exit_price is None:
            return None
        risk = abs(self.entry_price - self.stop_price)
        if risk == 0:
            return 0.0
        pnl = self.pnl_per_share
        return pnl / risk

    @property
    def pnl_per_share(self) -> Optional[float]:
        if self.exit_price is None:
            return None
        if self.direction == "long":
            return self.exit_price - self.entry_price
        return self.entry_price - self.exit_price


class ORBStrategy:
    def __init__(self, config: ORBConfig):
        self.config = config

    def run_session(
        self, symbol: str, session_open: pd.Timestamp, bars: pd.DataFrame
    ) -> Optional[Trade]:
        """bars: OHLCV for one session, ascending, indexed by bar start time."""
        cfg = self.config
        primary_cutoff = session_open + timedelta(minutes=cfg.primary_range_minutes)
        extended_cutoff = session_open + timedelta(minutes=cfg.extended_range_minutes)
        entry_deadline = session_open + timedelta(minutes=cfg.max_entry_minutes)

        primary_bars = bars[bars.index < primary_cutoff]
        if primary_bars.empty:
            return None
        or_high, or_low = primary_bars["high"].max(), primary_bars["low"].min()

        extended_bars = bars[bars.index < extended_cutoff]
        ext_high, ext_low = extended_bars["high"].max(), extended_bars["low"].min()

        entry_window = bars[(bars.index >= primary_cutoff) & (bars.index < entry_deadline)]
        buf = cfg.entry_buffer_pct / 100

        trade = None
        for ts, bar in entry_window.iterrows():
            range_used = "primary" if ts < extended_cutoff else "extended"
            hi = or_high if range_used == "primary" else ext_high
            lo = or_low if range_used == "primary" else ext_low

            if bar["close"] > hi * (1 + buf):
                stop = or_low if range_used == "primary" else ext_low
                risk = bar["close"] - stop
                if risk <= 0:
                    continue
                trade = Trade(
                    symbol=symbol,
                    session_date=session_open.normalize(),
                    direction="long",
                    range_used=range_used,
                    entry_time=ts,
                    entry_price=bar["close"],
                    stop_price=stop,
                    target_price=bar["close"] + cfg.reward_risk_ratio * risk,
                )
                break

            if bar["close"] < lo * (1 - buf):
                stop = or_high if range_used == "primary" else ext_high
                risk = stop - bar["close"]
                if risk <= 0:
                    continue
                trade = Trade(
                    symbol=symbol,
                    session_date=session_open.normalize(),
                    direction="short",
                    range_used=range_used,
                    entry_time=ts,
                    entry_price=bar["close"],
                    stop_price=stop,
                    target_price=bar["close"] - cfg.reward_risk_ratio * risk,
                )
                break

        if trade is None:
            return None

        self._simulate_exit(trade, bars)
        return trade

    @staticmethod
    def _simulate_exit(trade: Trade, bars: pd.DataFrame) -> None:
        after_entry = bars[bars.index > trade.entry_time]
        for ts, bar in after_entry.iterrows():
            if trade.direction == "long":
                hit_stop = bar["low"] <= trade.stop_price
                hit_target = bar["high"] >= trade.target_price
            else:
                hit_stop = bar["high"] >= trade.stop_price
                hit_target = bar["low"] <= trade.target_price

            if hit_stop:
                # If both stop and target are touched in the same bar, assume
                # the worst case (stop hit first) since intrabar order is unknown.
                trade.exit_time, trade.exit_price, trade.exit_reason = ts, trade.stop_price, "stop"
                return
            if hit_target:
                trade.exit_time, trade.exit_price, trade.exit_reason = ts, trade.target_price, "target"
                return

        if len(after_entry):
            last_ts, last_bar = after_entry.index[-1], after_entry.iloc[-1]
            trade.exit_time = last_ts
            trade.exit_price = last_bar["close"]
            trade.exit_reason = "session_close"
