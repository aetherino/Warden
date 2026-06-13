# 🧠 brain.md — Warden's working memory

> **This is a living document.** It holds the *why* and *how-it-hangs-together* of the Warden codebase: the mental model, design invariants, assumptions, and open considerations. It is updated at every milestone. It is NOT the spec (that's `rubric.md`) and NOT the task list (that's `ISSUES.md`).
>
> **Doc map:** `rubric.md` = what "done" means (gates) · `ISSUES.md` = tasks + state + decisions log · `brain.md` = context, rationale, assumptions · `SOURCES.md` = data-source reference *(pending recon workflow)*.

_Last updated: 2026-06-13 — foundation checkpoint._

---

## 1. What Warden is (one breath)
A consumer hazard-audit agent. You list what you own (+ non-medical context); it grinds public regulatory/litigation/environmental/research sources and returns ONE ranked, conditioned, **cited** action plan. **Triage, not detection.** It is a **reporter of the public record, never a health/safety advisor.** Full spec in `rubric.md`.

## 2. Design invariants (violating any of these is a bug, not a style choice)
- **Reporter, not advisor.** No "safe/unsafe" verdict, no medical advice, no health-effect synthesis. Output is the *state of the public record about a thing, as of a timestamp* — never a verdict about the thing.
- **Absence ≠ safety.** A clean result says "checked X, Y, Z as of \<date\>; nothing on file," never "you're safe." No green/all-clear iconography.
- **Provenance is mechanical.** Every finding carries `source.url` + `source.locator`; "confirmed" means the URL returns 200 AND the fact appears at the locator. Unconfirmed → dropped to `rejected`. No claim exceeds what the source states.
- **Calibration over alarm.** Over-alarming is the cardinal sin (it's what competitors get wrong). Ubiquitous warnings ≤ CONTEXT; regional baselines ≤ AWARE unless a stated condition applies.
- **Actions trace to a source.** Every `action` quotes a regulator/source instruction; Warden originates no advice.
- **Hypotheses are reasoning artifacts, never claims.** (Contextual discovery, §11.) An inferred pathway must pass a search-grounded judge before investigation, and unconfirmed → calm record statement, never a speculative alarm.

## 3. Architecture mental model
```
[Build-time harness]                    [Run-time]                      [UI]
 self-hosted Python      writes graded   Vercel function (turn-capped   Next.js + three.js
 Anthropic Agent SDK  ─▶  findings +  ─▶ Agent SDK pass) resolves    ─▶ "invisible shield"
 crawls sources,         provenance     user items vs Supabase          centerpiece reacts to
 runs adversarial        to Supabase    (+ bounded live check),         triage state (never
 confidence pipeline                    falls back to precomputed       implies a verdict)
                                         within ≤8s. No hang, ever.
```
- **Build-time** does the long-horizon, expensive work (crawl + adversarial confidence grading). **Run-time** is fast, turn-capped, and degrades gracefully.
- **Supabase** is the handoff seam between the two runtimes — and the seam where demos die, so it gets attention.
- **Demo crawls live** (user's call) → the no-hang fallback (§A) and citation freshness are load-bearing; guardrails in §E (caching, seeded basket, T-30min smoke check).

## 4. Tech stack (as scaffolded)
- **Frontend:** Next.js 15.5.19 (App Router) · React 19 · TypeScript · Tailwind 4 (`@tailwindcss/postcss`).
- **3D:** three.js 0.177.0 · @react-three/fiber 9.6.1 · @react-three/drei 10.7.7.
- **Harness:** self-hosted Python + Anthropic Agent SDK (not yet scaffolded — waiting on finalized schema + source recon).
- **Data:** Supabase Postgres.
- **Host:** Vercel (Fluid Compute; supports Python natively — relevant for the runtime agent). Remote: `github.com/glazzerino/Warden`.

## 5. Repo layout
```
app/                      Next.js App Router (layout.tsx, page.tsx, globals.css)
components/
  InvisibleShield.tsx     THE centerpiece — GLSL Fresnel rim + iridescent bands. Edit here to make it react to triage.
  ShieldLoader.tsx        client wrapper handling Next.js ssr:false constraint
rubric.md                 the spec / gates ("done" definition)
ISSUES.md                 tasks, state, decisions log
brain.md                  this file
fixtures/                 (pending) example payload/dossier + golden_dev/golden_holdout
SOURCES.md                (pending) data-source reference from recon workflow
harness/                  (pending) Python Agent SDK build-time crawler
```

## 6. Assumptions (revisit if any breaks)
- **Core sources are keyless & public:** CPSC, EPA (SDWIS/ECHO/UCMR), CA Prop 65 — being verified by the recon workflow. Only the confidence layer (Exa) + LLM (Anthropic) + Supabase need keys.
- **CPSC is the money-shot ACT source** — cleanest API, most visceral demo ("your heater was recalled").
- **Item matching is feasible via keyword/model query** against CPSC (to be confirmed by recon).
- **ZIP→PWSID is the riskiest join** (user ZIP → their water system) — flagged as the nastiest integration; recon is scoping it.
- **Golden set is AI-labeled but leakage-proof:** ground-truth ACT cases, separate labeler agent, dev/holdout split.

## 7. Open considerations / watch-list
- **Schema change incoming:** per-finding schema gains `origin: user_listed | ai_inferred` + a pathway-grounding citation (from the open-inference design workflow). Don't build the harness data model until that lands.
- **three.js perf on a projector/judge laptop** — cap it, test on non-dev hardware, keep a static fallback.
- **Live-crawl rate limits** during the demo — caching layer + seeded basket are the insurance.
- **Blank-screen demo failure** — judge types items with no recall → must show the neutral record statement, never silence. (§9)

## 8. Conventions
- **Delegation:** simple/mechanical coding → Sonnet subagents; heavy design/logic → Opus. Substantive tasks → Workflow orchestration (ultracode on).
- **Git as evidence:** checkpoint commits per milestone; git history + commit messages double as the §8 Autonomy "build→verify→fix loop" trail. Baseline on `master`; push to `origin`.
- **Keys on demand:** surface each external key request exactly when a step blocks (user preference), not upfront.
- **This doc + ISSUES.md evolve every milestone.**

## 9. Evolution log
- **2026-06-13** — Foundation: rubric v2 (+§11 contextual discovery), Next.js+three.js shield scaffold, ISSUES.md tracker, memory seeded. Two workflows in flight: open-inference §11 design + source recon. brain.md created. Baseline committed.
