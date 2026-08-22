# ingest — the EDGAR data layer

Python batch job that loads SEC EDGAR filings and yfinance market data into
Postgres. The frontend never talks to either: it calls `/api/company` on its
own origin and gets pre-normalized JSON. EDGAR being down is invisible to Spire.

Nothing here runs in the browser, and nothing here ships to the client.

## Why a batch job and not a fetch

EDGAR requires a `User-Agent` carrying a real contact address. Browsers strip
custom headers on cross-origin requests, which is what killed the original
in-browser attempt. Python has no such restriction, so ingestion is a plain
server-to-server call and the data lands in Postgres once instead of being
re-fetched on every page load.

**Rate limit: 10 req/sec.** Every outbound request goes through one `_get()`
that sleeps 0.11s and sets the header, so a new call site cannot forget.

## Local setup

Requires Postgres 15+ (`UNIQUE NULLS NOT DISTINCT` and generated columns).

```bash
python3 -m venv ingest/.venv
ingest/.venv/bin/pip install -r ingest/requirements.txt
```

A throwaway cluster, no system service:

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export LC_ALL="en_US.UTF-8"          # macOS: without this the postmaster
                                     # dies with "became multithreaded"
initdb -D /tmp/spire-pg -U spire --auth=trust -E UTF8
pg_ctl -D /tmp/spire-pg -l /tmp/spire-pg.log \
  -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" start
createdb -h 127.0.0.1 -p 55432 -U spire spire
```

> The socket path matters: Postgres caps it at 103 bytes, so a deep temp
> directory fails with "Unix-domain socket path is too long". Keeping the
> socket in `/tmp` and connecting over TCP avoids it.

Then:

```bash
export DATABASE_URL="postgres://spire@127.0.0.1:55432/spire"
export SEC_CONTACT="you@example.com"   # required; SEC blocks a fake one

psql "$DATABASE_URL" -f ingest/schema.sql
ingest/.venv/bin/python ingest.py AAPL MSFT NVDA AMZN     # ~1s per company
ingest/.venv/bin/python market.py --sql AAPL MSFT | psql "$DATABASE_URL"
```

In zsh, expand a ticker variable with `${=TICKERS}` — zsh does **not**
word-split an unquoted `$TICKERS`, so all of them arrive as one argument and
every ticker reports as unknown.

## Running the app against it

```bash
npm run dev:api    # serves api/ on :3001 using DATABASE_URL
npm run dev        # vite proxies /api -> :3001
```

With `dev:api` not running the app still works: the fetch fails and Vantage
says "enter the figures by hand", which is the same path a failed deploy takes.

## The files

| file | does |
|---|---|
| `schema.sql` | tables, `fact_current` (restatement resolution), `ttm`, `market_latest` |
| `resolver.py` | normalized concept -> the XBRL tag a filer actually used |
| `ingest.py` | fetch, resolve, load, then derive quarters |
| `derive_quarters.sql` | discrete quarters from cumulative year-to-date periods |
| `market.py` | price, market cap, beta via yfinance |
| `explore_companyfacts.py` | prints a raw payload; read this before changing the resolver |

## Things that are true and surprising

- **`fy`/`fp` describe the FILING, not the fact.** The same FY2019 revenue
  carries `fy=2019`, `2020` and `2021` in successive 10-Ks. Period type is
  derived from `period_end - period_start`; the columns are named
  `filing_fy`/`filing_fp` so the trap cannot be re-entered.
- **Q4 is never filed as a quarter.** It exists only inside the 10-K, folded
  into the annual figure. Cash-flow concepts are worse: a 10-Q's cash flow
  statement covers the year to date, so only Q1 is ever discrete. Both are one
  shape — a cumulative ladder — and `derive_quarters.sql` differences it. Where
  a rung lands on a window that was also filed, the values match exactly:
  465 overlapping, 465 exact, 0 mismatches.
- **Never match XBRL tags by substring.** `AvailableForSaleSecuritiesDebtSecurities`
  is debt the company *owns as an investment*; matching "Debt" files a firm's
  portfolio as its borrowings. Likewise `AccumulatedDepreciation...` is a
  balance-sheet total, not the period expense.
- **A shell CIK can look like a success.** SEC's ticker map points `XOM` at a
  reorganisation shell with 274 facts while the operating history sits under a
  different CIK with 20,629. It resolved 14/17 concepts and reported clean, so
  there is a coverage guard.
- **SIC does not group peers cleanly.** Of 19 software companies, Workday files
  under 7374, Zscaler 7371, Palo Alto 3577 (computer peripherals).
- **Banks resolve ~11/17 and that is correct** — no gross profit, no classified
  balance sheet, no inventory. Those fields stay blank and Vantage skips them.
