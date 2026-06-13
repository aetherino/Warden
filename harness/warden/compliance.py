"""Deterministic, server-side compliance + provenance guards for triage findings.

The rubric thesis — Warden reports the STATE OF THE PUBLIC RECORD, never a verdict,
never health-effect synthesis, never a "safe/unsafe" claim (Safety-signaling stance,
§7) — was previously enforced ONLY by the LLM system prompt. That is not a control.
This module is the mechanical backstop: it scans the model's free text against a fixed
banned-token list, constrains the headline hazard_type to the recall's own categories,
checks that `action` actually traces to the recall (the UI labels it "Action (per the
recall)"), and re-fetches each surfaced finding's recall to confirm it (§3).

Everything here is pure-Python and deterministic — no model in the loop — so the gate
is testable and cannot be talked around.
"""
from __future__ import annotations

import re

import httpx

# --------------------------------------------------------------------------- #
# Fix 1: banned-token list. We block HEALTH-EFFECT SYNTHESIS and SAFE/UNSAFE
# VERDICTS. We do NOT block the recall's own stated hazard nouns (fire, fall,
# burn, …) — reporting the public record's hazard is the whole point. The line
# is: a noun naming the hazard category is fine; a clause asserting a health
# OUTCOME, a dose-response, a diagnosis, or an all-clear is not.
# --------------------------------------------------------------------------- #

# Health-outcome synthesis terms. Word-boundary matched, case-insensitive.
_HEALTH_OUTCOME = [
    "causes", "cause cancer", "cancer", "carcinogen", "carcinogenic", "toxic",
    "toxicity", "poison", "poisonous", "harms", "harmful", "disease", "dose",
    "dose-response", "mesothelioma", "lethal", "deadly", "fatal", "death-causing",
    "diagnos",  # diagnose / diagnosis / diagnostic
    "carcinoma", "tumor", "tumour", "leukemia", "leukaemia",
]

# Safe / all-clear assertions (verbatim §7: no "safe"/"fine"/"healthy" semantics).
_SAFE_CLEAR = [
    "safe", "unsafe", "fine", "healthy", "unhealthy", "no risk", "risk-free",
    "harmless", "all clear", "all-clear", "no danger", "perfectly safe",
    "completely safe", "no hazard",
]

# Allowed recall hazard nouns — these are public-record hazard CATEGORIES and must
# pass even though some sit near banned words. Used both to whitelist and to derive
# a constrained hazard_type headline (fix 2).
_ALLOWED_HAZARDS = [
    "fire", "burn", "fall", "entrapment", "tip-over", "tipover", "suffocation",
    "laceration", "strangulation", "choking", "shock", "electric shock",
    "electrocution", "impact", "crush", "amputation", "explosion", "overheat",
    "overheating", "smoke", "drowning", "asphyxiation", "ingestion", "injury",
    "carbon monoxide", "co poisoning",  # CO is a named recall hazard category, not synthesis
]

# Compiled banned matchers. We special-case a few multi-word phrases (no \b around
# spaces issues) by matching them as substrings; single tokens get word boundaries.
_BANNED_PATTERNS: list[tuple[str, re.Pattern]] = []
for _term in _HEALTH_OUTCOME + _SAFE_CLEAR:
    if " " in _term or "-" in _term:
        _BANNED_PATTERNS.append((_term, re.compile(re.escape(_term), re.IGNORECASE)))
    else:
        _BANNED_PATTERNS.append((_term, re.compile(rf"\b{re.escape(_term)}\b", re.IGNORECASE)))

# A handful of allowed phrases contain a banned token ("no hazard" vs "fire hazard",
# "carbon monoxide poisoning" contains "poison"). We whitelist recall-hazard contexts
# by checking the allowed-hazard list first when the only hit is inside such a phrase.
_ALLOWED_CONTEXT = re.compile(
    r"\b(?:" + "|".join(re.escape(h) for h in _ALLOWED_HAZARDS) + r")\b", re.IGNORECASE
)


def find_banned(text: str) -> list[str]:
    """Return the list of banned tokens present in `text`.

    'fire hazard', 'fall hazard', 'carbon monoxide poisoning' etc. are the recall's
    own hazard categories and are NOT banned — only health-effect synthesis and
    safe/unsafe verdicts are. We therefore drop a 'poison' hit when it is part of an
    allowed 'carbon monoxide poisoning'-style hazard phrase.
    """
    if not text:
        return []
    hits: list[str] = []
    lowered = text.lower()
    for term, pat in _BANNED_PATTERNS:
        if not pat.search(text):
            continue
        # Whitelist: 'poison' inside the allowed 'carbon monoxide poisoning' category.
        if term in ("poison", "poisonous") and re.search(
            r"(?:carbon monoxide|\bco\b)\s+poison", lowered
        ):
            continue
        hits.append(term)
    return hits


def is_compliant(text: str) -> bool:
    return not find_banned(text)


# --------------------------------------------------------------------------- #
# Fix 2: constrained hazard_type. Prefer the recall's own hazard category; derive
# a SHORT label from the recall's Hazards[].Name / Title prose by matching the
# allowed-hazard vocabulary, rather than letting model free-text synthesis become
# the headline. Falls back to a neutral "Recalled by CPSC" if nothing matches.
# --------------------------------------------------------------------------- #

_HAZARD_LABEL = {
    "fire": "Fire hazard",
    "burn": "Burn hazard",
    "overheat": "Fire/overheating hazard",
    "overheating": "Fire/overheating hazard",
    "smoke": "Fire/smoke hazard",
    "explosion": "Explosion hazard",
    "shock": "Shock hazard",
    "electric shock": "Shock hazard",
    "electrocution": "Electrocution hazard",
    "fall": "Fall hazard",
    "tip-over": "Tip-over hazard",
    "tipover": "Tip-over hazard",
    "entrapment": "Entrapment hazard",
    "suffocation": "Suffocation hazard",
    "asphyxiation": "Suffocation hazard",
    "strangulation": "Strangulation hazard",
    "choking": "Choking hazard",
    "drowning": "Drowning hazard",
    "laceration": "Laceration hazard",
    "amputation": "Amputation hazard",
    "crush": "Crush hazard",
    "impact": "Impact hazard",
    "ingestion": "Ingestion hazard",
    "carbon monoxide": "Carbon monoxide hazard",
    "co poisoning": "Carbon monoxide hazard",
    "injury": "Injury hazard",
}


def constrained_hazard_type(rec: dict) -> str:
    """Derive a short, compliant hazard category from the recall's own text.

    Scans the recall's Hazards[].Name then the Title against the allowed-hazard
    vocabulary and returns a normalized short label. The recall's own stated hazard
    is the public record — reporting it is allowed (fix-1 NOTE)."""
    haystacks = list(rec.get("hazards") or [])
    haystacks.append(rec.get("title") or "")
    for hay in haystacks:
        low = (hay or "").lower()
        for kw, label in _HAZARD_LABEL.items():
            if re.search(rf"\b{re.escape(kw)}\b", low):
                return label
    return "Recalled by CPSC"


# --------------------------------------------------------------------------- #
# Fix 3: action fidelity. The UI labels `action` "Action (per the recall)", so it
# must trace to the recall — not be model-originated advice (§7: "Warden originates
# none"). We accept the model's action only if it has meaningful token overlap with
# the recall's Remedies / Description; otherwise we render Remedies verbatim.
# --------------------------------------------------------------------------- #

_WORD = re.compile(r"[a-z0-9]+")
_ACTION_STOP = {
    "the", "and", "for", "with", "from", "your", "you", "should", "this", "that",
    "are", "was", "can", "will", "have", "has", "a", "an", "of", "to", "in", "on",
    "or", "at", "by", "it", "is", "be", "as", "recalled", "recall", "consumers",
    "consumer", "contact", "please", "immediately",
}


def _content_tokens(text: str) -> set[str]:
    return {t for t in _WORD.findall((text or "").lower())
            if len(t) >= 3 and t not in _ACTION_STOP}


def remedies_text(rec: dict) -> str:
    """The recall's remedy, verbatim, for rendering as the fallback action."""
    rems = [r for r in (rec.get("remedies") or []) if r and r.strip()]
    if rems:
        return " ".join(rems).strip()
    return ""


def action_traces_to_recall(action: str, rec: dict, *, threshold: float = 0.30) -> bool:
    """True iff the model's `action` overlaps the recall's remedy/description text.

    Token-overlap (not exact substring) so paraphrase is allowed but invention is
    not. Empty/blank actions never pass."""
    action_toks = _content_tokens(action)
    if not action_toks:
        return False
    source = (remedies_text(rec) + " " + (rec.get("description") or ""))
    source_toks = _content_tokens(source)
    if not source_toks:
        # No remedy/description to trace to — cannot confirm fidelity.
        return False
    overlap = action_toks & source_toks
    return (len(overlap) / len(action_toks)) >= threshold


def compliant_action(action: str, rec: dict) -> str | None:
    """Return a compliant, recall-traced action, or None if none is available.

    Order: (1) model action if it traces to the recall AND is itself clean;
    (2) the recall's Remedies verbatim if clean; (3) None (caller decides)."""
    if action and is_compliant(action) and action_traces_to_recall(action, rec):
        return action.strip()
    rem = remedies_text(rec)
    if rem and is_compliant(rem):
        return rem
    return None


# --------------------------------------------------------------------------- #
# Neutral factual fallbacks drawn from the recall (fix 1). When a field has a
# banned hit we null it and substitute a neutral line from the recall — but the
# substitute is itself scanned, so a recall Title that happens to contain a banned
# word does not sneak through.
# --------------------------------------------------------------------------- #


def neutral_severity_basis(rec: dict) -> str | None:
    """A neutral, factual severity_basis from the recall: prefer the short hazard
    category, then a cleaned Title. Returns None if nothing clean is available."""
    cat = constrained_hazard_type(rec)
    title = rec.get("title") or ""
    # Prefer "<Hazard category> stated in this CPSC recall." — always clean.
    if cat and cat != "Recalled by CPSC":
        line = f"{cat} stated in this CPSC recall."
        if is_compliant(line):
            return line
    if title and is_compliant(title):
        return title.strip()
    fallback = "CPSC recall on file for this item."
    return fallback if is_compliant(fallback) else None


# --------------------------------------------------------------------------- #
# Fix 4: §3 re-fetch confirm. For each SURFACED finding, GET the recall by its
# RecallNumber, assert HTTP 200 + exactly one record + the item identifier or the
# hazard appears in the fetched Title/Description/Hazards. Findings that don't
# confirm are dropped (returned in a rejected sink) and never surface.
# --------------------------------------------------------------------------- #

_CONFIRM_URL = "https://www.saferproducts.gov/RestWebServices/Recall"


def _identifier_tokens(item: str, rec: dict) -> set[str]:
    """Significant tokens to look for in the fetched record: the user item's words
    plus the recall's own product names — so a relevant recall confirms itself."""
    toks = _content_tokens(item)
    for p in (rec.get("products") or []):
        toks |= _content_tokens(p)
    return {t for t in toks if len(t) >= 4}


def confirm_recall(item: str, rec: dict, *, client: httpx.Client | None = None,
                   timeout: float = 8.0) -> tuple[bool, str]:
    """Re-fetch the recall by RecallNumber and confirm it (§3).

    Returns (confirmed, reason). Confirmed requires: HTTP 200, exactly one record,
    the same RecallNumber, and the item-or-hazard appearing in the fetched
    Title/Description/Hazards. Bounded timeout; cheap; run per surfaced finding."""
    rn = str(rec.get("recall_number") or "").strip()
    if not rn:
        return False, "no_recall_number"
    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True)
    try:
        r = client.get(_CONFIRM_URL, params={"format": "json", "RecallNumber": rn})
    except httpx.HTTPError as e:
        if own:
            client.close()
        return False, f"fetch_error:{type(e).__name__}"
    try:
        if r.status_code != 200:
            return False, f"http_{r.status_code}"
        try:
            rows = r.json()
        except ValueError:
            return False, "non_json"
        if not isinstance(rows, list) or len(rows) != 1:
            return False, f"row_count_{len(rows) if isinstance(rows, list) else 'na'}"
        fetched = rows[0]
        if str(fetched.get("RecallNumber") or "") != rn:
            return False, "recall_number_mismatch"

        hay = " ".join([
            fetched.get("Title", "") or "",
            (fetched.get("Description", "") or "")[:1000],
            *[(h.get("Name") or h.get("HazardType") or "") for h in (fetched.get("Hazards") or [])],
            *[(p.get("Name") or p.get("Description") or "") for p in (fetched.get("Products") or [])],
        ]).lower()

        wanted = _identifier_tokens(item, rec)
        if wanted and any(t in hay for t in wanted):
            return True, "ok"
        # Fallback: the recall's stated hazard category appears (relevant item but
        # phrased differently). Reporting the public-record hazard confirms it.
        cat_kw = constrained_hazard_type(rec).split()[0].lower()
        if cat_kw and cat_kw not in ("recalled",) and cat_kw in hay:
            return True, "ok_hazard"
        return False, "identifier_not_in_record"
    finally:
        if own:
            client.close()
