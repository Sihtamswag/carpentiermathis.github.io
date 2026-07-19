#!/usr/bin/env python3
"""Paper/live trade the dual-range ORB strategy.

Examples:
    python run_live.py --symbol SPY --symbol AAPL --asset-class us_equity
    python run_live.py --symbol SPY --asset-class us_equity --broker alpaca
"""

import argparse

import yaml

from orb.broker import AlpacaBroker, PaperBroker
from orb.live import run_live
from orb.strategy import ORBConfig

try:
    from dotenv import load_dotenv

    load_dotenv()  # loads ALPACA_API_KEY / ALPACA_SECRET_KEY from a local .env if present
except ImportError:
    pass

ASSET_CLASS_TO_SESSION_KEY = {"us_equity": "us_equity", "forex": "forex", "futures": "us_futures"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Paper/live trade the dual-range ORB strategy.")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--symbol", action="append", required=True, help="Repeatable, e.g. --symbol SPY --symbol AAPL")
    parser.add_argument("--asset-class", choices=["us_equity", "forex", "futures"], default="us_equity")
    parser.add_argument("--broker", choices=["paper", "alpaca"], default="paper")
    parser.add_argument("--qty", type=float, default=1)
    parser.add_argument("--poll-seconds", type=int, default=60)
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    strategy_cfg = ORBConfig(**cfg["strategy"])

    if args.broker == "alpaca":
        if args.asset_class != "us_equity":
            raise SystemExit(
                "The Alpaca broker only supports us_equity here. "
                "Forex/futures live execution needs OANDA/IBKR wiring (see README)."
            )
        broker = AlpacaBroker(paper=True)
    else:
        # PaperBroker is a pure simulator, so it works for any asset class out of the box.
        broker = PaperBroker()

    run_live(
        args.symbol,
        ASSET_CLASS_TO_SESSION_KEY[args.asset_class],
        strategy_cfg,
        broker=broker,
        qty=args.qty,
        poll_seconds=args.poll_seconds,
    )


if __name__ == "__main__":
    main()
