// DEV/REVIEW fixture for §11 contextual-discovery rendering.
//
// The §11 backend (another agent's .py work) does not yet return discovery findings
// for live input. To prove the UI renders the FROZEN contract (lib/types.ts) correctly
// — origin badges, the two-receipts grounding trail, the DiscoveryRecordStatement
// coverage line, and discovery_rejected staying verifier-only — this builds a
// hand-assembled Dossier matching the types as-is. Reached only via ?fixture=discovery.

import type { Dossier } from "@/lib/types";

export function discoveryFixture(): Dossier {
  return {
    generated_at: "2026-06-13T14:35:00",
    items: ["portable space heater", "Tap water", "your well water"],
    context: {
      zip: "48503",
      water_source: "tap",
      proximity: ["military base", "well water", "farmland"],
    },
    top_tier: "ACT",
    counts: { ACT: 1, ADDRESS: 2, AWARE: 1, CONTEXT: 0 },
    findings: [
      // ── user_listed (ACT lead) ──────────────────────────────────────────────
      {
        item: "portable space heater",
        tier: "ACT",
        hazard_type: "Fire hazard",
        severity_basis:
          "The heater can overheat and ignite, posing a fire hazard; CPSC instruction is to stop use immediately.",
        action:
          "Stop using the recalled heater and contact the manufacturer for a refund.",
        condition: null,
        confidence: "Strong",
        is_ubiquitous: false,
        origin: "user_listed",
        source: {
          name: "CPSC",
          url: "https://www.cpsc.gov/Recalls/2023/x",
          locator: "RecallNumber 23148",
        },
        as_of: "2023-03-09T00:00:00",
        judge: {
          why: "Matched the user's space heater to an active CPSC recall at the cited locator; ACT because the recall instruction is to stop use immediately.",
          confirmed: { ok: true, detail: "Re-read RecallNumber 23148 at cpsc.gov; active." },
          checks: [
            { name: "matched-at-locator", status: "pass" },
            { name: "action-traced", status: "pass" },
            { name: "model-confirmation", status: "redacted" },
          ],
          source_kind: "recall",
        },
      },
      // ── ai_inferred (ADDRESS) — PFAS via former air base + well water ────────
      {
        item: "your well water",
        tier: "ADDRESS",
        hazard_type: "PFOA above the UCMR reporting level",
        severity_basis:
          "PFOA was detected above the UCMR minimum reporting level for your water system in the latest EPA monitoring round.",
        action:
          "Review the EPA UCMR result for your water system and the public notice from your utility.",
        condition: "if you drink unfiltered tap or well water",
        confidence: "Moderate",
        is_ubiquitous: false,
        origin: "ai_inferred",
        source: {
          name: "EPA UCMR5",
          url: "https://www.epa.gov/dwucmr",
          locator: "PWSID MI0000823",
        },
        as_of: "2026-06-13T00:00:00",
        discovery: {
          pathway_id: "afff-pfas-well-ingestion",
          trigger_signal: "military base",
          pathway: {
            source_category: "firefighting foam (AFFF)",
            source_to_media_mechanism: "infiltration to groundwater",
            environmental_media: "soil / groundwater",
            point_of_exposure: "your well",
            exposure_route: "ingestion",
            receptor_population: "household drinking water consumers",
          },
          grounding: {
            source_name: "ATSDR PFAS ToxProfile",
            url: "https://www.atsdr.cdc.gov/toxprofiles/tp200.pdf",
            locator: "Section 5 — Potential for Human Exposure",
            source_tier: 1,
            matched_allowlist_entry: "atsdr.cdc.gov",
            established_route_quote:
              "AFFF used at military fire-training areas can migrate through soil to groundwater and reach private drinking-water wells.",
            evidence_hash: "sha256:9f1c…a3",
          },
        },
        judge: {
          why: "ADDRESS because a formal UCMR detection above the reporting level exists for the ZIP's water system; conditional on drinking unfiltered water.",
          confirmed: { ok: true, detail: "Re-fetched the EPA UCMR5 record for PWSID MI0000823." },
          checks: [
            { name: "pathway-grounded-tier1", status: "pass" },
            { name: "matched-at-locator", status: "pass" },
            { name: "agent-registry-id-match", status: "pass" },
          ],
          source_kind: "epa_record",
        },
      },
      // ── curated_pathway (ADDRESS) — lead paint via older home + renovation ───
      {
        item: "Tap water",
        tier: "ADDRESS",
        hazard_type: "Safe Drinking Water Act violation",
        severity_basis:
          "1 SDWA rule violation on record (last 3 years) for your water system, per EPA ECHO/SDWIS.",
        action:
          "Review the water system's SDWA compliance and any public notice on EPA ECHO.",
        condition: "if you drink unfiltered tap water",
        confidence: "Moderate",
        is_ubiquitous: false,
        origin: "curated_pathway",
        source: {
          name: "EPA ECHO (SDWA/SDWIS)",
          url: "https://echo.epa.gov/x",
          locator: "PWSID MI0002310",
        },
        as_of: "SDWA v2020-02-05 1500",
        discovery: {
          pathway_id: "zip-water-sdwa",
          trigger_signal: "well water",
          pathway: {
            source_category: "public water system",
            source_to_media_mechanism: "treatment / distribution",
            environmental_media: "tap water",
            point_of_exposure: "your tap",
            exposure_route: "ingestion",
            receptor_population: "served population",
          },
          grounding: {
            source_name: "EPA SDWIS",
            url: "https://www.epa.gov/ground-water-and-drinking-water/safe-drinking-water-information-system-sdwis-federal-reporting",
            locator: "SDWA reporting system",
            source_tier: 1,
            matched_allowlist_entry: "epa.gov",
            established_route_quote:
              "A public water system's regulated contaminants reach consumers through the distribution system to the tap.",
            evidence_hash: "sha256:2b7d…e1",
          },
        },
        judge: {
          why: "ADDRESS: a formal SDWA violation is on the public record for the ZIP's water system.",
          confirmed: { ok: true, detail: "Re-fetched the EPA Detailed Facility Report for PWSID MI0002310." },
          checks: [
            { name: "matched-at-locator", status: "pass" },
            { name: "compliance-scan", status: "pass" },
          ],
          source_kind: "epa_record",
        },
      },
      // ── ai_inferred (AWARE) — has a condition, sits at AWARE (origin-blind) ──
      {
        item: "your well water",
        tier: "AWARE",
        hazard_type: "Nitrate monitoring on record",
        severity_basis:
          "Routine nitrate monitoring is on record for agricultural-region wells in your area.",
        action: "Review the most recent nitrate monitoring result for your water system.",
        condition: "if you use a private well",
        confidence: "Preliminary",
        is_ubiquitous: false,
        origin: "ai_inferred",
        source: {
          name: "EPA SDWIS",
          url: "https://www.epa.gov/x",
          locator: "Monitoring schedule",
        },
        as_of: "2026-06-13T00:00:00",
        discovery: {
          pathway_id: "ag-nitrate-well",
          trigger_signal: "farmland",
          pathway: {
            source_category: "agricultural fertilizer",
            source_to_media_mechanism: "runoff / leaching",
            environmental_media: "groundwater",
            point_of_exposure: "your well",
            exposure_route: "ingestion",
            receptor_population: "well-water households",
          },
          grounding: {
            source_name: "USGS Groundwater Quality",
            url: "https://www.usgs.gov/x",
            locator: "Nitrate in groundwater",
            source_tier: 2,
            matched_allowlist_entry: "usgs.gov",
            established_route_quote:
              "Nitrate from agricultural fertilizer can leach into shallow groundwater used by private wells.",
            evidence_hash: "sha256:7a4f…c9",
          },
        },
      },
    ],
    suppressed: [],
    // §11 grounded-but-empty pathways — fold into the aggregated coverage line, NOT a
    // top-level row, NOT an alarm.
    record_statements: [
      {
        kind: "record_statement",
        origin: "ai_inferred",
        pathway_id: "airport-pfas",
        trigger_signal: "near an airport",
        discovery: {
          grounding: {
            source_name: "ATSDR PFAS ToxProfile",
            url: "https://www.atsdr.cdc.gov/toxprofiles/tp200.pdf",
            source_tier: 1,
          },
          pathway: {
            source_category: "airport firefighting foam",
            source_to_media_mechanism: "infiltration",
            environmental_media: "groundwater",
            point_of_exposure: "municipal supply",
            exposure_route: "ingestion",
            receptor_population: "served population",
          },
        },
        checked_sources: ["EPA UCMR5"],
        as_of: "2026-06-13",
        statement:
          "Checked EPA UCMR for PFAS near the airport pathway as of 2026-06-13 — no detection on file.",
      },
      {
        kind: "record_statement",
        origin: "curated_pathway",
        pathway_id: "old-home-lead",
        trigger_signal: "older home (pre-1978)",
        discovery: {
          grounding: {
            source_name: "EPA Lead Renovation Rule",
            url: "https://www.epa.gov/lead",
            source_tier: 1,
          },
          pathway: {
            source_category: "lead-based paint",
            source_to_media_mechanism: "renovation dust",
            environmental_media: "household dust",
            point_of_exposure: "living space",
            exposure_route: "inhalation / ingestion",
            receptor_population: "residents",
          },
        },
        checked_sources: ["EPA"],
        as_of: "2026-06-13",
        statement:
          "Checked the EPA lead-paint pathway for a pre-1978 home as of 2026-06-13 — nothing actionable on file.",
      },
    ],
    rejected: [],
    // §10/verifier-only — NEVER rendered to the user in the dossier. Present here to
    // PROVE the UI does not surface it as findings/alarms.
    discovery_rejected: [
      {
        pathway_id: "rejected-vinyl-chloride",
        trigger_signal: "industrial site",
        pathway: {
          source_category: "vinyl chloride",
          source_to_media_mechanism: "air dispersion",
          environmental_media: "ambient air",
          point_of_exposure: "neighborhood",
          exposure_route: "inhalation",
          receptor_population: "nearby residents",
        },
        reject_reason: "only_tier3_4_support",
        reason: "No Tier-1/2 source affirmatively attested the route for this location.",
        judge_search_trace: {},
      },
    ],
    checked_sources: ["CPSC", "EPA ECHO (SDWA/SDWIS)", "EPA UCMR5", "ATSDR", "USGS"],
    disclaimer:
      "Warden reports the state of the record as of the date shown — not a verdict on your items, and not health advice.",
  };
}
