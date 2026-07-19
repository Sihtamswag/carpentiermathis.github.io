#!/usr/bin/env python3
"""Paper/live trade the dual-range ORB strategy.

Examples:
    python run_live.py --symbol SPY --symbol AAPL --asset-class us_equity
    python run_live.py --symbol SPY --asset-class us_equity --broker alpaca
    python run_live.py --symbol EURUSD=X --asset-class forex --broker ibkr --ib-port 7497
"""

import argparse

import yaml

from orb.broker import AlpacaBroker, IBKRBroker, PaperBroker
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
    parser.add_argument("--broker", choices=["paper", "alpaca", "ibkr"], default="paper")
    parser.add_argument("--qty", type=float, default=1)
    parser.add_argument("--poll-seconds", type=int, default=60)
    parser.add_argument("--ib-host", default="127.0.0.1")
    parser.add_argument(
        "--ib-port", type=int, default=7497, help="7497=TWS paper, 7496=TWS live, 4002=Gateway paper, 4001=Gateway live"
    )
    parser.add_argument("--ib-client-id", type=int, default=1)
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    strategy_cfg = ORBConfig(**cfg["strategy"])
    session_key = ASSET_CLASS_TO_SESSION_KEY[args.asset_class]

    if args.broker == "alpaca":
        if args.asset_class != "us_equity":
            raise SystemExit("The Alpaca broker only supports us_equity here. Use --broker ibkr for forex/futures.")
        broker = AlpacaBroker(paper=True)
    elif args.broker == "ibkr":
        broker = IBKRBroker(session_key, host=args.ib_host, port=args.ib_port, client_id=args.ib_client_id)
    else:
        # PaperBroker is a pure simulator, so it works for any asset class out of the box.
        broker = PaperBroker()

    run_live(
        args.symbol,
        session_key,
        strategy_cfg,
        broker=broker,
        qty=args.qty,
        poll_seconds=args.poll_seconds,
    )


if __name__ == "__main__":
    main()
