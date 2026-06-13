"""Tier coverage — the four-tier triage thesis, against live/cached real sources.

* ACT     — "portable space heater" yields >=1 ACT from CPSC (cached, fast).
* ADDRESS — context {"zip":"48503"} yields an EPA SDWA finding (Flint) with a NON-NULL
            condition (§5/§6). LIVE + rate-limit-prone (EPA ECHO 429) -> see SKIP note.
* CONTEXT — "extension cord" yields a Prop 65 finding that lands in `suppressed` (NOT the
            primary plan) with is_ubiquitous=True (§5 calibration / noise suppression).
"""
from __future__ import annotations

import httpx
import pytest

from conftest import (
    LIVE_TIMEOUT,
    assert_dossier_schema,
    assert_finding_shape,
    resolve,
)


@pytest.mark.tiers
def test_act_space_heater_cpsc():
    """ACT: a portable space heater has active CPSC recalls -> >=1 ACT finding, all CPSC,
    all https. Cached -> fast + stable."""
    d = resolve(["portable space heater"])
    assert_dossier_schema(d)
    act = [f for f in d["findings"] if f["tier"] == "ACT"]
    assert act, f"expected >=1 ACT for 'portable space heater', counts={d['counts']}"
    assert d["top_tier"] == "ACT", f"top_tier should be ACT, got {d['top_tier']!r}"
    for f in act:
        assert "cpsc.gov" in f["source"]["url"], f"ACT not CPSC-cited: {f['source']['url']}"
        assert f["source"]["locator"].strip()


@pytest.mark.tiers
def test_context_extension_cord_is_suppressed_and_ubiquitous():
    """§5 calibration: 'extension cord' triggers Prop 65 60-day notices. Each is CONTEXT,
    is_ubiquitous=True, and lands in `suppressed` — NEVER the primary plan. This is the
    'don't over-alarm on a sticker that's on everything' guard."""
    d = resolve(["extension cord"])
    assert_dossier_schema(d)
    # No CONTEXT-tier finding may sit in the primary plan.
    primary_context = [f for f in d["findings"] if f["tier"] == "CONTEXT"]
    assert not primary_context, (
        f"{len(primary_context)} CONTEXT finding(s) leaked into the primary plan (§5 fail)"
    )
    # The Prop 65 noise must be present, but in `suppressed`, flagged ubiquitous.
    prop65 = [f for f in d["suppressed"]
              if "prop 65" in (f["hazard_type"] or "").lower()
              or "oag.ca.gov" in f["source"]["url"]]
    assert prop65, f"expected Prop 65 CONTEXT in suppressed, got {len(d['suppressed'])} suppressed"
    for f in prop65:
        assert f["tier"] == "CONTEXT", f"Prop 65 finding not CONTEXT: {f['tier']}"
        assert f["is_ubiquitous"] is True, "Prop 65 finding must be is_ubiquitous=True (§5)"
        assert f["source"]["url"].startswith("https://oag.ca.gov/prop65/"), (
            f"Prop 65 citation not an oag.ca.gov per-notice page: {f['source']['url']}"
        )


@pytest.mark.tiers
@pytest.mark.live
def test_epa_address_flint_zip():
    """§5/§6 ADDRESS: ZIP 48503 (Flint) -> an EPA SDWA finding conditioned on a
    person-specific trigger (non-null `condition`). LIVE EPA ECHO call.

    EPA ECHO is rate-limited and returns HTTP 429 under load; Warden then correctly
    degrades the ADDRESS path to empty (§9). When that happens this test SKIPS (external
    infra, not a Warden bug). The graceful-degradation behavior itself is asserted
    positively in test_robustness.py.

    Item is a guaranteed-no-CPSC-match string so the dossier isolates the EPA path:
    the item -> a neutral record statement, the ZIP -> the lone ADDRESS finding.
    """
    d = resolve(["zzqx nonexistent 9999"], context={"zip": "48503"}, timeout=LIVE_TIMEOUT)
    assert_dossier_schema(d)

    address = [f for f in d["findings"] if f["tier"] == "ADDRESS"]
    if not address:
        # Distinguish "EPA rate-limited / down" (skip) from "real regression" (fail).
        try:
            probe = httpx.get(
                "https://echodata.epa.gov/echo/sdw_rest_services.get_systems",
                params={"output": "JSON", "p_st": "MI", "p_co": "Genesee",
                        "passthrough": "Y", "responseset": "50"},
                timeout=30.0, follow_redirects=True,
            )
        except httpx.HTTPError as e:  # pragma: no cover
            pytest.skip(f"EPA ECHO unreachable ({type(e).__name__}); ADDRESS path can't run")
        if probe.status_code != 200:
            pytest.skip(
                f"EPA ECHO returned HTTP {probe.status_code} (rate-limited); Warden correctly "
                f"degraded the ADDRESS path to empty (§9). Re-run when ECHO recovers."
            )
        systems = (probe.json() or {}).get("Results", {}).get("WaterSystems") or []
        if not systems:
            pytest.skip("EPA ECHO returned 200 but no systems for Genesee right now.")
        pytest.fail(
            "EPA ECHO is up + returns Genesee systems, but Warden produced no ADDRESS "
            "finding for ZIP 48503 -> REAL REGRESSION in the EPA water path."
        )

    # We have an ADDRESS finding — validate it hard.
    f = address[0]
    assert_finding_shape(f, where="ADDRESS finding")
    assert f["condition"], "ADDRESS finding must have a NON-NULL condition (§5)"
    assert isinstance(f["condition"], str) and f["condition"].strip()
    assert f["is_ubiquitous"] is False, "an EPA SDWA ADDRESS finding is location-specific"
    assert f["source"]["url"].startswith("https://"), "EPA source.url not https"
    assert f["source"]["locator"].strip(), "EPA source.locator empty"
    # The Flint system: the locator is its PWSID and the cite points at EPA ECHO.
    assert "epa.gov" in f["source"]["url"], f"EPA citation not epa.gov: {f['source']['url']}"
    assert "PWSID" in f["source"]["locator"], f"EPA locator not a PWSID: {f['source']['locator']}"
