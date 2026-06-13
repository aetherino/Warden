// FRONTEND-OWNED augmentation of the dossier contract.
//
// The backend owns `lib/types.ts`. A backend agent is concurrently adding a
// per-finding `judge` block and a dossier-level `rejected` array to that file.
// To build against THAT contract WITHOUT editing the backend-owned definitions,
// we declare the shapes here and provide narrow, defensive accessors. Everything
// is OPTIONAL and every reader tolerates the field being absent — the UI renders
// gracefully whether or not the backend has shipped these fields yet.
//
// When the backend lands the same fields in lib/types.ts, these stay compatible
// (they describe the identical shape) and can be folded in later.

import type { Finding, Dossier, Tier } from "@/lib/types";

// A single gate the judge ran. "redacted" = the gate ran but its detail is withheld
// (rendered honestly as withheld, never hidden). Status is NOT a severity signal.
export type JudgeCheckStatus = "pass" | "info" | "redacted";

export interface JudgeCheck {
  name: string;
  status: JudgeCheckStatus;
}

// Where the finding's evidence ultimately came from — drives the action eyebrow.
export type JudgeSourceKind = "recall" | "epa_record" | "prop65_notice";

export interface JudgeBlock {
  why: string; // why THIS tier (the reasoning, in record voice)
  confirmed: { ok: boolean; detail: string }; // re-fetched & confirmed at the source
  checks: JudgeCheck[]; // the gates that ran (matched-at-locator / compliance / action-traced)
  source_kind: JudgeSourceKind;
}

// Why Warden weighed a candidate and set it aside (the triage discipline).
export type RejectedReason =
  | "not_confirmed"
  | "uncompliable"
  | "not_relevant"
  | "duplicate";

export interface RejectedItem {
  item: string;
  candidate: string;
  reason: RejectedReason;
  detail: string;
}

// Augmented views — same objects, with the optional backend additions typed.
export type FindingWithJudge = Finding & { judge?: JudgeBlock };
export type DossierWithRejected = Dossier & { rejected?: RejectedItem[] };

// ── Defensive accessors ──────────────────────────────────────────────────────

export function getJudge(f: Finding): JudgeBlock | undefined {
  const j = (f as FindingWithJudge).judge;
  if (!j || typeof j !== "object") return undefined;
  // tolerate partials — only require a usable shape
  return j;
}

export function getRejected(d: Dossier): RejectedItem[] {
  const r = (d as DossierWithRejected).rejected;
  return Array.isArray(r) ? r : [];
}

// ── Source-aware copy ─────────────────────────────────────────────────────────

// The action eyebrow must match the source (NOT always "PER THE RECALL").
// Prefer judge.source_kind; fall back to source.name heuristics.
export function actionEyebrow(f: Finding): string {
  const kind = getJudge(f)?.source_kind;
  if (kind === "recall") return "Action — per the recall";
  if (kind === "epa_record") return "Action — per the public record";
  if (kind === "prop65_notice") return "Shown for context — per the notice";

  const name = (f.source?.name ?? "").toLowerCase();
  if (name.includes("prop") || name.includes("65")) {
    return "Shown for context — per the notice";
  }
  if (name.includes("epa") || name.includes("sdwa") || name.includes("echo")) {
    return "Action — per the public record";
  }
  return "Action — per the recall";
}

// Human label for a rejected candidate's reason (neutral framing, never alarmist).
export function rejectedReasonLabel(reason: RejectedReason): string {
  switch (reason) {
    case "not_confirmed":
      return "couldn't be confirmed at the source";
    case "uncompliable":
      return "no clear action to take";
    case "not_relevant":
      return "not a match for what you own";
    case "duplicate":
      return "already covered above";
    default:
      return "set aside";
  }
}

// Human label for a judge check name -> a readable gate description.
export function judgeCheckStatusLabel(status: JudgeCheckStatus): string {
  switch (status) {
    case "pass":
      return "passed";
    case "info":
      return "noted";
    case "redacted":
      return "withheld";
    default:
      return status;
  }
}

// A better headline when the brain's hazard_type is the weak generic fallback.
// Derive a short, factual title from the recall title baked into severity_basis,
// else fall back to a neutral "Active recall" (NOT the weak "Recalled by CPSC").
const GENERIC_HAZARD = /^recalled by cpsc$/i;

export function displayHazardType(f: Finding): string {
  const h = (f.hazard_type ?? "").trim();
  if (h && !GENERIC_HAZARD.test(h)) return h;

  // Try to lift a hazard phrase out of the severity_basis ("... posing a fire hazard").
  const basis = f.severity_basis ?? "";
  const m = basis.match(/posing (?:a |an )?([a-z ,/]+?hazard[s]?)/i);
  if (m) {
    const phrase = m[1].trim();
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }
  // Otherwise a neutral, non-weak label.
  return "Active recall";
}

// Tier ordering (ACT loudest). Re-exported so groupers don't re-derive it.
export const TIER_RANK: Record<Tier, number> = {
  ACT: 0,
  ADDRESS: 1,
  AWARE: 2,
  CONTEXT: 3,
};

// Group findings BY ITEM, ACT-first within each group, groups ordered by their
// worst (lowest-rank) tier so items with ACT sort first. Stable within a tier.
export interface ItemGroup {
  item: string;
  findings: Finding[];
  topRank: number;
  counts: Record<Tier, number>;
}

export function groupByItem(findings: Finding[]): ItemGroup[] {
  const byItem = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.item ?? "—";
    const arr = byItem.get(key);
    if (arr) arr.push(f);
    else byItem.set(key, [f]);
  }

  const groups: ItemGroup[] = [];
  for (const [item, fs] of byItem) {
    const sorted = [...fs].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
    const counts: Record<Tier, number> = { ACT: 0, ADDRESS: 0, AWARE: 0, CONTEXT: 0 };
    let topRank = Number.POSITIVE_INFINITY;
    for (const f of sorted) {
      counts[f.tier] += 1;
      topRank = Math.min(topRank, TIER_RANK[f.tier]);
    }
    groups.push({ item, findings: sorted, topRank, counts });
  }

  // Items with ACT first; stable for equal rank (preserve insertion order).
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => a.g.topRank - b.g.topRank || a.i - b.i)
    .map(({ g }) => g);
}

// Format an as_of that may be an ISO date OR a stamped string like
// "SDWA v2020-02-05 1500". Pull the first YYYY-MM-DD if present, else echo a
// trimmed form. Never returns a half-sliced "SDWA v2020-".
export function fmtAsOf(s?: string | null): string | null {
  if (!s) return null;
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const trimmed = s.trim();
  return trimmed.length ? trimmed : null;
}
