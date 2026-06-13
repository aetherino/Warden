"""Gate 1 (rubric §2) — schema-valid dossier for a valid payload.
Gate 2 (rubric §3) — provenance: EVERY finding (primary AND suppressed) carries an
https source.url and a non-empty source.locator.

All cases here use CACHED items (the demo basket + a couple of pre-warmed singles), so the
file runs fast and deterministically under `-m "not live"`.
"""
from __future__ import annotations

import pytest

from conftest import assert_dossier_schema, resolve

# Cached single items (see SQLite cache: portable space heater / extension cord /
# peloton tread+ / lithium-ion power bank / etc.). The demo basket is also fully cached.
DEMO_BASKET = [
    "Fisher-Price Rock 'n Play Sleeper",
    "Peloton Tread+ treadmill",
    "portable space heater",
    "lithium-ion power bank",
    "baby inclined sleeper",
]


@pytest.mark.gate1
def test_valid_payload_returns_schema_valid_dossier():
    """§2: a valid {items, context} payload -> HTTP 200 + a fully schema-valid dossier,
    and every finding carries all required fields."""
    d = resolve(["portable space heater"])
    assert_dossier_schema(d)
    assert d["items"] == ["portable space heater"]
    # The heater is a known multi-recall ACT item — the primary plan must not be empty.
    assert d["findings"], "expected at least one finding for 'portable space heater'"


@pytest.mark.gate1
def test_demo_basket_schema_valid():
    """§2 / §E: the seeded demo basket (one click away in the UI) is schema-valid and
    returns a non-trivial plan. Cached, so fast + deterministic."""
    d = resolve(DEMO_BASKET)
    assert_dossier_schema(d)
    assert d["items"] == DEMO_BASKET
    # Seeded basket guarantees actionable signal: at least one ACT in the primary plan.
    assert d["counts"]["ACT"] >= 1, f"demo basket produced no ACT: counts={d['counts']}"


@pytest.mark.gate2
def test_every_primary_finding_has_https_url_and_locator():
    """§3: provenance is mechanical — every PRIMARY finding has source.url starting
    https:// and a non-empty source.locator. No claim without a re-fetchable receipt."""
    d = resolve(["portable space heater"])
    assert d["findings"], "no findings to check provenance on"
    for f in d["findings"]:
        url = f["source"]["url"]
        loc = f["source"]["locator"]
        assert isinstance(url, str) and url.startswith("https://"), (
            f"primary finding source.url not https: {url!r} (item {f['item']!r})"
        )
        assert isinstance(loc, str) and loc.strip(), (
            f"primary finding source.locator empty (item {f['item']!r})"
        )


@pytest.mark.gate2
def test_every_suppressed_finding_has_https_url_and_locator():
    """§3: suppressed (CONTEXT) findings are still public-record claims — they too must
    carry an https source.url + non-empty locator. 'extension cord' yields many Prop 65
    CONTEXT notices, each citing an oag.ca.gov per-notice page."""
    d = resolve(["extension cord"])
    assert d["suppressed"], "expected suppressed Prop 65 findings for 'extension cord'"
    for f in d["suppressed"]:
        url = f["source"]["url"]
        loc = f["source"]["locator"]
        assert url.startswith("https://"), (
            f"suppressed finding source.url not https: {url!r}"
        )
        assert isinstance(loc, str) and loc.strip(), "suppressed finding locator empty"


@pytest.mark.gate2
def test_demo_basket_full_provenance_sweep():
    """§3 across the whole demo basket: 100% of findings (primary + suppressed) have an
    https url + non-empty locator. This is the 'zero hazard claims lack a citation' gate."""
    d = resolve(DEMO_BASKET)
    all_findings = d["findings"] + d["suppressed"]
    assert all_findings, "demo basket produced no findings at all"
    bad = [
        (f["item"], f["source"].get("url"), f["source"].get("locator"))
        for f in all_findings
        if not str(f["source"].get("url", "")).startswith("https://")
        or not str(f["source"].get("locator", "")).strip()
    ]
    assert not bad, f"{len(bad)} finding(s) with bad provenance: {bad[:5]}"
