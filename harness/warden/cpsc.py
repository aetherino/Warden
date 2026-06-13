"""CPSC product-recall source (SaferProducts.gov REST — keyless, verified live).

Query strategy from SOURCES.md: no global free-text param + AND-combined params, so we
fan out across several structured/keyword fields and merge by RecallID. Model#/UPC are
mostly empty, so matching is brand+product-noun keyword with Description confirmation.
"""
from __future__ import annotations

import re

import httpx

BASE = "https://www.saferproducts.gov/RestWebServices/Recall"
# CPSC params do SUBSTRING (contains) matching, AND-combined — so a whole multi-word item
# ("Fisher-Price Rock 'n Play Sleeper") matches nothing. We fan out short candidate terms
# across these fields, merge by RecallID, and let the triage pass filter relevance.
_SEARCH_FIELDS = ["RecallTitle", "ProductName"]
_STOP = {"the", "and", "for", "with", "from", "plus", "due", "your", "size"}


def _candidates(item: str, *, max_terms: int = 5) -> list[str]:
    """Full string + significant single tokens + a brand+noun bigram (substring-friendly)."""
    item = item.strip()
    toks = re.findall(r"[A-Za-z0-9'&/-]+", item)
    sig = [t for t in toks if len(t.strip("'-&/")) >= 4 and t.lower() not in _STOP]
    cands = [item, *sig]
    if len(sig) >= 2:
        cands.insert(1, f"{sig[0]} {sig[1]}")  # e.g. "Fisher-Price Rock"
    seen, out = set(), []
    for c in cands:
        k = c.lower().strip()
        if k and k not in seen:
            seen.add(k)
            out.append(c)
    return out[:max_terms]


def search_recalls(query: str, *, limit: int = 10, since: str = "2008-01-01",
                   client: httpx.Client | None = None) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=25.0, follow_redirects=True)
    seen: dict = {}
    try:
        for term in _candidates(query):
            for field in _SEARCH_FIELDS:
                params = {"format": "json", field: term, "RecallDateStart": since}
                try:
                    r = client.get(BASE, params=params)
                except httpx.HTTPError:
                    continue
                if r.status_code != 200:
                    continue
                try:
                    rows = r.json()
                except ValueError:
                    continue
                if not isinstance(rows, list):
                    continue
                for rec in rows:
                    rid = rec.get("RecallID")
                    if rid is not None and rid not in seen:
                        seen[rid] = rec
    finally:
        if own:
            client.close()
    # Rank by RELEVANCE (how many significant query terms appear), then recency — so the
    # actually-matching recall surfaces ahead of same-brand-different-product noise.
    terms = [t for t in re.findall(r"[A-Za-z0-9'&/-]+", query)
             if len(t.strip("'-&/")) >= 4 and t.lower() not in _STOP]

    def _score(rec: dict) -> int:
        hay = " ".join([
            rec.get("Title", "") or "",
            *[(p.get("Name") or p.get("Description") or "") for p in (rec.get("Products") or [])],
            (rec.get("Description", "") or "")[:400],
        ]).lower()
        return sum(1 for t in terms if t.lower() in hay)

    recs = sorted(seen.values(), key=lambda x: (_score(x), x.get("RecallDate", "")), reverse=True)
    return [normalize(r) for r in recs[:limit]]


def normalize(rec: dict) -> dict:
    """Flatten a raw CPSC recall into the fields triage + provenance need."""
    products = rec.get("Products") or []
    hazards = rec.get("Hazards") or []
    remedies = rec.get("Remedies") or []
    images = rec.get("Images") or []
    return {
        "recall_id": rec.get("RecallID"),
        "recall_number": str(rec.get("RecallNumber") or ""),
        "title": rec.get("Title") or "",
        "date": rec.get("RecallDate") or "",
        "last_publish": rec.get("LastPublishDate") or "",
        # Canonical permanent cpsc.gov recall page == source.url (§3 provenance).
        "url": rec.get("URL") or "",
        "description": rec.get("Description") or "",
        "products": [p.get("Name") or p.get("Description") or "" for p in products][:5],
        "hazards": [h.get("Name") or h.get("HazardType") or "" for h in hazards][:5],
        "remedies": [r.get("Name") or "" for r in remedies][:5],
        "image": (images[0].get("URL") if images else None),
    }
