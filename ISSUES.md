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
Repo: github.com/glazzerino/Warden (remote `origin`, branch `master`).

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
- [ ] #008 — Build the exposure-pathway hypothesis library for contextual discovery (§11): context signal → known pathway → source to query (e.g. airport/base → AFFF → PFAS/UCMR; old home + reno → lead paint; ag region + well → nitrates/atrazine). Include ≥2 discovery golden cases, one that correctly finds nothing — Owner: TBD — P1

## Resolved
- [x] #000 — Rubric v2 written: added robustness gates (§9), orchestration visibility (§10), safety-signaling stance, golden-set leakage fixes, live-crawl guardrails (§E), all-fields compliance scan.
- [x] #001 — OpenViking role decided: DROPPED (it's an AI-agent context DB, not an issue tracker). Using ISSUES.md for tracking.
- [x] #010 — Frontend scaffolded: Next.js 15 App Router + TS + Tailwind 4, three.js + @react-three/fiber/drei. Shield at components/InvisibleShield.tsx (Fresnel rim + iridescent GLSL, ShieldLoader.tsx handles ssr:false). Dev server verified HTTP 200. Run: `npm run dev`.
- [x] #009 — Foundation committed to master + pushed to origin (baseline checkpoint). node_modules/.next/.env*/.vercel ignored.
- [x] #011 — brain.md created (living codebase-context doc); ISSUES.md docs-map added.

## Decisions Log
- 2026-06-13 — Triage-not-detection is the thesis; output is a record-state statement, never a safety verdict.
- 2026-06-13 — Disregard schedule concerns; full scope incl. EPA water + full confidence pipeline + three.js shield.
- 2026-06-13 — Demo crawls live (not frozen) — guardrails: caching, seeded basket, ≤8s fallback, T-30min smoke check.
- 2026-06-13 — Golden set is AI-labeled but leakage-proof: ground-truth ACT cases, separate labeler agent, dev/holdout split.
- 2026-06-13 — Delegate simple coding to Sonnet agents; Opus does the heavy work.
- 2026-06-13 — OpenViking is an AI-agent context DB, NOT an issue tracker; using this markdown file for issue/state tracking.
- 2026-06-13 — Added contextual discovery (§11): Warden reasons from environmental/proximity context to investigate unnamed hazards (e.g. airport/base → PFAS). Hard rule: hypotheses are reasoning artifacts, never claims; unconfirmed → calm record statement, never a speculative alarm.
- 2026-06-13 — Git workflow: checkpoint commits per milestone on master, push to origin; commit history doubles as §8 Autonomy evidence (build→verify→fix loop). brain.md + ISSUES.md are living docs, updated each milestone.
