// Dossier contract — mirrors the Python service (harness/warden/dossier.py).

export type Tier = "ACT" | "ADDRESS" | "AWARE" | "CONTEXT";

export interface Source {
  name: string;
  url: string;
  locator: string;
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
  checked_sources: string[];
  disclaimer: string;
  error?: string;
}
