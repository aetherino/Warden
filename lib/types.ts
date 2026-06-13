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
  origin: "user_listed" | "curated_pathway" | "ai_inferred";
  source: Source;
  as_of?: string;
  image?: string | null;
  judge?: Judge;
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
  record_statements: RecordStatement[];
  rejected?: RejectedCandidate[];
  checked_sources: string[];
  disclaimer: string;
  error?: string;
}
