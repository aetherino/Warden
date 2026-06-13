# Warden — Open Issues & Project State

## Status: v1 RUNNING + expanding. 4 parallel agents in flight: white particle-field reskin (worktree, runs frontend-design skill, + UX/error fixes), CA Prop 65 client (→CONTEXT), EPA water-by-ZIP client (→ADDRESS), triage hardening (compliance/§3/injection gates). Main-loop is orchestrating, not hand-coding.

## In flight
- Tester (main tree, new harness/tests/ + e2e/): building + running e2e suite (pytest API + Playwright UI) — RUNNING.
- Reskin (worktree 61485df): white particle-field DONE — blob fixed (point-size attenuation was ~50× too big), archival type (Fraunces/Newsreader/IBM Plex Mono), tier-reactive field (calm slate→ACT red breach), mono receipt citations, error boundary, validated fetch; build/tsc/eslint clean. MERGE pending tester finish (merging now would HMR-reload :3000 mid-test).
- Backend ACT+ADDRESS+CONTEXT from real sources + compliance/§3/injection gates — committed (e6d67bc).
- QUEUED (gated on tester+merge): §12 live agentic scan — backend SSE step-stream + frontend live scan-log; + add the ZIP/water-source intake input (#036) so EPA findings surface from the UI.

## Big Picture
Consumer hazard-audit agent. Lists what you own → grinds public regulatory/litigation/
environmental/research sources → returns ONE ranked, conditioned, cited action plan.
Thesis: **triage, not detection.** Reporter of the public record, never a health/safety advisor.
Centerpiece: three.js "invisible shield." Demo crawls sources live (with caching + fallback guardrails).

## Docs map
- `rubric.md` — the spec / gates ("done" definition)
- `ISSUES.md` — this file: tasks, state, decisions
- `brain.md` — living context: mental model, invariants, assumptions, watch-list
- `SOURCES.md` — verified data-source reference (endpoints, auth, ZIP→PWSID, citation strategy)
- `.claude/skills/frontend-design/` — installed UI design skill (for when we build the frontend)
Repo: github.com/aetherino/Warden (remote `origin`, branch `master`).

## Architecture (locked)
- Build-time harness: self-hosted Python Anthropic Agent SDK → crawls → writes graded findings to Supabase.
- Run-time: turn-capped Agent SDK pass in a Vercel function → resolves items vs Supabase (+ bounded live check) → dossier; precomputed fallback within ≤8s.
- UI: Next.js + three.js on Vercel.
- Self-verification: Vercel preview deploys + Chrome plugin driving the live UI.

## Open Issues
- [ ] #002 — Exa API key needed for the independent-source confidence layer (§7) — Owner: user (provide when it blocks dev) — P1
- [ ] #004 — Supabase project + connection string/keys — Owner: user — P1 (v1 uses LOCAL SQLITE; Postgres only needed at deploy — Supabase or Vercel-Marketplace Neon)
- [ ] #005 — Vercel connect (3 steps, user-only, browser OAuth): `npm i -g vercel` → `vercel login` → `vercel link` (creates .vercel/project.json) — Owner: user (when ready to deploy) — P1
- [ ] #006 — Build golden set: ≥25 cases, dev/holdout split, AI-labeled from real CPSC recalls + Prop 65 decoys — Owner: TBD — P1
- [ ] #007 — ZIP→PWSID mapping (APPROACH FOUND, recon): no direct API → cache Census/HUD ZIP→county crosswalk → ECHO `get_systems` by county + disambiguate (CWS, pop, cities); `UCMR5_ZIPCodes.txt` is a direct ZIP→PWSID for the PFAS path. PWSID = cross-source join key. Remaining: pick crosswalk (#016) + build cached table at harness setup — Owner: TBD — P1
- [ ] #008 — Build the exposure-pathway hypothesis library (the curated fast path) for §11: context signal → known pathway → source to query (e.g. airport/base → AFFF → PFAS/UCMR; old home + reno → lead paint; ag region + well → nitrates/atrazine) — Owner: TBD — P1
- [ ] #012 — Implement the open-inference judge (INFER→GROUND→SCAN→LABEL, §11). Guards that must be CALIBRATED not asserted: (a) hardcoded eTLD+1 domain allowlist for Tier-1/2 (now incl. CPSC/FDA/FSIS/oag.ca.gov); (b) agent matching at REGISTRY-ID level (normalize PFOS/PFAS-class/CASRN to same id before agent_mismatch reject — else over-rejects the PFAS positive case); (c) N=8 investigate / M=3 surface caps re-derived from a surface budget once golden set exists; (d) string-linkage co-occurrence window N + transport-verb list tuned against the seed set; (e) negative-control fixtures re-validated against source hierarchy each release; (f) human-gated promotion to curated + immutable non-promoted seed oracle (no auto-promotion laundering) — Owner: TBD — P1
- [ ] #014 — Semantic Scholar API key: S2 rejects free-email (gmail) key requests → user needs an institutional/custom-domain email OR accept Plan-B (unauthenticated, heavy-cached, ≤1 rps, precompute-only). DECISION NEEDED — Owner: user — P1
- [ ] #015 — OpenAlex free API key (openalex.org/settings/api) now required (Feb 2026) for a real crawl; keyless ≈ 10 calls/day (demo-only). Self-serve, instant — Owner: user — P1
- [ ] #016 — Pick ZIP→county crosswalk (US Census ZCTA-to-county vs HUD USPS ZIP-county); they differ on multi-county ZIPs, affecting which PWS surface — Owner: TBD — P2
- [ ] #017 — Live-verify before relying (recon flagged UNVERIFIED): EPA FRS `get_facilities` response + USDA-FSIS field schema (gov docs 403'd) — Owner: TBD — P2 (stretch)
- [ ] #018 — Settlement-claim ACT path: in scope for demo or deferred to a scrape stub? No API, weak citation stability (dereference to official administrator page, capture retrieved-at) — DECISION — Owner: user — P2
- [ ] #019 — Per-source live-vs-precompute mapping for the ≤8s runtime budget (§A/§E): EPA bulk + scholarly = precompute; CPSC + AG-notice queries fast enough to consider live — Owner: TBD — P1
- [ ] #020 — openFDA optional free key (raises 1k→120k/day) for the FDA/USDA stretch source — Owner: user (self-serve) — P2
- [ ] #024 — Triage reliability: Anthropic API intermittently stalls or returns an empty tool payload, degrading some items to empty record statements even when a real recall exists. Mitigated (streaming + retry-on-error/empty ×3 + graceful degrade + cache). Watch: consider Haiku fallback / longer backoff if it persists — Owner: main — P1
- [ ] #025 — Wire EPA water (SDWA/UCMR) + CA Prop 65 sources into the runtime (v1 is CPSC-only) — Owner: TBD — P1
- [ ] #026 — Build the §3 re-fetch verifier: v1 carries the CPSC-provided source.url but does not yet re-fetch + confirm hazard_type at the locator (drop-to-rejected) — Owner: TBD — P1
- [ ] #027 — Deploy path: swap SQLite cache → Postgres (Supabase/Neon), expose the Python brain via `cloudflared`, set WARDEN_SERVICE_URL, deploy Next.js to Vercel — Owner: TBD — P2
- [x] #035 — §12 Live agentic scan (Gate 13): DONE. Backend `POST /resolve/stream` (FastAPI StreamingResponse, NDJSON) emits REAL step events `{seq,phase,source,item?,status,detail,tier?}` per unit of work + a terminal `{type:"dossier",...}` (byte-equal to `/resolve` on the cached path). New `warden/dossier_events.py` generator (build_dossier unchanged → /resolve + pytest intact). No fabricated delays; concurrent items interleave. Frontend: live scan-log component fed via `response.body.getReader()` (proxied through new `app/api/dossier/stream/route.ts`), shield reacts to highest tier seen so far, clean/empty path streams too, graceful fallback to `/api/dossier`. Verified: pytest 8/8, stream curl, Playwright `e2e/scan.spec.mjs` PASS, build/tsc/lint clean.
- [x] #036 — DONE. Added optional **Your area** intake (ZIP field + "I drink unfiltered tap water" toggle) → sent as `context.{zip, water_source}`; demo basket pre-fills ZIP 48503 + tap. EPA ADDRESS (Flint) now surfaces in the UI (Playwright-confirmed). Non-medical proxies only.
- [ ] #037 — (later) Snappy enrollment questionnaire: "where do you live? / what do you own?" → parsed by an LLM (SONNET) into structured items + location/context. Feel light/progressive — Owner: TBD — P2
- [ ] #038 — (later) Runtime contextual-discovery INITIATIVES + adversarial filter (extends §11): propose (Sonnet, high-recall pathway hypotheses) → PROSECUTE (independent skeptic, search-grounded, default-reject, self-falsification — survive only if a Tier-1/2 source affirmatively attests the route) → DECLARE as AI-inferred ("Checked because of your context", two receipts: why-we-looked vs what-we-found); rejected → discovery_rejected.json, never shown — Owner: TBD — P2
- [ ] #039 — (later) Build a `warden-discovery` SKILL encapsulating propose→prosecute→declare — Owner: TBD — P2
- [ ] #040 — (later) UX REWORK (designer→coder pair, both run frontend-design skill): incorporate enrollment (#037), initiatives + AI-inferred labeling (#038), live scan (§12), + COPY rework (golden-circle why→how→what; lead "be aware of the things that affect your health — and take action"; DROP "public record"/philosophy from user-facing copy; condense/digestible; warm WHY at value-prop layer only, findings stay reporter-not-advisor) + LEGIBILITY (text in boxes/panels over the particle field). Designer agent RUNNING → design/UX_REWORK.md; coder queued behind the live-scan merge — Owner: main — P1
- [ ] #032 — Compliance whitelist for a CROSS-SOURCE scan: compliance.is_compliant runs only on the CPSC path today. A future global pass over EPA/Prop65 text must whitelist proper-noun "Safe Drinking Water Act" and negated "...not...unsafe" (else benign false positives) — Owner: TBD — P2
- [ ] #028 — Visual direction gap: v1 shipped a DARK bg + iridescent SPHERE; user expected a PARTICLE SYSTEM on a WHITE/light background. Frontend judge agent evaluating + recommending the pivot. Constraint: clean/calm state must NOT imply "safe" (no green/all-clear) even on white — DECISION + likely reskin — Owner: user/main — P1
- [ ] #029 — Chrome plugin MCP not connected in-session → UI audit running via headless Playwright as a stand-in. Connect the plugin for an in-browser manual audit — Owner: user — P2

## Resolved
- [x] #000 — Rubric v2 written: added robustness gates (§9), orchestration visibility (§10), safety-signaling stance, golden-set leakage fixes, live-crawl guardrails (§E), all-fields compliance scan.
- [x] #001 — OpenViking role decided: DROPPED (it's an AI-agent context DB, not an issue tracker). Using ISSUES.md for tracking.
- [x] #010 — Frontend scaffolded: Next.js 15 App Router + TS + Tailwind 4, three.js + @react-three/fiber/drei. Shield at components/InvisibleShield.tsx (Fresnel rim + iridescent GLSL, ShieldLoader.tsx handles ssr:false). Dev server verified HTTP 200. Run: `npm run dev`.
- [x] #009 — Foundation committed to master + pushed to origin (baseline checkpoint). node_modules/.next/.env*/.vercel ignored.
- [x] #011 — brain.md created (living codebase-context doc); ISSUES.md docs-map added.
- [x] #013 — Open-inference §11 design workflow (worheob9k, 8 agents) landed + applied to rubric: schema gains `origin`+`discovery`; Gate 12 extended (no Gate 13 collision); two-gate model (search-grounded default-reject judge → §3); mechanical domain allowlist; string-linkage + anti-equivocation; `discovery_rejected.json`; surface cap (≤3 ai_inferred rows); §10 pathway legibility; shield origin-blind. Verifiers caught + fixed a broken negative control, ungrounded tier assignment, fake determinism gate, dossier flooding.
- [x] #021 — Source recon workflow (w9u40katd, 7 agents) → SOURCES.md: verified endpoints/auth (CPSC, EPA ECHO/SDWA, openFDA all keyless), ZIP→PWSID approach (#007), key matrix, per-source citation strategy, harness implications. §11 allowlist gap surfaced → extended.
- [x] #022 — Direct-master-commit workflow enabled (`Bash(git push:*)` permission); PRs #1/#2/#3 squash-merged to master (rubric §11, frontend-design skill, SOURCES.md). frontend-design skill installed.
- [x] #003 — Anthropic API key PROVIDED (in gitignored `.env`; rotate post-hackathon — shared in chat).
- [x] #023 — v1 built + verified end-to-end: CPSC live (keyword fan-out + relevance rank) → Anthropic Sonnet triage (streaming, structured tool output, grounded citations, retry-on-empty) → SQLite cache → FastAPI `/resolve` → Next.js `/api/dossier` proxy → dossier UI + tier-reactive three.js shield. Verified: Peloton→ACT (recall 21128) cited, heater→6×ACT, empty-input→§9 record statement, page compiles. RUN.md added. (Triage reliability tracked in #024.)
- [x] #030 — UI audit (headless Playwright, a self-verification pass): PASS on load/render/ranking/citations(26/26 cpsc.gov)/shield-reacts-red-on-ACT/CONTEXT-suppressed/compliance-clean/empty-input/0-console-errors. 5 UX polish nits → folded into the reskin. Screenshots in /tmp/warden_audit/.
- [x] #031 — v1 adversarial review (workflow, 31 agents): 1 BLOCKER (compliance/§3/injection enforced only by system prompt) + error-handling defects → fixes dispatched (triage hardening agent; frontend fixes folded into reskin; store.put-in-try to do in dossier integration).
- [x] #033 — Backend expansion (orchestrated, 4 agents): prop65.py (CONTEXT), epa_water.py (ADDRESS, ZIP-driven), compliance.py + triage hardening (banned-token scan, §3 re-fetch confirm, injection delimiter, retry fix), dossier.py integration (+store.put-in-try). Verified end-to-end: heater→6 ACT + Flint ZIP→ADDRESS + extension cord→CONTEXT(suppressed), all cited, empty→record statement, no 500. Closes the review BLOCKER (#031). Resolves #003.

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
- 2026-06-13 — §11 pathway-grounding allowlist EXTENDED to all regulators (added `*.cpsc.gov`/`saferproducts.gov`, `*.fda.gov`/openFDA, `fsis.usda.gov`, `oag.ca.gov`); the "established route" + linkage checks still apply, so a recall/notice page must attest the route, not just name a hazard.
- 2026-06-13 — Git workflow CHANGED to direct-master commits (`Bash(git push:*)` permission in settings.local.json); PRs no longer required — checkpoint + push straight to master (the branch/PR flow caused diverging-tracker friction).
- 2026-06-13 — Recon-informed: ZIP→PWSID via Census/HUD county crosswalk + UCMR5 direct map; per-violation findings need bulk-CSV ingestion (quarterly refresh job); confidence layer precomputed in the harness, never on the runtime hot path.
- 2026-06-13 — Agentic-run view is now a rubric requirement (§12 + Gate 13): runtime STREAMS its real steps (per-source) to a live UI scan log — makes Autonomy/Orchestration visible, not just stored (§10). Honest (no fake delays), within ≤8s. To build (#035) after tester+reskin-merge.
- 2026-06-13 — v1 store = LOCAL SQLITE (harness/warden.db) behind a thin store module; Postgres (Supabase or Vercel-Marketplace Neon) is a deploy-time swap. (Vercel has no first-party DB; offers Neon via Marketplace — answer to "can Vercel replace Supabase?")
- 2026-06-13 — v1 backend = Python FastAPI "brain" (CPSC + Anthropic triage + cache) on :8787; Next.js UI proxies via /api/dossier. At deploy, cloudflared tunnels the brain to a Vercel-hosted UI (per user hint).
- 2026-06-13 — Anthropic SDK LEARNING: default (600s timeout, 2 retries) turns transient stalls into multi-minute hangs. Fix: bounded 30s timeout, max_retries=0, STREAM the triage call (per-chunk timeout), cap recalls to ~6, retry triage on error-OR-empty ×3, graceful per-item degradation (§9). Model: claude-sonnet-4-6.
