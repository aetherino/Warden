# Warden — Open Issues & Project State

## Status: Dev (foundation). Two workflows in flight: open-inference rubric design (→ §11 edits) + source recon (→ SOURCES.md + key matrix).

## Big Picture
Consumer hazard-audit agent. Lists what you own → grinds public regulatory/litigation/
environmental/research sources → returns ONE ranked, conditioned, cited action plan.
Thesis: **triage, not detection.** Reporter of the public record, never a health/safety advisor.
Centerpiece: three.js "invisible shield." Demo crawls sources live (with caching + fallback guardrails).

## Docs map
- `rubric.md` — the spec / gates ("done" definition)
- `ISSUES.md` — this file: tasks, state, decisions
- `brain.md` — living context: mental model, invariants, assumptions, watch-list
- `SOURCES.md` — data-source reference (pending recon workflow)
Repo: github.com/aetherino/Warden (remote `origin`, branch `master`).

## Architecture (locked)
- Build-time harness: self-hosted Python Anthropic Agent SDK → crawls → writes graded findings to Supabase.
- Run-time: turn-capped Agent SDK pass in a Vercel function → resolves items vs Supabase (+ bounded live check) → dossier; precomputed fallback within ≤8s.
- UI: Next.js + three.js on Vercel.
- Self-verification: Vercel preview deploys + Chrome plugin driving the live UI.

## Open Issues
- [ ] #002 — Exa API key needed for the independent-source confidence layer (§7) — Owner: user (provide when it blocks dev) — P1
- [ ] #003 — Anthropic API key for self-hosted Python Agent SDK harness — Owner: user (provide when it blocks dev) — P0
- [ ] #004 — Supabase project + connection string/keys — Owner: user (provide when it blocks dev) — P0
- [ ] #005 — Vercel connect (3 steps, user-only, browser OAuth): `npm i -g vercel` → `vercel login` → `vercel link` (creates .vercel/project.json) — Owner: user (when ready to deploy) — P1
- [ ] #006 — Build golden set: ≥25 cases, dev/holdout split, AI-labeled from real CPSC recalls + Prop 65 decoys — Owner: TBD — P1
- [ ] #007 — ZIP→water-system (PWSID) mapping for EPA water-by-ZIP source — Owner: TBD — P2
- [ ] #008 — Build the exposure-pathway hypothesis library (the curated fast path) for §11: context signal → known pathway → source to query (e.g. airport/base → AFFF → PFAS/UCMR; old home + reno → lead paint; ag region + well → nitrates/atrazine) — Owner: TBD — P1
- [ ] #012 — Implement the open-inference judge (INFER→GROUND→SCAN→LABEL, §11). Guards that must be CALIBRATED not asserted: (a) hardcoded eTLD+1 domain allowlist for Tier-1/2; (b) agent matching at REGISTRY-ID level (normalize PFOS/PFAS-class/CASRN to same id before agent_mismatch reject — else over-rejects the PFAS positive case); (c) N=8 investigate / M=3 surface caps re-derived from a surface budget once golden set exists; (d) string-linkage co-occurrence window N + transport-verb list tuned against the seed set; (e) negative-control fixtures re-validated against source hierarchy each release; (f) human-gated promotion to curated + immutable non-promoted seed oracle (no auto-promotion laundering) — Owner: TBD — P1

## Resolved
- [x] #000 — Rubric v2 written: added robustness gates (§9), orchestration visibility (§10), safety-signaling stance, golden-set leakage fixes, live-crawl guardrails (§E), all-fields compliance scan.
- [x] #001 — OpenViking role decided: DROPPED (it's an AI-agent context DB, not an issue tracker). Using ISSUES.md for tracking.
- [x] #010 — Frontend scaffolded: Next.js 15 App Router + TS + Tailwind 4, three.js + @react-three/fiber/drei. Shield at components/InvisibleShield.tsx (Fresnel rim + iridescent GLSL, ShieldLoader.tsx handles ssr:false). Dev server verified HTTP 200. Run: `npm run dev`.
- [x] #009 — Foundation committed to master + pushed to origin (baseline checkpoint). node_modules/.next/.env*/.vercel ignored.
- [x] #011 — brain.md created (living codebase-context doc); ISSUES.md docs-map added.
- [x] #013 — Open-inference §11 design workflow (worheob9k, 8 agents) landed + applied to rubric: schema gains `origin`+`discovery`; Gate 12 extended (no Gate 13 collision); two-gate model (search-grounded default-reject judge → §3); mechanical domain allowlist; string-linkage + anti-equivocation; `discovery_rejected.json`; surface cap (≤3 ai_inferred rows); §10 pathway legibility; shield origin-blind. Verifiers caught + fixed a broken negative control, ungrounded tier assignment, fake determinism gate, dossier flooding.

## Decisions Log
- 2026-06-13 — Triage-not-detection is the thesis; output is a record-state statement, never a safety verdict.
- 2026-06-13 — Disregard schedule concerns; full scope incl. EPA water + full confidence pipeline + three.js shield.
- 2026-06-13 — Demo crawls live (not frozen) — guardrails: caching, seeded basket, ≤8s fallback, T-30min smoke check.
- 2026-06-13 — Golden set is AI-labeled but leakage-proof: ground-truth ACT cases, separate labeler agent, dev/holdout split.
- 2026-06-13 — Delegate simple coding to Sonnet agents; Opus does the heavy work.
- 2026-06-13 — OpenViking is an AI-agent context DB, NOT an issue tracker; using this markdown file for issue/state tracking.
- 2026-06-13 — Added contextual discovery (§11): Warden reasons from environmental/proximity context to investigate unnamed hazards (e.g. airport/base → PFAS). Hard rule: hypotheses are reasoning artifacts, never claims; unconfirmed → calm record statement, never a speculative alarm.
- 2026-06-13 — Git workflow: checkpoint commits per milestone on master, push to origin; commit history doubles as §8 Autonomy evidence (build→verify→fix loop). brain.md + ISSUES.md are living docs, updated each milestone.
- 2026-06-13 — Open inference (§11) gated by a two-layer model: a search-grounded, default-reject judge proves the PATHWAY is a real established route (mechanical domain allowlist, string-linkage, anti-equivocation) BEFORE investigation; §3 still proves the FINDING. AI-inferred items labeled by `origin` + carry two receipts (pathway grounding + finding source). Determinism only over the cached basket; live inference non-deterministic (5/5 stability-reject of the negative control).
