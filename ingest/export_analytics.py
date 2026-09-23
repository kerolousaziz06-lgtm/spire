"""
export_analytics.py — freeze the analytical views into static JSON.

    DATABASE_URL=... ./.venv/bin/python ingest/export_analytics.py

Same reasoning as the per-company export: the figures change weekly, so
paying for a database connection on every page load buys nothing and adds
something that can be down.

Unlike the company export, this one queries the VIEWS directly rather
than going through an API route. The view is the shared definition -- the
shape lives in analytics.sql and nowhere else -- so there is no second
implementation to drift from it.
"""
from __future__ import annotations

import json
import os
import sys
from decimal import Decimal
from datetime import date

import psycopg2
import psycopg2.extras

OUT = "public/data"


def jsonable(v):
    # NUMERIC arrives as Decimal, which json cannot encode. float() is
    # right here: these are ratios and percentages for display, not money
    # being summed, so binary rounding cannot accumulate into a wrong
    # total the way it would in the ledger engine.
    if isinstance(v, Decimal):
        f = float(v)
        return f if f == f and abs(f) != float("inf") else None
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and (v != v or abs(v) == float("inf")):
        return None          # NaN/Infinity are not JSON and never useful
    return v


def fetch(cur, sql: str) -> list[dict]:
    cur.execute(sql)
    return [{k: jsonable(v) for k, v in dict(r).items()} for r in cur.fetchall()]


def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set.")

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            screener = fetch(cur, """
                SELECT ticker, name, sector, industry,
                       revenue, net_income, market_cap,
                       gross_margin, operating_margin, net_margin, roe, roa,
                       debt_to_equity, free_cash_flow,
                       yoy_growth, cagr_3y,
                       pe, ps, ev_ebitda, ev_revenue,
                       annual_volatility, beta_vs_universe,
                       net_margin_pct_in_sector, growth_pct_in_sector,
                       cheapness_pct_in_sector, roe_pct_in_sector,
                       sector_size
                FROM screener
                -- A row with no revenue and no market cap can be filtered
                -- and sorted but says nothing; it pads the table and makes
                -- the screen look broken rather than empty.
                WHERE revenue IS NOT NULL OR market_cap IS NOT NULL
                ORDER BY market_cap DESC NULLS LAST""")

            sectors = fetch(cur, """
                SELECT sector, companies, with_ev_ebitda,
                       ev_ebitda_q1, ev_ebitda_median, ev_ebitda_q3,
                       pe_median, ps_median, ev_revenue_median
                FROM sector_comps ORDER BY companies DESC""")

            risk = fetch(cur, """
                SELECT ticker, trading_days, since, through,
                       annual_volatility, annual_return, beta_vs_universe
                FROM company_risk ORDER BY ticker""")

            growth = fetch(cur, """
                SELECT ticker, period_end, revenue, yoy_growth, cagr_3y
                FROM revenue_growth
                WHERE recency <= 5
                ORDER BY ticker, period_end DESC""")
    finally:
        conn.close()

    payload = {
        "screener.json": {"generated": date.today().isoformat(),
                          "count": len(screener), "rows": screener},
        "sectors.json":  {"generated": date.today().isoformat(),
                          "count": len(sectors), "sectors": sectors},
        "risk.json":     {"generated": date.today().isoformat(),
                          "count": len(risk), "rows": risk},
        "growth.json":   {"generated": date.today().isoformat(),
                          "count": len({r["ticker"] for r in growth}),
                          "rows": growth},
    }

    os.makedirs(OUT, exist_ok=True)
    for name, body in payload.items():
        text = json.dumps(body, separators=(",", ":"))
        open(f"{OUT}/{name}", "w").write(text)
        n = body.get("count")
        print(f"  {name:<16} {len(text)/1024:>7.1f} KB  ({n} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
