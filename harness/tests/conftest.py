"""Shared fixtures + dossier-schema helpers for the Warden backend e2e suite.

Every test here drives the LIVE brain (FastAPI /resolve + /health) over HTTP — no
internal imports of warden.* — so the suite exercises the exact contract the Next.js UI
proxies to. Base URL is overridable via WARDEN_BASE_URL for a tunneled/deployed brain.

Design notes:
* The "demo basket" + a handful of single items are CACHED in SQLite (fast, deterministic);
  those drive the `not live` fast run. Anything that forces an uncached upstream call
  (EPA ECHO by ZIP, a fresh CPSC keyword fan-out, Anthropic triage) is marked `live` and
  given a generous 90s timeout.
* EPA ECHO is rate-limited (returns HTTP 429 under repeated calls); when that degrades the
  ADDRESS path to empty, the relevant test SKIPS (external infra), it does not FAIL — see
  test_tiers.py::test_epa_address_flint. That degradation is itself §9-correct behavior and
  is asserted positively (no 500) in test_robustness.py.
"""
from __future__ import annotations

import os

import httpx
import pytest

BASE_URL = os.environ.get("WARDEN_BASE_URL", "http://127.0.0.1:8787").rstrip("/")

# Generous ceiling for live paths (brain proxy itself allows 90s; the UI route mirrors this).
LIVE_TIMEOUT = 90.0
# Fast ceiling for cached paths — a cache hit should be near-instant.
CACHED_TIMEOUT = 30.0

# The exact required top-level dossier keys (rubric §2 + lib/types.ts Dossier).
DOSSIER_KEYS = {
    "generated_at",
    "items",
    "top_tier",
    "counts",
    "findings",
    "suppressed",
    "record_statements",
    "checked_sources",
    "disclaimer",
}

# Required fields on EVERY finding (primary or suppressed). `condition` is optional/nullable;
# all others must be present. Mirrors lib/types.ts Finding + the rubric finding schema.
FINDING_REQUIRED_FIELDS = {
    "item",
    "tier",
    "hazard_type",
    "severity_basis",
    "action",
    "is_ubiquitous",
    "origin",
    "source",
}
VALID_TIERS = {"ACT", "ADDRESS", "AWARE", "CONTEXT"}
VALID_ORIGINS = {"user_listed", "curated_pathway", "ai_inferred"}


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session", autouse=True)
def _brain_is_up() -> None:
    """Fail the whole suite fast with a clear message if the brain isn't reachable."""
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=10.0)
    except httpx.HTTPError as e:  # pragma: no cover - environment guard
        pytest.exit(
            f"Warden brain not reachable at {BASE_URL}/health ({type(e).__name__}: {e}).\n"
            f"Start it:  cd harness && ./.venv/bin/uvicorn warden.app:app --port 8787",
            returncode=2,
        )
    if r.status_code != 200:  # pragma: no cover - environment guard
        pytest.exit(f"Warden /health returned {r.status_code}, expected 200.", returncode=2)


def resolve(items, context=None, *, timeout=CACHED_TIMEOUT, use_cache=True) -> dict:
    """POST /resolve and return the parsed dossier. Asserts HTTP 200 + JSON object."""
    payload = {"items": items, "context": context or {}, "use_cache": use_cache}
    r = httpx.post(f"{BASE_URL}/resolve", json=payload, timeout=timeout)
    assert r.status_code == 200, f"/resolve -> HTTP {r.status_code}: {r.text[:400]}"
    data = r.json()
    assert isinstance(data, dict), f"/resolve did not return a JSON object: {type(data)}"
    return data


# --------------------------------------------------------------------------- #
# Schema validators reused across gates.
# --------------------------------------------------------------------------- #

def assert_finding_shape(f: dict, *, where: str) -> None:
    """A single finding has all required fields, valid enums, and a well-formed source."""
    missing = FINDING_REQUIRED_FIELDS - set(f)
    assert not missing, f"{where}: finding missing required fields {missing}: {f!r}"
    assert f["tier"] in VALID_TIERS, f"{where}: bad tier {f['tier']!r}"
    assert f["origin"] in VALID_ORIGINS, f"{where}: bad origin {f['origin']!r}"
    assert isinstance(f["is_ubiquitous"], bool), f"{where}: is_ubiquitous not bool"
    for str_field in ("item", "hazard_type", "severity_basis", "action"):
        assert isinstance(f[str_field], str) and f[str_field].strip(), (
            f"{where}: '{str_field}' empty/non-string: {f.get(str_field)!r}"
        )
    src = f["source"]
    assert isinstance(src, dict), f"{where}: source not an object"
    for k in ("name", "url", "locator"):
        assert k in src, f"{where}: source missing '{k}'"


def assert_dossier_schema(d: dict) -> None:
    """Top-level dossier shape (rubric §2) + every finding's shape (§3 prereq)."""
    missing = DOSSIER_KEYS - set(d)
    assert not missing, f"dossier missing top-level keys {missing}"
    assert d["top_tier"] in VALID_TIERS | {"NONE"}, f"bad top_tier {d['top_tier']!r}"
    assert isinstance(d["items"], list)
    assert isinstance(d["findings"], list)
    assert isinstance(d["suppressed"], list)
    assert isinstance(d["record_statements"], list)
    assert isinstance(d["checked_sources"], list) and d["checked_sources"], (
        "checked_sources must be a non-empty list"
    )
    counts = d["counts"]
    assert isinstance(counts, dict)
    for k in ("ACT", "ADDRESS", "AWARE", "CONTEXT"):
        assert k in counts and isinstance(counts[k], int), f"counts missing/bad '{k}'"
    assert isinstance(d["disclaimer"], str) and d["disclaimer"].strip(), "empty disclaimer"
    # generated_at is an ISO-ish timestamp string.
    assert isinstance(d["generated_at"], str) and "T" in d["generated_at"], (
        f"generated_at not an ISO timestamp: {d['generated_at']!r}"
    )
    for f in d["findings"]:
        assert_finding_shape(f, where="findings[]")
    for f in d["suppressed"]:
        assert_finding_shape(f, where="suppressed[]")
    # counts must agree with the actual primary/suppressed arrays (internal consistency).
    assert counts["CONTEXT"] == len(d["suppressed"]), (
        f"counts.CONTEXT ({counts['CONTEXT']}) != len(suppressed) ({len(d['suppressed'])})"
    )
    primary_by_tier = {t: sum(1 for f in d["findings"] if f["tier"] == t)
                       for t in ("ACT", "ADDRESS", "AWARE")}
    for t, n in primary_by_tier.items():
        assert counts[t] == n, f"counts.{t} ({counts[t]}) != findings count ({n})"
