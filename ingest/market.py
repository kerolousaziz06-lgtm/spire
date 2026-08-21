"""
market.py — the figures no filing contains: price, market cap, beta.

yfinance scrapes Yahoo's internal API. It is not an official feed and has
broken without warning before, so this module treats every response as
untrusted: it validates before returning, and returns None rather than a
half-populated row. A missing price makes Vantage skip a multiple and
M&A withhold a verdict, which is recoverable. A WRONG price is not -- it
sets the premium and drives the "offer below market price" check.

Usage:
    ./.venv/bin/python market.py AAPL MSFT          # report
    ./.venv/bin/python market.py --sql AAPL         # emit INSERTs
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone

import yfinance as yf

# price x shares should reproduce market cap. Yahoo populates these fields
# from different places and they can disagree when the scrape is degraded,
# so a wide but finite band catches a broken response without tripping on
# ordinary rounding or an intraday lag.
RECONCILE_TOLERANCE = 0.02


@dataclass
class Quote:
    ticker: str
    as_of: date
    price: float
    market_cap: float
    shares_outstanding: float | None
    beta: float | None
    currency: str
    note: str = ""


def _num(v) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    f = float(v)
    return f if f == f and f not in (float("inf"), float("-inf")) else None


def fetch(ticker: str) -> tuple[Quote | None, str]:
    """Return (quote, reason). quote is None whenever anything is off."""
    try:
        info = yf.Ticker(ticker).info or {}
    except Exception as e:                      # network, parse, rate limit
        return None, f"fetch failed: {type(e).__name__}: {e}"

    if not info:
        return None, "empty response (Yahoo may have changed shape)"

    if info.get("quoteType") not in (None, "EQUITY"):
        return None, f"not an equity: quoteType={info.get('quoteType')}"

    price = _num(info.get("currentPrice")) or _num(info.get("regularMarketPrice"))
    cap = _num(info.get("marketCap"))
    shares = _num(info.get("sharesOutstanding"))
    beta = _num(info.get("beta"))
    currency = (info.get("currency") or "").upper() or None

    if price is None or price <= 0:
        return None, "no usable price"
    if cap is None or cap <= 0:
        return None, "no usable market cap"
    if currency is None or len(currency) != 3:
        return None, f"unusable currency: {info.get('currency')!r}"

    note = ""
    if shares and shares > 0:
        implied = price * shares
        drift = abs(implied - cap) / cap
        if drift > RECONCILE_TOLERANCE:
            # Do not silently prefer one field over the other. Either the
            # scrape is degraded or the fields are from different moments;
            # both mean the row should not be trusted as a unit.
            return None, (f"price x shares does not reconcile to market cap: "
                          f"{implied:,.0f} vs {cap:,.0f} ({drift:.2%} apart)")
        note = f"reconciles to {drift:.4%}"
    else:
        note = "no share count returned; reconciliation skipped"

    return Quote(ticker.upper(), datetime.now(timezone.utc).date(), price, cap,
                 shares, beta, currency, note), "ok"


def as_sql(q: Quote) -> str:
    def n(v): return "NULL" if v is None else repr(float(v))
    return (
        "INSERT INTO market_data (ticker, as_of, price, market_cap, "
        "shares_outstanding, beta, currency) VALUES ("
        f"'{q.ticker}', '{q.as_of}', {n(q.price)}, {n(q.market_cap)}, "
        f"{n(q.shares_outstanding)}, {n(q.beta)}, '{q.currency}') "
        "ON CONFLICT (ticker, as_of) DO UPDATE SET "
        "price=EXCLUDED.price, market_cap=EXCLUDED.market_cap, "
        "shares_outstanding=EXCLUDED.shares_outstanding, "
        "beta=EXCLUDED.beta, fetched_at=NOW();"
    )


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--sql"]
    emit_sql = "--sql" in sys.argv
    if not args:
        sys.exit("usage: market.py [--sql] TICKER [TICKER ...]")

    failures = 0
    for t in args:
        q, reason = fetch(t)
        if q is None:
            failures += 1
            print(f"-- {t}: SKIPPED -- {reason}", file=sys.stderr)
            continue
        if emit_sql:
            print(as_sql(q))
        else:
            print(f"{q.ticker}  as_of {q.as_of}  {q.currency}")
            print(f"   price       {q.price:,.2f}")
            print(f"   market cap  {q.market_cap:,.0f}")
            print(f"   shares      {q.shares_outstanding:,.0f}"
                  if q.shares_outstanding else "   shares      n/a")
            print(f"   beta        {q.beta}")
            print(f"   {q.note}")
    if failures:
        print(f"-- {failures}/{len(args)} skipped", file=sys.stderr)
