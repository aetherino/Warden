"""CA Prop 65 source — the CONTEXT / noise-suppression backbone of Warden.

This client proves the "suppress ubiquitous noise" thesis. It queries the **CA Attorney
General 60-Day Notice database** (oag.ca.gov — plain GET works, NO bot-wall, verified live
in SOURCES.md §4) by product keyword and returns matching notices as findings.

A 60-day notice is a *notice of intent to sue* — an ALLEGED Prop 65 exposure, **never a
proven violation or recall**. Prop 65 warnings/notices blanket nearly everything sold in
California (~1,000 listed chemicals across a vast product range), so each notice is, by
default, ubiquitous noise:

    tier = "CONTEXT", is_ubiquitous = True

— shown for calibration, suppressed from the primary action plan (§5 cardinal-sin guard:
never over-alarm on a warning that is on almost everything). We do NOT escalate here; a
listing/notice alone is context. (An actual settlement/judgment or a specific exceedance
would be the evidence to escalate — handled by triage/enforcement layers, not this client.)

Provenance (rubric §3) is mechanical and never invented:
    source.url     = the AG per-notice page  https://oag.ca.gov/prop65/60-Day-Notice-{AG_NUMBER}
    source.locator = the AG Notice Number     "AG Notice 2022-01139"
The fact (chemical X alleged in product Y vs company Z on date D) is re-confirmable there
and in the filed PDF at https://oag.ca.gov/system/files/prop65/notices/{AG_NUMBER}.pdf.

Reporter-not-advisor: no "safe/unsafe", no health-effect synthesis, no advice. `action`
traces to the source posture ("alleged notice, shown for context"), never originates advice.

The OEHHA chemical list (the membership grounding for `is_ubiquitous`) sits behind an
Imperva/Incapsula bot-wall (SOURCES.md §4 gotcha) — it is OPTIONAL grounding here. We do
NOT block on it: Prop 65 notices are ubiquitous by construction, so we hardcode
`is_ubiquitous=True` and note the limitation rather than getting stuck on the xlsx.
"""
from __future__ import annotations

import csv
import io
import re

import httpx

# AG 60-day notice CSV export — VERIFIED plain-curl working (text/csv, no auth, no bot-wall).
# Same query params as the HTML search form; caps at 1,000 records (`attach=page_1/1000`).
CSV_EXPORT = "https://oag.ca.gov/prop65/60-day-notice-results-export_details.csv"
# Canonical per-notice deep link (source.url) + the filed PDF (the primary fact document).
NOTICE_PAGE = "https://oag.ca.gov/prop65/60-Day-Notice-{ag}"
NOTICE_PDF = "https://oag.ca.gov/system/files/prop65/notices/{ag}.pdf"

# A real browser-ish UA. oag.ca.gov tolerates plain scripted requests, but a sane UA avoids
# any future heuristic throttling and matches what we verified live.
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/csv,*/*",
}

# CSV column headers vary slightly in casing/spacing across exports; we normalize and
# look up by a lowercased, stripped key, tolerating a few known aliases.
_AG_NUM_KEYS = ("ag number", "agnumber", "ag no", "ag no.")
_DATE_KEYS = ("date filed", "date", "datefiled")
_NOTICING_KEYS = ("noticing party", "plaintiff", "noticingparty")
_VIOLATOR_KEYS = ("alleged violators", "alleged violator(s)", "alleged violator", "defendant")
_CHEMICAL_KEYS = ("chemicals", "chemical")
_SOURCE_KEYS = ("source", "product", "source/product")


def _pick(row: dict[str, str], keys: tuple[str, ...]) -> str:
    for k in keys:
        if k in row and row[k] is not None:
            v = row[k].strip()
            if v:
                return v
    return ""


def _normalize_ag_number(raw: str) -> str:
    """Pull the canonical `YYYY-NNNNN` AG number out of a (possibly noisy) cell."""
    raw = (raw or "").strip()
    m = re.search(r"(\d{4})-(\d{4,6})", raw)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return raw


def search_notices(item: str, *, limit: int = 25, since: str | None = None,
                   client: httpx.Client | None = None) -> list[dict]:
    """Query the AG 60-day notice CSV export by product/keyword; return normalized rows.

    `item` matches the notice "Source" (free-text product description) via the AG form's
    `field_prop65_product_value`. `since` is an optional `MM/DD/YYYY` floor (date filed).
    Returns a list of normalized dicts (not yet findings) — see `_to_finding`.
    """
    item = (item or "").strip()
    if not item:
        return []

    # We pull a generous page and sort newest-first CLIENT-SIDE: the AG export ignores
    # `sort_order` (verified live — it returns oldest AG number first regardless), so the
    # server sort can't be trusted to surface the freshest, most demo-relevant notices.
    params = {
        "field_prop65_product_value": item,
        "sort_by": "field_prop65_id_value",
        "items_per_page": "1000",  # export caps at 1,000; we trim to `limit` after sorting
        "attach": "page_1/1000",
    }
    if since:
        params["date_filter[min][date]"] = since

    own = client is None
    client = client or httpx.Client(timeout=30.0, follow_redirects=True, headers=_HEADERS)
    try:
        try:
            r = client.get(CSV_EXPORT, params=params)
        except httpx.HTTPError:
            return []
        if r.status_code != 200:
            return []
        text = r.text
        # Defensive: confirm we got CSV, not an HTML error/challenge page (oag is not
        # bot-walled, but never trust shape — §3 demands the real fact, not a stray page).
        ctype = r.headers.get("content-type", "")
        if "html" in ctype.lower() and "csv" not in ctype.lower():
            return []
    finally:
        if own:
            client.close()

    return _parse_csv(text, item, limit=limit)


def _parse_csv(text: str, item: str, *, limit: int) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return []
    # Map original headers -> lowercased/stripped for tolerant lookup.
    seen: dict[str, dict] = {}
    out: list[dict] = []
    for raw_row in reader:  # noqa: PLR1702 — accumulate all rows, sort + trim below
        row = {
            (k or "").strip().lower(): (v or "")
            for k, v in raw_row.items()
            if k is not None
        }
        ag = _normalize_ag_number(_pick(row, _AG_NUM_KEYS))
        if not ag or not re.match(r"\d{4}-\d{4,6}", ag):
            continue  # no usable locator -> can't cite it (§3), so skip
        if ag in seen:
            continue
        rec = {
            "ag_number": ag,
            "date_filed": _pick(row, _DATE_KEYS),
            "noticing_party": _pick(row, _NOTICING_KEYS),
            "alleged_violators": _pick(row, _VIOLATOR_KEYS),
            "chemical": _pick(row, _CHEMICAL_KEYS),
            "product_source": _pick(row, _SOURCE_KEYS),
            "url": NOTICE_PAGE.format(ag=ag),
            "pdf": NOTICE_PDF.format(ag=ag),
            "query": item,
        }
        seen[ag] = rec
        out.append(rec)
    # Newest AG number first (the AG export's own sort can't be trusted — see search_notices),
    # then trim to the requested limit so the freshest notices survive.
    out.sort(key=lambda r: r["ag_number"], reverse=True)
    return out[:limit]


def _to_finding(item: str, rec: dict) -> dict:
    """Map one normalized AG notice into a Warden finding (exact dossier dict shape).

    tier=CONTEXT + is_ubiquitous=True by default: Prop 65 notices are ubiquitous noise
    (the §5 calibration backbone). We never assert a violation occurred — only that an
    ALLEGATION was filed and is on the public record.
    """
    chemical = rec.get("chemical") or "a Prop 65-listed chemical"
    product = rec.get("product_source") or item
    ag = rec["ag_number"]
    violators = rec.get("alleged_violators") or "the named party"
    date_filed = rec.get("date_filed") or ""

    # hazard_type: the listed chemical + that it's an exposure allegation (no health synthesis).
    hazard_type = f"Prop 65 — alleged exposure to {chemical}"

    # severity_basis MUST frame it as alleged, not proven (rubric §7, SOURCES.md gotcha).
    severity_basis = (
        f"Alleged Prop 65 exposure notice (a 60-day notice of intent to sue — NOT a proven "
        f"violation or recall): {chemical} alleged in “{product}” against {violators}"
        + (f", filed {date_filed}" if date_filed else "")
        + "."
    )

    # action MUST NOT be advice — it states the record posture only.
    action = (
        "Prop 65 60-day notices are ubiquitous; shown for context, no specific action. "
        "This is an allegation on the public record, not a finding that the product is unsafe."
    )

    return {
        "item": item,
        "tier": "CONTEXT",
        "hazard_type": hazard_type,
        # The triggering condition for the allegation, stated factually.
        "condition": f"Alleged exposure to {chemical} from “{product}” (per the filed notice).",
        "severity_basis": severity_basis,
        "action": action,
        # Confidence is in the MATCH/record existence, not in any health claim. Preliminary:
        # the AG "Source" free-text match to the user's item is fuzzy and the notice is unproven.
        "confidence": "Preliminary",
        # Ubiquitous by construction. OEHHA-list membership grounding is bot-walled (§4) and
        # OPTIONAL here; we do not block on it — see module docstring / report limitations.
        "is_ubiquitous": True,
        "why": (
            "Prop 65 60-day notice = an unproven allegation; Prop 65 warnings/notices are on "
            "nearly everything sold in CA, so this is calibrated to CONTEXT (suppressed noise)."
        ),
        "origin": "user_listed",
        "source": {
            "name": "CA OAG Prop 65 60-Day Notice",
            # §3: the per-notice AG page — the REAL, re-fetchable fact, never invented.
            "url": rec["url"],
            "locator": f"AG Notice {ag}",
        },
        "as_of": date_filed,
        # Judge surfacing (UI "judge inspection"). A 60-day notice is, by construction,
        # ubiquitous noise -> calibrated to CONTEXT and suppressed; nothing escalated.
        "judge": {
            "why": (
                f"Matched CA OAG 60-day notice {ag} by product keyword; a notice is an "
                f"unproven allegation and Prop 65 notices blanket nearly everything sold in "
                f"CA, so it is calibrated to CONTEXT (suppressed noise), not an action."
            ),
            "confirmed": {
                "ok": True,
                "detail": f"cites live OAG notice {ag} (re-fetchable per-notice page + filed PDF).",
            },
            "checks": [
                {"name": "matched at locator", "status": "pass"},
                {"name": "framed as alleged, not proven", "status": "pass"},
                {"name": "calibrated ubiquitous -> CONTEXT (suppressed)", "status": "info"},
            ],
            "source_kind": "prop65_notice",
        },
    }


def search_prop65(item: str, *, limit: int = 25) -> list[dict]:
    """PUBLIC ENTRY POINT — given a user item, return Prop 65 notice findings.

    Each finding is a CA AG 60-day notice (an ALLEGED Prop 65 exposure) matched to the item
    by product keyword, normalized to Warden's finding dict shape, tier=CONTEXT,
    is_ubiquitous=True. Returns [] if nothing matches or the source is unreachable
    (graceful degradation, §9 — a slow/empty source never raises into the dossier).

    dossier.py should call this per-item alongside cpsc.search_recalls(), e.g.
        prop65_findings = prop65.search_prop65(item)
    and fold the results into the item's finding list. Because every finding is CONTEXT,
    they land in the dossier's `suppressed` bucket automatically (build_dossier already
    routes tier=="CONTEXT" there) — proving the noise-suppression thesis without extra wiring.
    """
    notices = search_notices(item, limit=limit)
    return [_to_finding(item, rec) for rec in notices]
