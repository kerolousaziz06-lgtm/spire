"""
prices.py — daily closes for the universe, into price_history.

    DATABASE_URL=... ./.venv/bin/python ingest/prices.py AAPL MSFT
    DATABASE_URL=... ./.venv/bin/python ingest/prices.py --file ingest/tickers.txt

Downloaded in ONE batched request rather than per ticker: yfinance fetches
hundreds of symbols in a single call, and looping instead turns a 20-second
job into several minutes of avoidable requests against a scraped endpoint.

auto_adjust=True is load-bearing. A raw close series puts a fake -50%
return on every split date, and a volatility computed from that is wrong
in the plausible direction -- larger, not obviously broken.
"""
from __future__ import annotations

import os
import sys

import psycopg2
import psycopg2.extras
import yfinance as yf

PERIOD = os.environ.get("PRICE_PERIOD", "2y")
# Under ~6 months a volatility estimate is noise; company_risk enforces
# 120 trading days, so a ticker below that is dropped here with a reason
# rather than silently producing a confident-looking number downstream.
MIN_ROWS = 120


def read_tickers(argv: list[str]) -> list[str]:
    if "--file" in argv:
        path = argv[argv.index("--file") + 1]
        out = []
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line.upper())
        return out
    return [a.upper() for a in argv if not a.startswith("-")]


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set.")

    tickers = read_tickers(sys.argv[1:])
    if not tickers:
        sys.exit("usage: prices.py TICKER... | --file tickers.txt")

    print(f"downloading {PERIOD} of daily closes for {len(tickers)} tickers ...")
    df = yf.download(
        tickers, period=PERIOD, interval="1d",
        auto_adjust=True, progress=False, group_by="ticker", threads=True,
    )
    if df is None or df.empty:
        sys.exit("yfinance returned nothing; leaving price_history untouched")

    rows, skipped = [], []
    for t in tickers:
        try:
            sub = df[t] if len(tickers) > 1 else df
            sub = sub[["Close", "Volume"]].dropna(subset=["Close"])
        except KeyError:
            skipped.append((t, "absent from the response"))
            continue
        if len(sub) < MIN_ROWS:
            skipped.append((t, f"only {len(sub)} rows"))
            continue
        for day, r in sub.iterrows():
            close = float(r["Close"])
            if close <= 0:
                continue          # the CHECK would reject it anyway
            vol = r["Volume"]
            rows.append((t, day.date(), close,
                         int(vol) if vol == vol else None))

    if not rows:
        sys.exit("no usable rows; leaving price_history untouched")

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO price_history (ticker, day, close, volume) VALUES %s "
                # Re-running must be free. A close can also be RESTATED by a
                # later split adjustment, so an existing row is updated
                # rather than kept -- the adjusted series has to stay
                # internally consistent or its returns are wrong at the seam.
                "ON CONFLICT (ticker, day) DO UPDATE SET "
                "close = EXCLUDED.close, volume = EXCLUDED.volume",
                rows, page_size=5000)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(DISTINCT ticker), min(day), max(day) "
                        "FROM price_history")
            n, t, lo, hi = cur.fetchone()
            print(f"  {len(rows):,} rows written")
            print(f"  table now: {n:,} rows, {t} tickers, {lo} .. {hi}")
    finally:
        conn.close()

    for t, why in skipped:
        print(f"  ! {t}: {why}", file=sys.stderr)
    if skipped:
        print(f"  {len(skipped)}/{len(tickers)} skipped", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
