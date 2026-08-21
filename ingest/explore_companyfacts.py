"""
Step 1 — read the raw companyfacts JSON before writing anything that
depends on its shape.

Deliberately not the ingestion script: it fetches one company, prints what
is actually there, and stores nothing. Per the build order, every mistake
in EDGAR ingestion comes from writing code against a mental model of the
data rather than the data itself.

Run:  SEC_CONTACT="you@example.com" ./.venv/bin/python explore_companyfacts.py
"""
import json
import os
import sys
from collections import Counter

import requests

CIK = "0000320193"  # Apple
URL = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json"

# SEC's fair-access policy requires a real contact address. Read it from the
# environment rather than hardcoding: this file is destined for a git repo,
# and a personal email committed once is committed forever. No default and
# no placeholder fallback — a fake contact is the thing that gets an IP
# blocked, so fail loudly instead of sending one.
contact = os.environ.get("SEC_CONTACT")
if not contact:
    sys.exit(
        "SEC_CONTACT is not set.\n"
        "SEC requires a User-Agent carrying a real contact address.\n"
        '  SEC_CONTACT="you@example.com" ./.venv/bin/python explore_companyfacts.py'
    )

HEADERS = {
    "User-Agent": f"Spire {contact}",
    "Accept-Encoding": "gzip, deflate",
}


def rule(title):
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


resp = requests.get(URL, headers=HEADERS, timeout=30)
print(f"GET {URL}")
print(f"  status        {resp.status_code} {resp.reason}")
print(f"  content-type  {resp.headers.get('Content-Type')}")
print(f"  bytes         {len(resp.content):,}")
resp.raise_for_status()

data = resp.json()

rule("TOP-LEVEL KEYS")
for k, v in data.items():
    kind = type(v).__name__
    detail = f"{len(v)} keys" if isinstance(v, dict) else repr(v)[:60]
    print(f"  {k:<12} {kind:<6} {detail}")

rule("facts -> namespaces")
for ns, tags in data.get("facts", {}).items():
    print(f"  {ns:<10} {len(tags):>5} tags")

usgaap = data.get("facts", {}).get("us-gaap", {})

rule("facts.us-gaap.Revenues.units.USD")
if "Revenues" not in usgaap:
    print("  ABSENT — us-gaap.Revenues does not exist for this filer.")
    print("  This is the first real finding: the tag the spec names as a")
    print("  fallback is not what Apple actually files under.")
    print("\n  Revenue-ish tags that DO exist here:")
    for tag in sorted(t for t in usgaap if "Revenue" in t):
        units = usgaap[tag].get("units", {})
        counts = ", ".join(f"{u}:{len(v)}" for u, v in units.items())
        print(f"    {tag}  ({counts})")
else:
    node = usgaap["Revenues"]
    print(f"  label   {node.get('label')}")
    print(f"  units   {list(node.get('units', {}).keys())}")
    usd = node.get("units", {}).get("USD", [])
    print(f"  USD entries: {len(usd)}")

    print("\n  --- first 3 entries, verbatim ---")
    for i, e in enumerate(usd[:3]):
        print(f"\n  [{i}]")
        print("      " + json.dumps(e, indent=6)[6:])

    print("\n  --- field presence across all USD entries ---")
    keys = Counter()
    for e in usd:
        keys.update(e.keys())
    for k, n in keys.most_common():
        flag = "" if n == len(usd) else "   <-- NOT on every entry"
        print(f"      {k:<8} {n:>5}/{len(usd)}{flag}")

    print("\n  --- 'start' present vs absent (flow vs point-in-time) ---")
    with_start = sum(1 for e in usd if e.get("start"))
    print(f"      with start:    {with_start}")
    print(f"      without start: {len(usd) - with_start}")

    print("\n  --- form / fp spread ---")
    print(f"      form: {dict(Counter(e.get('form') for e in usd))}")
    print(f"      fp:   {dict(Counter(e.get('fp') for e in usd))}")
