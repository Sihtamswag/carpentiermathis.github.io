#!/usr/bin/env python3
"""Backtest the dual-range ORB strategy.

Examples:
    python run_backtest.py --asset-class us_equity
    python run_backtest.py --asset-class forex --symbol EURUSD=X
"""

import argparse
from pathlib import Path

import yaml

from orb.backtest import ORBBacktester
from orb.strategy import ORBConfig

ASSET_CLASS_TO_SESSION_KEY = {"us_equity": "us_equity", "forex": "forex", "futures": "us_futures"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest the dual-range ORB strategy.")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--symbol", help="Override: backtest a single symbol instead of the config list")
    parser.add_argument("--asset-class", choices=["us_equity", "forex", "futures"], default="us_equity")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    strategy_cfg = ORBConfig(**cfg["strategy"])
    backtester = ORBBacktester(strategy_cfg)

    symbols = [args.symbol] if args.symbol else cfg["symbols"][args.asset_class]
    session_key = ASSET_CLASS_TO_SESSION_KEY[args.asset_class]

    results_dir = Path("results")
    results_dir.mkdir(exist_ok=True)

    for symbol in symbols:
        result = backtester.run(
            symbol, session_key, interval=cfg["backtest"]["interval"], period=cfg["backtest"]["period"]
        )
        print(result.summary())
        out_path = results_dir / f"{symbol.replace('/', '_')}_trades.csv"
        result.to_dataframe().to_csv(out_path, index=False)
        print(f"  -> trades saved to {out_path}")


if __name__ == "__main__":
    main()
