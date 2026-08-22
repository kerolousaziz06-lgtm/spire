"""
resolver.py — normalized concept name -> the XBRL tag a filer actually used.

Filers tag the same line item differently, so every concept carries a
priority-ordered list of candidate tags and the first USABLE one wins.
Nothing here touches the database; it reads a companyfacts payload and
returns what it found, or None with a reason. It never invents a value.

Two things learned from reading Apple's payload, both encoded below:

  1. Tags are matched EXACTLY, never by substring. Apple carries
     AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment
     (a balance-sheet accumulated total) alongside the real P&L D&A, and
     IncomeTaxExaminationInterestExpense alongside real interest expense.
     A substring match on "Depreciation" or "InterestExpense" picks the
     wrong one and looks plausible doing it.

  2. "First tag with data" is not enough. Apple's us-gaap:Revenues has 11
     entries -- all from a single 2018 filing -- while the tag it really
     reports under has 117 spanning to 2026. Taking Revenues because it
     sorts earlier would pre-fill Vantage with a stale 2018 figure and
     rate it confidently. So a candidate is rejected as STALE when its
     newest period ends more than STALE_DAYS behind the best candidate.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

# A candidate more than this far behind the freshest candidate is assumed
# to be a legacy tag the filer has stopped using.
STALE_DAYS = 400


@dataclass(frozen=True)
class ConceptSpec:
    unit: str                       # "USD" or "shares"
    tags: tuple[str, ...]           # priority order, "<namespace>:<Tag>"
    components: tuple[str, ...] = ()  # summed only if no tag resolves


# Qualified as "<namespace>:<Tag>" because shares_outstanding legitimately
# lives in dei while everything else is us-gaap.
CONCEPT_SPECS: dict[str, ConceptSpec] = {
    "revenue": ConceptSpec("USD", (
        "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
        "us-gaap:Revenues",
        "us-gaap:SalesRevenueNet",
        "us-gaap:SalesRevenueGoodsNet",
    )),
    "gross_profit":     ConceptSpec("USD", ("us-gaap:GrossProfit",)),
    "operating_income": ConceptSpec("USD", ("us-gaap:OperatingIncomeLoss",)),
    "net_income":       ConceptSpec("USD", (
        "us-gaap:NetIncomeLoss",
        "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic",
    )),

    # --- five concepts the original spec omitted -------------------------
    # Each one gates analysis Vantage already ships: without them ROIC,
    # both liquidity ratios and EV/EBITDA silently drop to MissingData.
    "interest_expense": ConceptSpec("USD", (
        "us-gaap:InterestExpense",
        "us-gaap:InterestExpenseDebt",
        "us-gaap:InterestAndDebtExpense",
    )),
    "current_assets":      ConceptSpec("USD", ("us-gaap:AssetsCurrent",)),
    "current_liabilities": ConceptSpec("USD", ("us-gaap:LiabilitiesCurrent",)),
    "inventory":           ConceptSpec("USD", (
        "us-gaap:InventoryNet",
        "us-gaap:InventoryFinishedGoodsNetOfReserves",
    )),
    "depreciation_amortization": ConceptSpec("USD",
        tags=(
            # NOT Accumulated* -- that is the balance-sheet running total,
            # not the period expense EBITDA needs. NOT Future*Amortization*
            # either: those are forward-looking disclosures of amortisation
            # still to come. Both would resolve and both would be wrong.
            "us-gaap:DepreciationDepletionAndAmortization",
            "us-gaap:DepreciationAmortizationAndAccretionNet",
            "us-gaap:DepreciationAndAmortization",
        ),
        # Microsoft publishes NO combined tag -- only Depreciation and
        # AmortizationOfIntangibleAssets separately -- so EV/EBITDA was
        # being skipped for it entirely. Summed, with the usual rule that a
        # period missing from either component is dropped rather than
        # half-counted.
        components=(
            "us-gaap:Depreciation",
            "us-gaap:AmortizationOfIntangibleAssets",
        ),
    ),
    # ---------------------------------------------------------------------

    "operating_cash_flow": ConceptSpec("USD",
        ("us-gaap:NetCashProvidedByUsedInOperatingActivities",)),
    "capex": ConceptSpec("USD", (
        "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
        "us-gaap:CapitalExpendituresIncurredButNotYetPaid",
    )),
    "total_assets":        ConceptSpec("USD", ("us-gaap:Assets",)),
    "total_liabilities":   ConceptSpec("USD", ("us-gaap:Liabilities",)),
    "shareholders_equity": ConceptSpec("USD", (
        "us-gaap:StockholdersEquity",
        "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    )),
    "cash": ConceptSpec("USD", (
        "us-gaap:CashAndCashEquivalentsAtCarryingValue",
        "us-gaap:CashCashEquivalentsAndShortTermInvestments",
    )),
    "total_debt": ConceptSpec("USD",
        tags=(
            "us-gaap:DebtAndCapitalLeaseObligations",
            "us-gaap:LongTermDebt",
        ),
        # Apple has no DebtCurrent at all, so components must tolerate
        # absences and sum only what exists, per period_end.
        components=(
            "us-gaap:LongTermDebtNoncurrent",
            "us-gaap:DebtCurrent",
            "us-gaap:ShortTermBorrowings",
            "us-gaap:NotesPayableCurrent",
        ),
    ),
    "shares_outstanding": ConceptSpec("shares", (
        "dei:EntityCommonStockSharesOutstanding",   # cover page, most reliable
        "us-gaap:CommonStockSharesOutstanding",
    )),
}


@dataclass
class Resolution:
    concept: str
    tag: str | None
    entries: list[dict] = field(default_factory=list)
    note: str = ""

    @property
    def ok(self) -> bool:
        return self.tag is not None and bool(self.entries)


def _d(s: str) -> date:
    y, m, dd = (int(x) for x in s.split("-"))
    return date(y, m, dd)


def _entries(facts: dict, qualified: str, unit: str) -> list[dict]:
    ns, _, tag = qualified.partition(":")
    return list(facts.get(ns, {}).get(tag, {}).get("units", {}).get(unit, []))


def _newest(entries: Iterable[dict]) -> date | None:
    ends = [_d(e["end"]) for e in entries if e.get("end")]
    return max(ends) if ends else None


def resolve(facts: dict, concept: str) -> Resolution:
    """First usable tag in priority order, or a Resolution explaining why not."""
    spec = CONCEPT_SPECS[concept]

    candidates = []
    for qualified in spec.tags:
        entries = _entries(facts, qualified, spec.unit)
        if entries:
            candidates.append((qualified, entries, _newest(entries)))

    if candidates:
        freshest = max(n for _, _, n in candidates if n)
        for qualified, entries, newest in candidates:
            if newest and (freshest - newest).days > STALE_DAYS:
                continue  # legacy tag the filer stopped using
            return Resolution(concept, qualified, entries,
                              f"{len(entries)} entries, newest {newest}")
        stalest = candidates[0]
        return Resolution(concept, None, [],
                          f"all {len(candidates)} candidate(s) stale; "
                          f"newest {stalest[2]} vs {freshest}")

    if spec.components:
        found = {c: _entries(facts, c, spec.unit) for c in spec.components}
        present = {c: v for c, v in found.items() if v}
        if present:
            return Resolution(concept, "SUM(" + "+".join(
                c.split(":")[1] for c in present) + ")",
                _sum_components(present),
                f"summed {len(present)}/{len(spec.components)} components")

    return Resolution(concept, None, [], "no candidate tag has data")


def _sum_components(present: dict[str, list[dict]]) -> list[dict]:
    """Sum components sharing a period_end. A period missing from ANY present
    component is dropped rather than under-reported -- a partial sum of debt
    is exactly the confidently-wrong number this codebase keeps avoiding."""
    by_end: dict[str, dict[str, dict]] = {}
    for comp, entries in present.items():
        for e in entries:
            by_end.setdefault(e["end"], {})[comp] = e
    out = []
    for end, per_comp in by_end.items():
        if len(per_comp) != len(present):
            continue
        first = next(iter(per_comp.values()))
        out.append({**first, "val": sum(e["val"] for e in per_comp.values())})
    return out


# A concept can be internally fresh (the newest of its own candidates) and
# still be years behind the rest of the filing. Apple stopped tagging
# interest expense after FY2023 while everything else runs to 2026 -- and
# ROIC derives its tax rate from interest expense, so pre-filling the 2023
# figure beside 2026 income yields a confidently wrong ROIC.
#
# Historical series stay useful (MonteVue samples them), so nothing is
# dropped here. The flag is what a point-in-time CompanyInput must honour:
# a stale figure is left blank so Vantage skips the metric and names the
# missing field, rather than rating a number built from two different eras.
STALE_VS_FILING_DAYS = 400


def report(facts: dict) -> list[tuple[str, Resolution, int | None]]:
    """Resolve every concept, plus how far each lags the filing overall."""
    resolutions = {c: resolve(facts, c) for c in CONCEPT_SPECS}
    newest_overall = max(
        (n for r in resolutions.values() if r.ok and (n := _newest(r.entries))),
        default=None,
    )
    out = []
    for concept, r in resolutions.items():
        lag = None
        if r.ok and newest_overall and (n := _newest(r.entries)):
            lag = (newest_overall - n).days
        out.append((concept, r, lag))
    return out


if __name__ == "__main__":
    import json
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "aapl_companyfacts.json"
    facts = json.load(open(path))["facts"]

    print(f"{'concept':<28}{'resolved tag':<50}{'note':<32}lag")
    print("-" * 124)
    unresolved, stale = [], []
    for concept, r, lag in report(facts):
        tag = r.tag or "-- UNRESOLVED --"
        if len(tag) > 48:
            tag = tag[:45] + "..."
        mark = ""
        if lag is not None and lag > STALE_VS_FILING_DAYS:
            mark = f"{lag}d  <-- STALE vs filing"
            stale.append(concept)
        elif lag is not None:
            mark = f"{lag}d"
        print(f"{concept:<28}{tag:<50}{r.note:<32}{mark}")
        if not r.ok:
            unresolved.append(concept)

    print("-" * 124)
    print(f"resolved {len(CONCEPT_SPECS) - len(unresolved)}/{len(CONCEPT_SPECS)}")
    if unresolved:
        print(f"UNRESOLVED: {', '.join(unresolved)}")
    if stale:
        print(f"STALE (must be left blank in a point-in-time CompanyInput): "
              f"{', '.join(stale)}")
