from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from orb.strategy import ORBConfig, ORBStrategy

TZ = ZoneInfo("America/New_York")
SESSION_OPEN = pd.Timestamp("2024-01-02 09:30", tz=TZ)


def make_bars(rows: list[dict]) -> pd.DataFrame:
    """rows: [{'minute': 0, 'open':.., 'high':.., 'low':.., 'close':..}, ...]"""
    idx = [SESSION_OPEN + pd.Timedelta(minutes=r["minute"]) for r in rows]
    df = pd.DataFrame(rows, index=pd.DatetimeIndex(idx))
    return df[["open", "high", "low", "close"]]


@pytest.fixture
def config() -> ORBConfig:
    return ORBConfig(
        primary_range_minutes=15,
        extended_range_minutes=30,
        max_entry_minutes=40,
        reward_risk_ratio=2.0,
        entry_buffer_pct=0.0,
    )


def test_long_breakout_on_primary_range(config):
    bars = make_bars(
        [
            {"minute": 0, "open": 100, "high": 101, "low": 99, "close": 100.5},
            {"minute": 5, "open": 100.5, "high": 100.8, "low": 99.5, "close": 100},
            {"minute": 10, "open": 100, "high": 100.9, "low": 99.8, "close": 100.6},
            # OR15 = high 101 / low 99, formed by the 3 bars above (minutes 0-10)
            {"minute": 15, "open": 100.6, "high": 102, "low": 100.5, "close": 101.8},  # breaks 101 -> long entry
            {"minute": 20, "open": 101.8, "high": 103.5, "low": 101.5, "close": 103.2},  # target = 101.8+2*2.8=107.4? see below
        ]
    )
    strategy = ORBStrategy(config)
    trade = strategy.run_session("TEST", SESSION_OPEN, bars)

    assert trade is not None
    assert trade.direction == "long"
    assert trade.range_used == "primary"
    assert trade.entry_price == 101.8
    assert trade.stop_price == 99  # OR15 low
    risk = trade.entry_price - trade.stop_price
    assert trade.target_price == pytest.approx(trade.entry_price + 2 * risk)


def test_short_breakout_on_extended_range_when_primary_range_holds(config):
    rows = [
        {"minute": 0, "open": 100, "high": 101, "low": 99, "close": 100},
        {"minute": 5, "open": 100, "high": 100.5, "low": 99.2, "close": 99.8},
        {"minute": 10, "open": 99.8, "high": 100.3, "low": 99, "close": 100},
        # OR15 = high 101 / low 99 -> stays inside during the primary window
        {"minute": 15, "open": 100, "high": 100.4, "low": 99.3, "close": 99.9},
        {"minute": 20, "open": 99.9, "high": 100.2, "low": 99.1, "close": 99.6},
        {"minute": 25, "open": 99.6, "high": 100, "low": 99.0, "close": 99.5},
        # OR30 finalized at minute 30 = high 101 / low 99 (no new extremes added minutes 15-25)
        {"minute": 30, "open": 99.5, "high": 99.6, "low": 98.5, "close": 98.7},  # breaks below 99 -> short entry
        {"minute": 35, "open": 98.7, "high": 99.0, "low": 97.0, "close": 97.2},
    ]
    bars = make_bars(rows)
    strategy = ORBStrategy(config)
    trade = strategy.run_session("TEST", SESSION_OPEN, bars)

    assert trade is not None
    assert trade.direction == "short"
    assert trade.range_used == "extended"
    assert trade.entry_price == 98.7
    assert trade.stop_price == 101  # OR30 high


def test_no_trade_when_price_stays_inside_both_ranges(config):
    rows = [
        {"minute": m, "open": 100, "high": 100.5, "low": 99.5, "close": 100}
        for m in range(0, 45, 5)
    ]
    bars = make_bars(rows)
    strategy = ORBStrategy(config)
    trade = strategy.run_session("TEST", SESSION_OPEN, bars)
    assert trade is None


def test_exit_hits_stop_loss(config):
    bars = make_bars(
        [
            {"minute": 0, "open": 100, "high": 101, "low": 99, "close": 100},
            {"minute": 10, "open": 100, "high": 100.5, "low": 99.5, "close": 100},
            {"minute": 15, "open": 100, "high": 102, "low": 100, "close": 101.5},  # long entry, stop=99
            {"minute": 20, "open": 101.5, "high": 101.6, "low": 98.5, "close": 99},  # drops through stop
        ]
    )
    strategy = ORBStrategy(config)
    trade = strategy.run_session("TEST", SESSION_OPEN, bars)

    assert trade is not None
    assert trade.exit_reason == "stop"
    assert trade.exit_price == 99
    assert trade.r_multiple == pytest.approx(-1.0)


def test_exit_closes_at_session_end_if_neither_stop_nor_target_hit(config):
    bars = make_bars(
        [
            {"minute": 0, "open": 100, "high": 101, "low": 99, "close": 100},
            {"minute": 10, "open": 100, "high": 100.5, "low": 99.5, "close": 100},
            {"minute": 15, "open": 100, "high": 102, "low": 100, "close": 101.5},  # long entry, stop=99, target=105.5
            {"minute": 20, "open": 101.5, "high": 102, "low": 101, "close": 101.8},
        ]
    )
    strategy = ORBStrategy(config)
    trade = strategy.run_session("TEST", SESSION_OPEN, bars)

    assert trade is not None
    assert trade.exit_reason == "session_close"
    assert trade.exit_price == 101.8
