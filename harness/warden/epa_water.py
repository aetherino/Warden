"""EPA SDWA drinking-water source (ECHO REST — keyless, verified live).

This is the **ADDRESS** source: a water-system Safe Drinking Water Act (SDWA) violation,
conditioned on the person drinking unfiltered tap water. It is CONTEXT/ZIP-driven, not
item-driven — the trigger is the user's ZIP, never a product on their list.

ZIP -> PWSID resolution (SOURCES.md §2 + Issue #007): there is NO reliable direct
ZIP -> water-system API (`p_zip` returns 0 rows for valid residential ZIPs). The robust
path is:
    1. ZIP -> lat/long + state    (zippopotam.us, keyless)
    2. lat/long -> county name     (US Census geocoder, keyless)  <-- gives ECHO's `p_co`
    3. ECHO sdw_rest_services.get_systems?p_st=<ST>&p_co=<County>  (all PWS in that county)
    4. pick the community water system (PWSTypeCode=CWS) serving the most people
       (a residential ZIP is served by 1-2 CWS; the rest are tiny transient systems —
        schools, gas stations, churches — irrelevant to a resident).
    5. read that system's SDWA violation summary from the same response.

Citation (§3): source.url = the ECHO Detailed Facility Report (DFR) deep link returned as
`WaterSystems[].DfrUrl` (`...?fid=<FRS RegistryID>`); source.locator = the PWSID. The DFR
page is JS-rendered, so the PWSID carries the fact and the `sdw_rest_services` JSON is the
machine-confirmable layer (re-fetch `get_systems?p_pid=<PWSID>&passthrough=Y`).

Reporter-not-advisor: if a system has NO violation on record we return NOTHING (no alarm,
no "your water is safe"). When there IS a violation we state EPA's factual summary
(e.g. "1 SDWA violation category on record (Treatment Technique Violation) for FLINT,
CITY OF; ECHO as-of <quarter>") and trace the action to EPA / the utility's public notice.
ECHO returns COUNTS + a 3-yr contaminant summary, not individual VIOLATION_IDs — per-violation
detail lives in the quarterly bulk ZIP (out of scope for v1; noted in the module docstring).

ENV: stdlib + httpx only (no extra deps installed in the shared venv). ZIP->county uses two
keyless public HTTP services (zippopotam.us + Census geocoder) instead of a bundled crosswalk
file, so nothing needs downloading at import time.
"""
from __future__ import annotations

import datetime

import httpx

# --- endpoints (all keyless, verified live 2026-06) ---------------------------------------
ECHO_GET_SYSTEMS = "https://echodata.epa.gov/echo/sdw_rest_services.get_systems"
# ZIP -> lat/long + state (keyless, no registration).
_ZIP_GEO = "https://api.zippopotam.us/us/{zip}"
# lat/long -> county (keyless Census geocoder; BASENAME is exactly what ECHO's p_co wants).
_CENSUS_COORDS = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"

# How many systems to pull per county. A populous county (e.g. Los Angeles) has many hundreds
# of PWS; the resident's provider is one of the largest CWS, so a wide page then a CWS+pop sort
# reliably surfaces it. responseset is capped server-side; 500 is comfortably enough.
_RESPONSESET = "500"


def _today() -> str:
    return datetime.date.today().isoformat()


def _to_int(v) -> int:
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return 0


def resolve_zip_to_county(zip_code: str, *, client: httpx.Client) -> tuple[str, str] | None:
    """ZIP -> (state_abbr, county_name) via two keyless public services, or None.

    `county_name` is the Census BASENAME (no " County" suffix), which is what ECHO's `p_co`
    parameter matches against (verified: "Genesee", "Los Angeles").
    """
    zip5 = "".join(ch for ch in str(zip_code) if ch.isdigit())[:5]
    if len(zip5) != 5:
        return None

    # 1) ZIP -> lat/long + state.
    try:
        r = client.get(_ZIP_GEO.format(zip=zip5))
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    try:
        places = (r.json() or {}).get("places") or []
    except ValueError:
        return None
    if not places:
        return None
    p = places[0]
    state = (p.get("state abbreviation") or "").strip().upper()
    lat, lon = p.get("latitude"), p.get("longitude")
    if not (state and lat and lon):
        return None

    # 2) lat/long -> county BASENAME.
    try:
        r = client.get(_CENSUS_COORDS, params={
            "x": lon, "y": lat,
            "benchmark": "Public_AR_Current", "vintage": "Current_Current",
            "layers": "Counties", "format": "json",
        })
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    try:
        counties = (r.json() or {}).get("result", {}).get("geographies", {}).get("Counties") or []
    except ValueError:
        return None
    if not counties:
        return None
    county = (counties[0].get("BASENAME") or "").strip()
    if not county:
        return None
    return state, county


def pick_community_system(systems: list[dict]) -> dict | None:
    """Pick the resident's likely provider: the CWS serving the most people.

    Filters to PWSTypeCode=CWS (community water systems — actual homes), dropping the
    transient/non-community noise (gas stations, schools, RV parks) that floods a county
    query, then takes the largest PopulationServedCount.
    """
    cws = [s for s in systems if (s.get("PWSTypeCode") or "").upper() == "CWS"]
    if not cws:
        return None
    return max(cws, key=lambda s: _to_int(s.get("PopulationServedCount")))


def _has_violation_on_record(s: dict) -> bool:
    """Does ECHO show a SDWA violation on the system's record?

    Reporter-not-advisor: surface ONLY when EPA's own record shows a violation; otherwise
    return nothing (never an all-clear, never a fabricated alarm). These are ECHO's standard
    "has a violation" markers over the rolling 3-year compliance window:
      - VioFlag / CurrVioFlag : violation present (3yr / current)
      - QtrsWithVio           : quarters with a violation in the window
      - Vioremain             : unaddressed violations remaining
      - SeriousViolator       : EPA "serious violator" designation
      - LeadAndCopperViol     : Lead & Copper Rule violation
    Any one being positive means EPA is reporting a real violation for this system.
    """
    if (s.get("SeriousViolator") or "").strip().lower() == "yes":
        return True
    for flag in ("VioFlag", "CurrVioFlag"):
        if _to_int(s.get(flag)) > 0:
            return True
    for cnt in ("QtrsWithVio", "Vioremain", "RulesVio3yr", "LeadAndCopperViol"):
        if _to_int(s.get(cnt)) > 0:
            return True
    return False


def _severity_basis(s: dict) -> str:
    """One factual line drawn from ECHO — no health-effect synthesis, no safe/unsafe."""
    name = s.get("PWSName") or s.get("PWSId") or "this water system"
    parts: list[str] = []

    cats = (s.get("ViolationCategories") or "").strip()
    contaminants = (s.get("SDWAContaminantsInViol3yr") or "").strip()
    qtrs = _to_int(s.get("QtrsWithVio"))
    remaining = _to_int(s.get("Vioremain"))
    rules = _to_int(s.get("RulesVio3yr"))

    if rules:
        parts.append(f"{rules} SDWA rule violation{'s' if rules != 1 else ''} on record (last 3 years)")
    elif qtrs:
        parts.append(f"SDWA violation reported in {qtrs} of the last 12 quarters")
    else:
        parts.append("SDWA violation on record")

    if cats:
        parts.append(f"category: {cats}")
    if contaminants:
        # ECHO formats this as "1005=Arsenic; 8000=Revised Total Coliform Rule".
        parts.append(f"contaminant/rule: {contaminants}")
    if (s.get("HealthFlag") or "").strip().lower() == "yes":
        parts.append("health-based violation flagged")
    if (s.get("SeriousViolator") or "").strip().lower() == "yes":
        parts.append("EPA-designated serious violator")
    if remaining:
        parts.append(f"{remaining} unaddressed")
    last_fea = (s.get("SDWDateLastFea") or "").strip()
    if last_fea:
        parts.append(f"last formal enforcement {last_fea}")

    return f"{'; '.join(parts)} for {name} (per EPA ECHO/SDWIS)."


def resolve_water(zip_code: str) -> list[dict]:
    """ZIP -> SDWA drinking-water violation findings for the resident's likely provider.

    Returns 0 or 1 finding (the largest community water system serving the ZIP's county):
      - the system HAS a SDWA violation on record -> one ADDRESS finding, conditioned on
        "if you drink unfiltered tap water", citing the ECHO Detailed Facility Report.
      - the system is clean / unresolved -> [] (no alarm, no all-clear; the caller emits a
        neutral, timestamped record statement for the ADDRESS source).

    Finding dict matches Warden's schema exactly:
      {item, tier, hazard_type, severity_basis, action, condition, confidence,
       is_ubiquitous, origin, source:{name,url,locator}, as_of}
    """
    client = httpx.Client(timeout=40.0, follow_redirects=True)
    try:
        resolved = resolve_zip_to_county(zip_code, client=client)
        if resolved is None:
            return []
        state, county = resolved

        try:
            r = client.get(ECHO_GET_SYSTEMS, params={
                "output": "JSON", "p_st": state, "p_co": county,
                "passthrough": "Y", "responseset": _RESPONSESET,
            })
        except httpx.HTTPError:
            return []
        if r.status_code != 200:
            return []
        try:
            results = (r.json() or {}).get("Results", {}) or {}
        except ValueError:
            return []
        systems = results.get("WaterSystems") or []
        if not systems:
            return []

        system = pick_community_system(systems)
        if system is None:
            return []

        # No violation on EPA's record -> no finding. Absence is neutral, never reassuring.
        if not _has_violation_on_record(system):
            return []

        pwsid = system.get("PWSId") or ""
        name = system.get("PWSName") or pwsid
        # DfrUrl (`...?fid=<FRS RegistryID>`) is the canonical, re-fetchable DFR deep link (§3).
        dfr_url = system.get("DfrUrl") or (
            f"https://echo.epa.gov/detailed-facility-report?fid={system.get('RegistryID', '')}"
        )
        # ECHO data version (e.g. "SDWA v2020-02-05 1500") -> honest as-of provenance.
        as_of = (results.get("Version") or _today()).strip()

        health_based = (system.get("HealthFlag") or "").strip().lower() == "yes"
        serious = (system.get("SeriousViolator") or "").strip().lower() == "yes"
        contaminants = (system.get("SDWAContaminantsInViol3yr") or "").strip()

        hazard_type = (
            f"Drinking-water contaminant/rule violation ({contaminants})"
            if contaminants
            else "Safe Drinking Water Act violation"
        )
        confidence = "Strong" if (health_based or serious) else "Moderate"

        finding = {
            # item is the system itself — this finding is ZIP/context-driven, not product-driven.
            "item": f"Tap water — {name} ({pwsid})",
            "tier": "ADDRESS",
            "hazard_type": hazard_type,
            "severity_basis": _severity_basis(system),
            # Action traces to EPA/the utility, not originated by Warden (§3 / reporter-not-advisor).
            "action": (
                f"Review {name}'s Safe Drinking Water Act compliance and any public notice / "
                f"Consumer Confidence Report on EPA ECHO and from the utility; the EPA Detailed "
                f"Facility Report lists the violation and its status."
            ),
            # The ADDRESS condition (rubric §5): person-specific exposure trigger.
            "condition": "if you drink unfiltered tap water",
            "confidence": confidence,
            "is_ubiquitous": False,  # location-specific, not a ubiquitous baseline warning.
            "origin": "user_listed",  # ZIP came from the user's own intake context.
            "source": {
                "name": "EPA ECHO (SDWA/SDWIS)",
                "url": dfr_url,
                "locator": f"PWSID {pwsid}",
            },
            "as_of": as_of,
            # Judge surfacing (UI "judge inspection"). ZIP -> county -> CWS -> SDWA-violation
            # is a deterministic resolution off EPA's own ECHO record; nothing synthesized.
            "judge": {
                "why": (
                    f"ZIP {zip_code} resolves to {county}, {state}; the largest community "
                    f"water system there is {name} ({pwsid}), which has a SDWA violation on "
                    f"EPA's ECHO record — surfaced as ADDRESS (conditioned on drinking tap water)."
                ),
                "confirmed": {
                    "ok": True,
                    "detail": f"live ECHO get_systems read for {pwsid} ({name}); "
                              f"violation flag present (re-fetchable via p_pid={pwsid}).",
                },
                "checks": [
                    {"name": "ZIP resolved to county (Census)", "status": "pass"},
                    {"name": "community water system selected (largest CWS)", "status": "pass"},
                    {"name": "SDWA violation present on ECHO record", "status": "pass"},
                    {"name": "action traced to EPA/utility public record", "status": "pass"},
                ],
                "source_kind": "epa_record",
            },
        }
        return [finding]
    finally:
        client.close()
