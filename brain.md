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
- **Hypotheses are reasoning artifacts, never claims.** (Contextual discovery, §11.) **Two gates in series:** a search-grounded, default-reject judge proves the *pathway* is a real established route (mechanical domain allowlist; string-linkage + anti-equivocation; agent re-derived independently) → then §3 proves the *finding*. AI-inferred items are labeled by `origin` and carry two receipts (pathway grounding + finding source). Unconfirmed → calm record statement, never a speculative alarm. Rejected pathways vanish to `discovery_rejected.json` (verifier-only). Surface-capped (≤3 ai_inferred rows; empties aggregate, bottom-ranked). Shield + tiering are origin-blind.

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
- **Harness:** self-hosted Python + Anthropic Agent SDK (not yet scaffolded — schema + `SOURCES.md` now ready; blocked only on the Anthropic + Supabase keys).
- **Data:** Supabase Postgres.
- **Host:** Vercel (Fluid Compute; supports Python natively — relevant for the runtime agent). Remote: `github.com/aetherino/Warden`.

## 5. Repo layout
```
app/                      Next.js App Router (layout.tsx, page.tsx, globals.css)
components/
  InvisibleShield.tsx     THE centerpiece — GLSL Fresnel rim + iridescent bands. Edit here to make it react to triage.
  ShieldLoader.tsx        client wrapper handling Next.js ssr:false constraint
rubric.md                 the spec / gates ("done" definition)
ISSUES.md                 tasks, state, decisions log
brain.md                  this file
SOURCES.md                verified data-source reference (endpoints, auth, ZIP→PWSID, citation strategy)
.claude/skills/           frontend-design skill (installed, for UI work)
fixtures/                 (pending) example payload/dossier + golden_dev/golden_holdout
harness/                  (pending) Python Agent SDK build-time crawler
```

## 6. Assumptions (revisit if any breaks)
- **Core sources keyless & public — VERIFIED LIVE (recon):** CPSC (saferproducts.gov REST), EPA ECHO/SDWA, openFDA, USDA-FSIS. Keys only for: Exa + OpenAlex (now needs a free key as of Feb 2026) + Semantic Scholar (⚠️ rejects gmail) [§7], and infra Anthropic + Supabase + Vercel.
- **CPSC is the money-shot ACT source** — verified no-auth REST; query Manufacturer+Importer+Distributor + ProductName/Title/Description, merge by `RecallID` (model#/UPC mostly empty → brand+noun keyword + Description confirm).
- **ZIP→PWSID approach FOUND (recon):** no direct API → Census/HUD ZIP→county crosswalk → ECHO `get_systems` by county; `UCMR5_ZIPCodes.txt` direct for PFAS. PWSID is the cross-source join key. (Still the trickiest integration; build the cached table at setup.)
- **Per-violation EPA findings need bulk-CSV ingestion** (REST gives only counts) → a quarterly bulk-refresh job distinct from the live path.
- **Golden set is AI-labeled but leakage-proof:** ground-truth ACT cases, separate labeler agent, dev/holdout split.

## 7. Open considerations / watch-list
- **Schema landed:** per-finding now has `origin ∈ {user_listed,curated_pathway,ai_inferred}` + a `discovery` block (pathway + grounding receipt); plus a `record_statement` object and `discovery_rejected.json`. Harness data model can be built against this.
- **Open-inference tunables must be CALIBRATED, not asserted** (see ISSUES #012): the Tier-1/2 domain allowlist (now extended to CPSC/FDA/FSIS/oag.ca.gov regulators), agent-matching at registry-id level (or it over-rejects PFAS), N=8/M=3 caps, the linkage co-occurrence window + transport-verb list, and negative-control re-validation each release. These are the soft spots where the rigor can silently break.
- **Recon gotchas (SOURCES.md):** CPSC defaults to XML (`format=json` required); EPA `get_download` errors on JSON (CSV only) and the PWSID param is `p_pid`; OEHHA Prop 65 list sits behind an Incapsula bot-wall (browser/Playwright fallback); `source.locator` must hold COMPOSITE keys for EPA-violation/UCMR; FRS `get_facilities` + FSIS schema are UNVERIFIED (re-verify before relying).
- **Absence-is-not-safety at the data layer:** UCMR reports only ≥MRL (null = non-detect, not missing); small systems unsampled; openFDA/SDWIS lag reality. Capture as-of/dataset-version on every finding; render absence as a neutral timestamped record statement.
- **three.js perf on a projector/judge laptop** — cap it, test on non-dev hardware, keep a static fallback.
- **Live-crawl rate limits** during the demo — caching layer + seeded basket are the insurance.
- **Blank-screen demo failure** — judge types items with no recall → must show the neutral record statement, never silence. (§9)

## 8. Conventions
- **Delegation:** simple/mechanical coding → Sonnet subagents; heavy design/logic → Opus. Substantive tasks → Workflow orchestration (ultracode on).
- **Git as evidence:** checkpoint commits per milestone; git history doubles as the §8 Autonomy "build→verify→fix loop" trail. **Direct-master commits enabled** (`Bash(git push:*)` permission) — commit + push straight to `master`, no PRs (the earlier branch/PR flow caused diverging-tracker friction).
- **Keys on demand:** surface each external key request exactly when a step blocks (user preference), not upfront.
- **This doc + ISSUES.md evolve every milestone.**

## 9. Evolution log
- **2026-06-13** — Foundation: rubric v2 (+§11 contextual discovery), Next.js+three.js shield scaffold, ISSUES.md tracker, memory seeded. Two workflows in flight: open-inference §11 design + source recon. brain.md created. Baseline committed.
- **2026-06-13** — Open-inference §11 design (8-agent adversarial workflow) applied to rubric: schema `origin`+`discovery`, extended Gate 12, search-grounded default-reject judge (domain allowlist, string-linkage, anti-equivocation), `discovery_rejected.json`, surface cap, §10 pathway legibility, origin-blind shield. Source-recon workflow still running.
- **2026-06-13** — Source recon (7-agent) → SOURCES.md; §11 allowlist extended to all regulators; PRs #1–#3 merged to master; direct-master commits enabled; frontend-design skill installed. Trackers flushed.
