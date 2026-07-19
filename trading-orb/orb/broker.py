"""Broker abstraction used by live trading.

PaperBroker is the safe default: an in-memory simulator that needs no API
keys and works for any asset class. AlpacaBroker wires up real paper/live
execution for US equities. Forex and futures live execution need a
dedicated broker (OANDA, Interactive Brokers, ...) — NotWiredBroker documents
that clearly instead of pretending to support it.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal, Optional


@dataclass
class Position:
    symbol: str
    qty: float
    side: Literal["long", "short"]
    entry_price: float
    stop_price: float
    target_price: float


class Broker(ABC):
    @abstractmethod
    def submit_bracket_order(
        self,
        symbol: str,
        side: Literal["long", "short"],
        qty: float,
        entry_price: float,
        stop_price: float,
        target_price: float,
    ) -> str: ...

    @abstractmethod
    def get_position(self, symbol: str) -> Optional[Position]: ...

    @abstractmethod
    def close_position(self, symbol: str, price: float) -> None: ...


class PaperBroker(Broker):
    def __init__(self, starting_cash: float = 100_000.0):
        self.cash = starting_cash
        self.positions: dict[str, Position] = {}
        self.fills: list[dict] = []

    def submit_bracket_order(self, symbol, side, qty, entry_price, stop_price, target_price) -> str:
        self.positions[symbol] = Position(symbol, qty, side, entry_price, stop_price, target_price)
        order_id = f"paper-{len(self.fills) + 1}"
        self.fills.append(
            {"order_id": order_id, "symbol": symbol, "side": side, "qty": qty, "price": entry_price, "action": "open"}
        )
        return order_id

    def get_position(self, symbol: str) -> Optional[Position]:
        return self.positions.get(symbol)

    def close_position(self, symbol: str, price: float) -> None:
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return
        pnl = (price - pos.entry_price) if pos.side == "long" else (pos.entry_price - price)
        self.cash += pnl * pos.qty
        self.fills.append(
            {"symbol": symbol, "side": pos.side, "qty": pos.qty, "price": price, "action": "close", "pnl": pnl * pos.qty}
        )


class AlpacaBroker(Broker):
    """Live/paper execution for US equities. Requires alpaca-py plus
    ALPACA_API_KEY / ALPACA_SECRET_KEY environment variables."""

    def __init__(self, paper: bool = True):
        try:
            from alpaca.trading.client import TradingClient
            from alpaca.trading.enums import OrderSide, TimeInForce
            from alpaca.trading.requests import MarketOrderRequest
        except ImportError as e:
            raise ImportError("Install alpaca-py: pip install alpaca-py") from e

        api_key = os.environ.get("ALPACA_API_KEY")
        secret_key = os.environ.get("ALPACA_SECRET_KEY")
        if not api_key or not secret_key:
            raise RuntimeError("Set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables")

        self._OrderSide = OrderSide
        self._TimeInForce = TimeInForce
        self._MarketOrderRequest = MarketOrderRequest
        self.client = TradingClient(api_key, secret_key, paper=paper)

    def submit_bracket_order(self, symbol, side, qty, entry_price, stop_price, target_price) -> str:
        order = self._MarketOrderRequest(
            symbol=symbol,
            qty=qty,
            side=self._OrderSide.BUY if side == "long" else self._OrderSide.SELL,
            time_in_force=self._TimeInForce.DAY,
            order_class="bracket",
            stop_loss={"stop_price": stop_price},
            take_profit={"limit_price": target_price},
        )
        result = self.client.submit_order(order)
        return str(result.id)

    def get_position(self, symbol: str) -> Optional[Position]:
        try:
            pos = self.client.get_open_position(symbol)
        except Exception:
            return None
        qty = float(pos.qty)
        return Position(symbol, qty, "long" if qty > 0 else "short", float(pos.avg_entry_price), 0.0, 0.0)

    def close_position(self, symbol: str, price: float = None) -> None:
        self.client.close_position(symbol)


class NotWiredBroker(Broker):
    """Placeholder for asset classes with no live broker integration yet
    (forex via OANDA, futures via Interactive Brokers). Backtesting still
    works for these asset classes; only live execution is unimplemented."""

    def __init__(self, reason: str):
        self.reason = reason

    def submit_bracket_order(self, *args, **kwargs):
        raise NotImplementedError(self.reason)

    def get_position(self, symbol: str):
        raise NotImplementedError(self.reason)

    def close_position(self, symbol: str, price: float):
        raise NotImplementedError(self.reason)
