"""Assemble the ranked dossier: CPSC crawl + triage (cached) -> tiered, suppressed, cited.

v1 runtime path. Honors the rubric: ranked action plan primary; CONTEXT suppressed by
default; no-findings -> neutral timestamped record statement (never silence / never an
all-clear). Tier order is the sole severity signal.
"""
from __future__ import annotations

import datetime
from concurrent.futures import ThreadPoolExecutor

from . import cpsc, store, triage

TIER_RANK = {"ACT": 0, "ADDRESS": 1, "AWARE": 2, "CONTEXT": 3}
_SOURCES_CHECKED = ["CPSC recalls"]  # v1; EPA / Prop 65 / discovery are follow-ups.


def _today() -> str:
    return datetime.date.today().isoformat()


def resolve_item(item: str, context: dict | None, *, use_cache: bool = True) -> list[dict]:
    if use_cache:
        cached = store.get(item)
        if cached is not None:
            return cached
    try:
        recalls = cpsc.search_recalls(item)
        findings = triage.triage_item(item, recalls, context)  # retries internally on error/empty
    except Exception as e:  # graceful degradation (§9): one slow/failed item never 500s the dossier
        import sys
        print(f"[warden] resolve_item({item!r}) failed after retries: {type(e).__name__}: {e}",
              file=sys.stderr)
        return []
    store.put(item, findings)
    return findings


def build_dossier(items: list[str], context: dict | None = None, *, use_cache: bool = True) -> dict:
    items = [i.strip() for i in items if i and i.strip()]
    all_findings: list[dict] = []
    record_statements: list[dict] = []

    # Resolve items concurrently so N items ≈ one item's latency (each does CPSC + an LLM call).
    if items:
        with ThreadPoolExecutor(max_workers=min(6, len(items))) as ex:
            resolved = list(ex.map(lambda it: resolve_item(it, context, use_cache=use_cache), items))
    else:
        resolved = []

    for item, findings in zip(items, resolved):
        # Suppress CONTEXT from the primary plan (kept, flagged, available on request).
        actionable = [f for f in findings if f.get("tier") != "CONTEXT"]
        if not actionable:
            record_statements.append({
                "item": item,
                "kind": "record_statement",
                "statement": (
                    f"Checked {', '.join(_SOURCES_CHECKED)} as of {_today()}; "
                    f"no active recall or public action on file for “{item}”."
                ),
                "checked_sources": _SOURCES_CHECKED,
                "as_of": _today(),
                "suppressed_context": [f for f in findings if f.get("tier") == "CONTEXT"],
            })
        all_findings.extend(findings)

    primary = [f for f in all_findings if f.get("tier") != "CONTEXT"]
    suppressed = [f for f in all_findings if f.get("tier") == "CONTEXT"]
    primary.sort(key=lambda f: (TIER_RANK.get(f.get("tier"), 9), f.get("item", "")))

    top_tier = primary[0]["tier"] if primary else ("CONTEXT" if suppressed else "NONE")
    return {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "items": items,
        "context": context or {},
        "top_tier": top_tier,
        "counts": {
            "ACT": sum(1 for f in primary if f["tier"] == "ACT"),
            "ADDRESS": sum(1 for f in primary if f["tier"] == "ADDRESS"),
            "AWARE": sum(1 for f in primary if f["tier"] == "AWARE"),
            "CONTEXT": len(suppressed),
        },
        "findings": primary,
        "suppressed": suppressed,
        "record_statements": record_statements,
        "checked_sources": _SOURCES_CHECKED,
        "disclaimer": (
            "Warden reports the state of the public record as of the date shown — "
            "not a verdict on your items, and not health advice."
        ),
    }
