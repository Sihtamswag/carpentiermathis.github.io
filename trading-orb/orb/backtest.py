"""Backtest engine: runs the ORB strategy session-by-session over history."""

from dataclasses import asdict
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo

import pandas as pd

from .data import fetch_intraday, split_sessions
from .session import SESSION_OPEN_DEFAULTS
from .strategy import ORBConfig, ORBStrategy, Trade


class BacktestResult:
    def __init__(self, symbol: str, trades: list[Trade]):
        self.symbol = symbol
        self.trades = trades

    def to_dataframe(self) -> pd.DataFrame:
        if not self.trades:
            return pd.DataFrame()
        rows = []
        for t in self.trades:
            row = asdict(t)
            row["r_multiple"] = t.r_multiple
            row["pnl_per_share"] = t.pnl_per_share
            rows.append(row)
        return pd.DataFrame(rows)

    def summary(self) -> dict:
        df = self.to_dataframe()
        if df.empty:
            return {"symbol": self.symbol, "trades": 0}
        wins = df[df["r_multiple"] > 0]
        equity = df["r_multiple"].cumsum()
        drawdown = (equity - equity.cummax()).min()
        return {
            "symbol": self.symbol,
            "trades": len(df),
            "win_rate_pct": round(len(wins) / len(df) * 100, 1),
            "avg_r": round(df["r_multiple"].mean(), 2),
            "total_r": round(df["r_multiple"].sum(), 2),
            "best_r": round(df["r_multiple"].max(), 2),
            "worst_r": round(df["r_multiple"].min(), 2),
            "max_drawdown_r": round(drawdown, 2),
        }


class ORBBacktester:
    def __init__(self, config: ORBConfig):
        self.strategy = ORBStrategy(config)

    def run(self, symbol: str, asset_class: str, interval: str = "5m", period: str = "60d") -> BacktestResult:
        session_info = SESSION_OPEN_DEFAULTS[asset_class]
        tz = ZoneInfo(session_info["tz"])
        open_h, open_m = (int(x) for x in session_info["time"].split(":"))

        raw = fetch_intraday(symbol, interval=interval, period=period)
        sessions = split_sessions(raw, session_info["tz"])

        trades: list[Trade] = []
        for date, bars in sessions.items():
            session_open = pd.Timestamp(datetime.combine(date.date(), dtime(open_h, open_m), tzinfo=tz))
            trade = self.strategy.run_session(symbol, session_open, bars)
            if trade:
                trades.append(trade)

        return BacktestResult(symbol=symbol, trades=trades)
