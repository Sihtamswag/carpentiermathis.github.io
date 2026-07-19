"""Historical/intraday data access via yfinance.

yfinance is free and covers US equities, forex (e.g. "EURUSD=X") and
continuous futures (e.g. "ES=F") with the same interface, which is why it's
the default here. Its intraday history is limited (~60 days for 5m bars,
~7 days for 1m bars) — swap fetch_intraday's implementation for a paid feed
if you need longer backtests.
"""

from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf


def fetch_intraday(symbol: str, interval: str = "5m", period: str = "60d") -> pd.DataFrame:
    df = yf.download(symbol, interval=interval, period=period, progress=False, auto_adjust=False)
    if df.empty:
        raise ValueError(f"No data returned for {symbol} ({interval}, {period})")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [str(c[0]).lower() for c in df.columns]
    else:
        df.columns = [str(c).lower() for c in df.columns]

    df.index = df.index.tz_localize("UTC") if df.index.tz is None else df.index.tz_convert("UTC")
    return df[["open", "high", "low", "close", "volume"]].sort_index()


def split_sessions(df: pd.DataFrame, session_tz: str) -> dict:
    """Group bars by local calendar date so the ORB can reset each session."""
    local = df.tz_convert(ZoneInfo(session_tz))
    return {pd.Timestamp(date): group for date, group in local.groupby(local.index.date)}
