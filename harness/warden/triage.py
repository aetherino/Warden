"""Anthropic-driven triage: raw CPSC recalls -> calibrated, tiered, cited findings.

This is the 'triage, not detection' core (rubric thesis). The model NEVER invents a URL:
it returns the RecallNumber it triaged, and we join back to the real CPSC record for
source.url + source.locator, keeping provenance grounded (§3).
"""
from __future__ import annotations

import json

from anthropic import Anthropic

from . import config

SYSTEM = """You are Warden's triage pass. You report the STATE OF THE PUBLIC RECORD about a \
person's item — never a verdict about the item, never health advice, never a "safe/unsafe" \
claim, never health-effect synthesis. You are a reporter, not an advisor.

You are given a user's item and a list of CPSC product-recall records that a keyword search \
returned. Your job is TRIAGE, not detection:
- Decide which recalls are actually RELEVANT to the user's item (drop keyword false-positives).
- Assign each relevant recall a tier:
  * ACT     — an active recall on an item the person plausibly owns. Stop use / refund / repair.
  * ADDRESS — real but conditional; state the triggering `condition`.
  * AWARE    — real but baseline / low action.
  * CONTEXT  — ubiquitous, non-specific noise; suppressed by default.
  An active CPSC recall that matches the item is ACT (hard rule). Never mis-tier an active recall down.
- `severity_basis`: one factual line drawn from the recall text. NO health-effect synthesis \
(no "causes cancer", no dose-response, no diagnosis).
- `action`: quote the remedy AS STATED by CPSC/the recall (e.g. "stop using and contact X for a \
refund"). Trace to the source; do NOT originate your own advice.
- `is_ubiquitous`: true only for generic, everywhere warnings (rare for CPSC recalls).
- `confidence`: how sure the match is (Strong/Moderate/Preliminary/Contested).
- `why`: one line of calibration reasoning.

If NONE of the recalls are relevant, return an empty findings list (the caller will emit a \
neutral, timestamped "no action on file" record statement)."""

TRIAGE_TOOL = {
    "name": "submit_triage",
    "description": "Return the triaged findings for the user's item.",
    "input_schema": {
        "type": "object",
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "recall_number": {"type": "string", "description": "RecallNumber copied EXACTLY from the provided data"},
                        "tier": {"type": "string", "enum": ["ACT", "ADDRESS", "AWARE", "CONTEXT"]},
                        "hazard_type": {"type": "string"},
                        "severity_basis": {"type": "string"},
                        "action": {"type": "string"},
                        "condition": {"type": ["string", "null"]},
                        "confidence": {"type": "string", "enum": ["Strong", "Moderate", "Preliminary", "Contested"]},
                        "is_ubiquitous": {"type": "boolean"},
                        "why": {"type": "string"},
                    },
                    "required": ["recall_number", "tier", "hazard_type", "severity_basis",
                                 "action", "confidence", "is_ubiquitous", "why"],
                },
            }
        },
        "required": ["findings"],
    },
}


def _client() -> Anthropic:
    # Bounded timeout + NO retries: the SDK default (600s timeout, 2 retries) turns a
    # transient API hiccup into a multi-minute hang, which is fatal for the runtime budget.
    return Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=30.0, max_retries=0)


def triage_item(item: str, recalls: list[dict], context: dict | None = None,
                *, max_recalls: int = 6) -> list[dict]:
    """Return a list of grounded findings (joined back to the real recall for url/locator)."""
    if not recalls:
        return []
    recalls = recalls[:max_recalls]  # cap input -> bounded output + latency
    by_number = {r["recall_number"]: r for r in recalls if r.get("recall_number")}
    compact = [
        {
            "recall_number": r["recall_number"],
            "title": r["title"],
            "date": r["date"],
            "products": r["products"],
            "hazards": r["hazards"],
            "remedies": r["remedies"],
            "description": (r["description"] or "")[:500],
        }
        for r in recalls
    ]
    prompt = (
        f"USER ITEM: {item!r}\n"
        f"NON-MEDICAL CONTEXT: {json.dumps(context or {})}\n\n"
        f"CPSC RECALLS RETURNED BY KEYWORD SEARCH (triage these):\n{json.dumps(compact, indent=2)}"
    )
    # Stream the response: the read timeout then applies per-chunk, so a slow-but-progressing
    # generation succeeds instead of tripping a whole-response ReadTimeout (Anthropic's
    # recommended pattern for longer requests). Retry on error OR empty — the API
    # intermittently returns an empty tool payload, which a single extra attempt recovers.
    def _call_once() -> list[dict]:
        with _client().messages.stream(
            model=config.TRIAGE_MODEL,
            max_tokens=4096,  # findings array for ~6 recalls can exceed 1024 -> truncated tool call
            system=SYSTEM,
            tools=[TRIAGE_TOOL],
            tool_choice={"type": "tool", "name": "submit_triage"},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            msg = stream.get_final_message()
        for block in msg.content:
            if getattr(block, "type", None) == "tool_use" and block.name == "submit_triage":
                return block.input.get("findings", []) or []
        return []

    findings_in: list[dict] = []
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            findings_in = _call_once()
        except Exception as e:  # noqa: BLE001
            last_exc = e
            findings_in = []
        if findings_in:
            break
    if not findings_in and last_exc is not None:
        raise last_exc  # all attempts errored -> let resolve_item degrade gracefully (§9)

    out = []
    for f in findings_in:
        rec = by_number.get(str(f.get("recall_number")))
        if not rec:
            continue  # drop any finding that doesn't map to a real fetched recall (anti-hallucination)
        out.append({
            "item": item,
            "tier": f.get("tier", "AWARE"),
            "hazard_type": f.get("hazard_type", ""),
            "severity_basis": f.get("severity_basis", ""),
            "action": f.get("action", ""),
            "condition": f.get("condition"),
            "confidence": f.get("confidence", "Moderate"),
            "is_ubiquitous": bool(f.get("is_ubiquitous", False)),
            "why": f.get("why", ""),
            "origin": "user_listed",
            "source": {
                "name": "CPSC",
                "url": rec["url"],
                "locator": f"RecallNumber {rec['recall_number']}",
            },
            "as_of": rec.get("last_publish") or rec.get("date") or "",
            "image": rec.get("image"),
        })
    return out
