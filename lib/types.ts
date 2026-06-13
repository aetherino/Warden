// Dossier contract — mirrors the Python service (harness/warden/dossier.py).

export type Tier = "ACT" | "ADDRESS" | "AWARE" | "CONTEXT";

export interface Source {
  name: string;
  url: string;
  locator: string;
}

// Judge inspection (rubric §3/§7) — the reasoning + deterministic gates the runtime
// ran for a surfaced finding. Lets the UI build an "agentic flow sight" / judge view.
export type JudgeCheckStatus = "pass" | "info" | "redacted";

export interface JudgeCheck {
  name: string;
  status: JudgeCheckStatus;
}

export interface Judge {
  // The triage/calibration reasoning (one line).
  why: string;
  // The §3 re-fetch / live-source confirm result.
  confirmed: { ok: boolean; detail: string };
  // The deterministic gates that actually ran (no fabricated checks).
  checks: JudgeCheck[];
  source_kind: "recall" | "epa_record" | "prop65_notice";
}

// A candidate the model proposed but the deterministic gates DROPPED (judge inspection).
export interface RejectedCandidate {
  item: string;
  candidate: string; // recall # or notice/title
  reason: "not_confirmed" | "uncompliable" | "not_relevant" | "duplicate";
  detail: string;
}

// ── §11 contextual discovery (open-inference pathway system) ──────────────────
// Where the QUESTION came from (orthogonal to the §3 source{} — which proves the
// FINDING). `ai_inferred` findings carry BOTH receipts. Origin stays machine-readable;
// the displayed chip copy is pinned "Checked because of your context".
export type Origin = "user_listed" | "curated_pathway" | "ai_inferred";

// The 5-element ATSDR completed-exposure-pathway decomposition (a structuring device).
export interface ExposurePathway {
  source_category: string;
  source_to_media_mechanism: string;
  environmental_media: string;
  point_of_exposure: string;
  exposure_route: string;
  receptor_population: string;
}

// The pathway-level receipt: the judge's proof the PATHWAY is a real, established route.
// `source_tier` is derived MECHANICALLY from the eTLD+1 domain allowlist (1 or 2 only —
// a surfaced finding can never ground on Tier 3/4). Orthogonal to the finding's source{}.
export interface DiscoveryGrounding {
  source_name: string;
  url: string;
  locator: string;
  source_tier: 1 | 2;
  matched_allowlist_entry: string | null;
  established_route_quote: string; // route/transport only — never a health-outcome claim
  evidence_hash: string;
}

// The `discovery` block attached to a non-user_listed finding (the "why we looked" receipt).
export interface Discovery {
  pathway_id: string;
  trigger_signal: string; // the verbatim context span that triggered the investigation
  pathway: ExposurePathway;
  grounding: DiscoveryGrounding;
}

// A grounded-but-empty pathway: NOT a finding (no source{}/hazard_type). Renders only via
// the aggregated, bottom-ranked coverage line — never a top-level row, never an alarm.
export interface DiscoveryRecordStatement {
  kind: "record_statement";
  origin: Origin;
  pathway_id: string;
  trigger_signal: string;
  discovery: { grounding: Partial<DiscoveryGrounding>; pathway: ExposurePathway };
  checked_sources: string[];
  as_of: string;
  statement: string;
}

// A pathway the search-grounded default-reject judge SET ASIDE. §10/verifier-only — NEVER
// rendered in a user surface (rendering rejected hazard chains is the §5 cardinal sin via
// the discovery door). Lives only in `discovery_rejected`.
export type DiscoveryRejectReason =
  | "no_source_found"
  | "only_tier3_4_support"
  | "linkage_unattested"
  | "equivocated_source"
  | "agent_mismatch"
  | "agent_unnormalizable"
  | "locator_mismatch"
  | "duplicate_of_curated"
  | "uncertain_or_flapping";

export interface DiscoveryRejected {
  pathway_id: string;
  trigger_signal: string;
  pathway: ExposurePathway;
  inferred_agent?: string;
  reject_reason: DiscoveryRejectReason;
  reason?: string;
  judge_search_trace: Record<string, unknown>;
}

export interface Finding {
  item: string;
  tier: Tier;
  hazard_type: string;
  severity_basis: string;
  action: string;
  condition?: string | null;
  confidence?: string;
  is_ubiquitous: boolean;
  why?: string;
  origin: Origin;
  source: Source;
  as_of?: string;
  image?: string | null;
  judge?: Judge;
  // §11: present (REQUIRED) when origin != "user_listed" — the pathway-level "why we
  // looked" receipt, orthogonal to source{} ("what we found"). Absent for user_listed.
  discovery?: Discovery;
}

export interface RecordStatement {
  item: string;
  kind: "record_statement";
  statement: string;
  checked_sources: string[];
  as_of: string;
  suppressed_context: Finding[];
}

// Live agentic-scan step event (rubric §12 / Gate 13). The brain streams one per
// real unit of work over POST /resolve/stream (NDJSON), then a terminal dossier.
export type ScanStatus = "started" | "done" | "empty" | "error";

export interface ScanEvent {
  seq: number;
  phase: string;
  source: string;
  item?: string;
  status: ScanStatus;
  detail: string;
  tier?: Tier;
}

export interface Dossier {
  generated_at: string;
  items: string[];
  context: Record<string, unknown>;
  top_tier: Tier | "NONE";
  counts: { ACT: number; ADDRESS: number; AWARE: number; CONTEXT: number };
  findings: Finding[];
  suppressed: Finding[];
  record_statements: (RecordStatement | DiscoveryRecordStatement)[];
  rejected?: RejectedCandidate[];
  // §11 pathway-layer reject sink — §10/verifier-only, NEVER rendered to the user.
  discovery_rejected?: DiscoveryRejected[];
  checked_sources: string[];
  disclaimer: string;
  error?: string;
}
