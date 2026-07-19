"""Broker abstraction used by live trading.

PaperBroker is the safe default: an in-memory simulator that needs no API
keys and works for any asset class. AlpacaBroker wires up real paper/live
execution for US equities. IBKRBroker wires up Interactive Brokers, which
covers equities, forex and futures on a single account.
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
    # True for brokers where submit_bracket_order() places a real bracket
    # (stop-loss + take-profit legs) on the broker's own servers, so the
    # broker itself executes the exit — the live loop should just watch for
    # the position to disappear rather than also managing the exit locally.
    # PaperBroker sets this False since it has no real server-side orders.
    manages_exits: bool = True

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
    manages_exits = False

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


class IBKRBroker(Broker):
    """Live/paper execution via Interactive Brokers. Covers us_equity, forex
    and us_futures on one account.

    Requires TWS or IB Gateway running and reachable (Configure > API >
    Settings > Enable ActiveX and Socket Clients), and ib_async (or its
    predecessor ib_insync) installed.

    Default ports: TWS paper 7497, TWS live 7496, IB Gateway paper 4002,
    IB Gateway live 4001.
    """

    def __init__(self, asset_class: str, host: str = "127.0.0.1", port: int = 7497, client_id: int = 1):
        try:
            import ib_async as ib_lib
        except ImportError:
            try:
                import ib_insync as ib_lib
            except ImportError as e:
                raise ImportError("Install ib_async (recommended) or ib_insync: pip install ib_async") from e

        self._ib_lib = ib_lib
        self.asset_class = asset_class
        self.ib = ib_lib.IB()
        self.ib.connect(host, port, clientId=client_id)

    def _contract(self, symbol: str):
        m = self._ib_lib
        if self.asset_class == "us_equity":
            return m.Stock(symbol, "SMART", "USD")
        if self.asset_class == "forex":
            return m.Forex(symbol.replace("/", "").replace("=X", ""))
        if self.asset_class == "us_futures":
            # Futures contracts expire, so `symbol` must be IBKR's specific
            # local symbol for the contract you want (e.g. "ESZ4"), not the
            # continuous root ("ES=F") used for backtesting.
            return m.Future(localSymbol=symbol, exchange="CME")
        raise ValueError(f"Unsupported asset class: {self.asset_class}")

    def submit_bracket_order(self, symbol, side, qty, entry_price, stop_price, target_price) -> str:
        contract = self._contract(symbol)
        self.ib.qualifyContracts(contract)

        action = "BUY" if side == "long" else "SELL"
        bracket = self.ib.bracketOrder(
            action, qty, limitPrice=entry_price, takeProfitPrice=target_price, stopLossPrice=stop_price
        )
        # Entry is a breakout confirmed by a bar close, so it should fill at
        # market rather than sit as a limit order at the (already passed) price.
        bracket.parent.orderType = "MKT"
        bracket.parent.lmtPrice = 0.0

        for order in bracket:
            self.ib.placeOrder(contract, order)
        self.ib.sleep(1)  # let IB assign/acknowledge the parent order id
        return str(bracket.parent.orderId)

    def get_position(self, symbol: str) -> Optional[Position]:
        for pos in self.ib.positions():
            if pos.contract.symbol == symbol or pos.contract.localSymbol == symbol:
                if pos.position == 0:
                    return None
                side = "long" if pos.position > 0 else "short"
                return Position(symbol, abs(pos.position), side, pos.avgCost, 0.0, 0.0)
        return None

    def close_position(self, symbol: str, price: float = None) -> None:
        pos = self.get_position(symbol)
        if pos is None:
            return
        contract = self._contract(symbol)
        self.ib.qualifyContracts(contract)
        action = "SELL" if pos.side == "long" else "BUY"
        self.ib.placeOrder(contract, self._ib_lib.MarketOrder(action, pos.qty))
