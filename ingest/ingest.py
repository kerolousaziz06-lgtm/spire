"""
ingest.py — fetch EDGAR facts for a list of tickers and load them into Postgres.

Run:
    SEC_CONTACT="you@example.com" DATABASE_URL="postgres://..." \
        ./.venv/bin/python ingest.py AAPL JPM MSFT

Order matters and is enforced: facts land first, then derive_quarters.sql
runs, then market.py. Deriving before the facts exist produces nothing;
deriving twice is harmless because the pass is idempotent.

RATE LIMIT. SEC allows 10 req/sec and asks for a real contact in the
User-Agent. Every request goes through _get(), which sleeps 0.11s and
sets the header -- there is no other way out of this module, so the limit
cannot be bypassed by adding a call site later.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass

import psycopg2
import psycopg2.extras
import requests

from resolver import CONCEPT_SPECS, _d, _newest, report, STALE_VS_FILING_DAYS

SEC_RATE_LIMIT_SECONDS = 0.11

# A ticker can resolve most concepts and still be useless. SEC's own
# ticker->CIK map points XOM at CIK 0002115436 "ExxonMobil Holdings Corp",
# a reorganisation shell with 100 tags and 274 facts, while the operating
# history sits at CIK 0000034088 with 447 tags and 20,629 facts. The shell
# resolved 14/17 concepts and reported as a clean ingest.
#
# That is the failure this codebase most distrusts: not an error, a
# confident-looking success carrying nothing. TTM needs four consecutive
# quarters and MonteVue wants years of them, so a company whose history is
# this thin is reported as INCOMPLETE rather than quietly accepted.
MIN_HISTORY_YEARS = 3
MIN_FACTS = 250
TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"

_contact = os.environ.get("SEC_CONTACT")
if not _contact:
    sys.exit('SEC_CONTACT is not set. SEC requires a real contact address.\n'
             '  SEC_CONTACT="you@example.com" ./.venv/bin/python ingest.py AAPL')

_HEADERS = {"User-Agent": f"Spire {_contact}", "Accept-Encoding": "gzip, deflate"}
_last_call = 0.0


def _get(url: str) -> requests.Response | None:
    """The only outbound path. Sleeps to honour the rate limit, always."""
    global _last_call
    wait = SEC_RATE_LIMIT_SECONDS - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    try:
        r = requests.get(url, headers=_HEADERS, timeout=30)
    except requests.RequestException as e:
        print(f"    ! request failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None
    finally:
        _last_call = time.monotonic()
    if r.status_code != 200:
        print(f"    ! HTTP {r.status_code} for {url}", file=sys.stderr)
        return None
    return r


@dataclass
class Company:
    cik: str
    ticker: str
    name: str
    sic: str | None


def ticker_map() -> dict[str, Company]:
    r = _get(TICKER_MAP_URL)
    if r is None:
        sys.exit("could not fetch the ticker->CIK map; nothing to do")
    out = {}
    for row in r.json().values():
        out[row["ticker"].upper()] = Company(
            f"{row['cik_str']:010d}", row["ticker"].upper(), row["title"], None)
    return out


def fetch_company(c: Company) -> tuple[Company, dict] | None:
    """Submissions gives SIC and the canonical name; companyfacts gives facts."""
    sub = _get(f"https://data.sec.gov/submissions/CIK{c.cik}.json")
    if sub is not None:
        j = sub.json()
        c = Company(c.cik, c.ticker, j.get("name") or c.name, (j.get("sic") or None))

    facts = _get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c.cik}.json")
    if facts is None:
        return None
    try:
        return c, facts.json()["facts"]
    except (ValueError, KeyError):
        print(f"    ! {c.ticker}: companyfacts had no 'facts' key", file=sys.stderr)
        return None


def load(conn, c: Company, facts: dict) -> tuple[int, list[str], list[str], list[str]]:
    rows, unresolved, stale = [], [], []
    oldest = newest = None
    for concept, res, lag in report(facts):
        if not res.ok:
            unresolved.append(concept)
            continue
        if lag is not None and lag > STALE_VS_FILING_DAYS:
            stale.append(f"{concept}({lag}d)")
        for e in res.entries:
            end = _d(e["end"])
            oldest = end if oldest is None or end < oldest else oldest
            newest = end if newest is None or end > newest else newest
            rows.append((c.cik, concept, res.tag, e.get("start"), e["end"],
                         e["val"], e.get("form") or "NA", e.get("accn") or "NA",
                         e.get("filed") or e["end"], e.get("fy"),
                         e.get("fp"), e.get("frame")))

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO company (cik, ticker, name, sic) VALUES (%s,%s,%s,%s) "
            "ON CONFLICT (cik) DO UPDATE SET ticker=EXCLUDED.ticker, "
            "name=EXCLUDED.name, sic=EXCLUDED.sic, updated_at=NOW()",
            (c.cik, c.ticker, c.name, c.sic))
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO financial_fact (cik,concept,raw_tag,period_start,"
            "period_end,value,form,accn,filed_date,filing_fy,filing_fp,frame) "
            "VALUES %s ON CONFLICT ON CONSTRAINT financial_fact_natural_key "
            "DO NOTHING", rows, page_size=1000)

    coverage = []
    span_years = ((newest - oldest).days / 365.25) if oldest and newest else 0
    if len(rows) < MIN_FACTS:
        coverage.append(f"only {len(rows)} facts (expected >{MIN_FACTS})")
    if span_years < MIN_HISTORY_YEARS:
        coverage.append(f"only {span_years:.1f}y of history "
                        f"(expected >{MIN_HISTORY_YEARS}y)")
    return len(rows), unresolved, stale, coverage


def main(tickers: list[str]) -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set.")

    tmap = ticker_map()
    unknown = [t for t in tickers if t.upper() not in tmap]
    if unknown:
        print(f"unknown ticker(s), skipped: {', '.join(unknown)}", file=sys.stderr)

    conn = psycopg2.connect(dsn)
    failures = 0
    try:
        for t in tickers:
            t = t.upper()
            if t not in tmap:
                failures += 1
                continue
            print(f"\n{t}  CIK {tmap[t].cik}")
            got = fetch_company(tmap[t])
            if got is None:
                failures += 1
                continue
            c, facts = got
            n, unresolved, stale, coverage = load(conn, c, facts)
            conn.commit()
            print(f"    {c.name}  SIC {c.sic or '-'}")
            print(f"    {n:,} facts, "
                  f"{len(CONCEPT_SPECS) - len(unresolved)}/{len(CONCEPT_SPECS)} concepts")
            if unresolved:
                print(f"    unresolved: {', '.join(unresolved)}")
            if stale:
                print(f"    stale (left blank downstream): {', '.join(stale)}")
            if coverage:
                failures += 1
                print(f"    INCOMPLETE -- {'; '.join(coverage)}")
                print(f"    this CIK is probably a shell or a successor entity; "
                      f"check for a predecessor CIK before trusting {c.ticker}")

        print("\nderiving quarters ...")
        with conn.cursor() as cur, open("derive_quarters.sql") as f:
            cur.execute(f.read())
            conn.commit()
            cur.execute("SELECT count(*) FROM financial_fact WHERE is_derived")
            print(f"    {cur.fetchone()[0]:,} derived quarters in table")
    finally:
        conn.close()
    return failures


if __name__ == "__main__":
    # Unknown flags are an ERROR, never silently dropped. The first
    # version filtered anything starting with "--" and an earlier
    # docstring advertised a --sic flag that was never implemented: the
    # flag vanished and its VALUE was then treated as a ticker, so
    # `ingest.py --sic 6021` looked like it worked and quietly ingested
    # nothing while reporting 6021 as an unknown ticker.
    args, flags = [], []
    for a in sys.argv[1:]:
        (flags if a.startswith("-") else args).append(a)
    if flags:
        sys.exit(f"unrecognised option(s): {' '.join(flags)}\n"
                 "usage: ingest.py TICKER [TICKER ...]")
    if not args:
        sys.exit("usage: ingest.py TICKER [TICKER ...]")
    sys.exit(1 if main(args) else 0)
