# **Warden — Build Rubric**

Consumer hazard-audit agent: given a person's product list (+ optional non-medical context), it grinds public regulatory, litigation, environmental, and independent-research sources and returns a ranked, conditioned, cited action plan — not a feed, not a score, not health advice.

## **What Warden is**

**The problem.** Hazards in the things people own — recalls, toxic-tort lawsuits, chemical listings, contaminated water, open settlements — are real and public, but scattered across dozens of government and independent sources in formats no individual tracks. Most people never learn their space heater was recalled, their water system breached a limit, or that they qualify for a settlement. Existing scanner apps detect isolated facts and over-alarm (nearly every product carries a Prop 65 sticker), which trains people to ignore everything.

**Who it's for.** Anyone with a home and possessions — especially parents, renters, and Bryan Johnson fans who want signal that official channels are slow to surface.

**What it does.** The person lists what they own (+ optional non-medical context: kids at home, renovation, water source, region, *and proximity signals like "near an airport / military base / farmland / industrial site"*). Warden checks each item across the sources below **and reasons from context to investigate hazards the person never named** (§11) — then returns one ranked action plan: what to do, why, and the receipt for every claim.

**Core insight — triage, not detection.** Detection is commodity; the value is calibrated severity and honest confidence. Warden ranks each finding by how much it actually matters *to this person*, suppresses ubiquitous noise, **reasons from context to discover hazards no product list would surface** (§11), surfaces what official channels haven't flagged yet, and grades independent evidence transparently. It reports regulatory and contamination *facts* with provenance; never health advice, never a "safe/unsafe" verdict.

**Output: four tiers (used throughout the gates below):**

* **ACT** — acute and remediable now: an active recall on an item owned, or a settlement to claim. Stop use / get refund / file claim.
* **ADDRESS** — real, conditional, remediable: e.g. a water-system breach *given* the person drinks unfiltered tap. Always states the triggering condition.
* **AWARE** — real but baseline / low-action: regional radon, naturally occurring asbestos. Calm, low priority depending on official knowledge of detected entities.
* **CONTEXT** — ubiquitous, non-specific noise (generic Prop 65 labels): suppressed by default, shown labeled on request.

## **Safety signaling — the core stance (read first)**

Warden never renders a verdict about a *thing*; it reports the **state of the public record about that thing, as of a timestamp**. This single reframing is what keeps Warden a reporter, not an advisor, and it governs every surface:

* The signal is **coverage + recency of the check**, never safety of the object. A clean result says: *"Checked CPSC, Prop 65, EPA on \<date\> — no active recall or public action on file for this item,"* not "you're safe."
* **No safe/all-clear semantics, visual or textual.** No green checkmarks, no "safe"/"fine"/"healthy" iconography or color used to mean *the item is safe*. Absence is neutral and timestamped, never reassuring.
* **Every `action` traces to a source's own instruction** (the recall notice says "stop use / get refund"; the claim site states eligibility). Warden quotes the regulator; it originates no advice.
* A no-findings result is an informative record statement, never a blank screen — see §9.

## **Architecture (what "done" is measured against)**

* **Build-time harness:** self-hosted **Python Anthropic Agent SDK** (headless) → crawls sources, runs the adversarial confidence pipeline (§7), writes graded findings + provenance to Supabase. Long-horizon work; captured in the session log. Self-hosted (no managed always-on server); re-runnable on a new source set/region by config alone.
* **Run-time:** a turn-capped Agent SDK pass inside the Vercel function resolves the user's items against Supabase **(+ bounded live check — the demo crawls live, see §E)**, assembles the dossier, falls back to precomputed-only if it nears the time budget. No hang, ever.
* **UI:** Next.js on Vercel (reads Supabase) · **three.js "invisible shield" centerpiece** — a translucent protective dome around the person's home/possessions; the main visual flare, reacting to triage state without ever implying a safety verdict (see §10).
* **Self-verification tooling:** the build→verify→fix loop uses the **Vercel** integration (preview deploys, live-URL checks) and the **Chrome plugin** (drive the live UI, confirm states render, catch 404/empty/all-CONTEXT failures) as first-class verifiers — not just unit tests.
* **Stack:** Next.js + three.js on Vercel · Supabase Postgres · self-hosted Python Agent SDK harness · no managed always-on server.
* **Tracking:** open issues + big-picture state tracked in **OpenViking** (see project tooling); the rubric gates are the source of truth for "done."

## **Done = every HARD gate passes, re-verified in a fresh context**

1. Live URL returns a schema-valid dossier for a valid payload (§2).
2. Zero hazard claims lack a re-fetched, verified source citation (§3).
3. Triage ≥90% tier-match on the **holdout** golden set; **zero** acute hazards mis-tiered down (§4).
4. No ubiquitous/baseline hazard above CONTEXT without a stated condition — checked mechanically via `is_ubiquitous` (§5).
5. Same hazard + different context → documented, directionally-correct tier shift (§6).
6. No medical advice, no "safe" claim, no health-effect synthesis, no safe/all-clear visual; ranked action plan present; scan covers **all schema fields** (§7).
7. Every independent-source finding has categorical confidence + caveat + what-would-change-it; **≥1 independent finding exists in the golden set so this gate fires** (§7).
8. Runtime agent is turn-capped and falls back within a hard latency budget without hanging (§A).
9. **Robustness:** empty/malformed input, no-findings, all-CONTEXT, and source-down paths all return schema-valid, coherent, non-blank output (§9).
10. **Orchestration visibility:** the confidence pipeline emits a per-claim record showing distinct prosecutor/skeptic positions + adjudicator resolution (§10).
11. **Demo readiness (T-30min smoke check):** seeded basket yields ≥1 of each tier; every demo citation returns 200; cold-start latency under budget; empty-input path graceful (§E).
12. **Contextual discovery:** environmental/lifestyle context with no product naming the hazard yields ≥1 correct investigation hypothesis, pursued against a real source, resolving to a cited finding or a calm record statement — never a speculative alarm (§11).

## **Sources**

* **Core (build first):** CPSC recalls · CA Prop 65 (chemical list + 60-day notices) · EPA water violations by ZIP (incl. PFAS/UCMR detections + ECHO facility data, which power proximity-based discovery in §11).
* **Differentiator (act two):** independent-source confidence layer via Exa + scholarly APIs (OpenAlex / Semantic Scholar).
* **Stretch (stubs, shown as extensible):** FDA/USDA recalls, warning letters, settlement claims, radon/NOA.
* **Never:** photo input · healthy/unhealthy scoring · medical claims.

## **Dossier schema (per finding)**

`{item, tier: ACT|ADDRESS|AWARE|CONTEXT, hazard_type, severity_basis, action, condition?, confidence?, is_ubiquitous: bool, source:{name,url,locator}}`

A canonical example request + example dossier response are pinned in `fixtures/example_payload.json` and `fixtures/example_dossier.json` so "schema-valid" and "valid payload" are never a judgment call.

## **§2 Functional**

* Harness runs headless, fail-closed on permissions, with a spend cap; writes normalized findings + provenance to Supabase; re-runnable on a new source set/region by config alone.
* Session log shows the build→verify→fix loop and ≥1 self-caught failure.
* Live URL accepts `{items, context}`, returns schema-valid JSON matching `fixtures/example_dossier.json`'s shape on every call; acute items tier-stable on re-run.

## **§3 Provenance (anti-hallucination)**

* 100% of findings carry `source.url` + `source.locator`. **"Confirmed" is mechanical, not a soft LLM grade:** the cited URL returns 200 **and** the `hazard_type` + the item identifier appear in the fetched content at/near the locator. Verifier re-fetches each; unconfirmed → dropped to `rejected.json`. No claim exceeds what the source states.

## **§4 Triage — golden set (≥25 labeled cases)**

* Cases live in `fixtures/golden_dev.json` (builder tunes against this) and `fixtures/golden_holdout.json` (**verifier-only; never seen during tuning**). **Gate 3 runs on the holdout set** to defeat train-on-test leakage.
* Tier-match ≥90% on holdout. **Hard rule:** any active recall / qualifying settlement → ACT; one downward mis-tier = fail.
* **AI-labeled, leakage-proof construction:**
  * **ACT cases self-label from ground truth** — pull real recent CPSC recalls; an active recall *is* ACT by definition (no model judgment).
  * **CONTEXT/AWARE decoys** anchor on real Prop 65 entries and known regional baselines (radon, NOA).
  * Labels are produced by a **separate labeler agent in a fresh context**, NOT the runtime tiering logic, so the answer key is independent of the system under test.
  * A human spot-checks the conditional/ADDRESS cases (real judgment calls).
  * The verifier generates 3–5 **fresh** real-recall cases at verify time to test generalization, not memorization; triage logic must not hard-code golden item names or recall IDs (verifier scans for this).

## **§5 Calibration (the "naturally occurring asbestos" test)**

* Ubiquitous warnings ≤ CONTEXT. Regional baselines (NOA, radon) ≤ AWARE unless a stated context condition applies. Every ADDRESS finding has a specific `condition`.
* **Mechanical check via `is_ubiquitous`:** for any finding flagged `is_ubiquitous=true` (flag sourced from the maintained Prop 65 / baseline list), tier MUST be CONTEXT, or a tier above CONTEXT requires a non-null `condition`. ≥5 "should-not-alarm" decoys in the golden set, all landing AWARE/CONTEXT.

## **§6 Conditioning**

* Two fixtures, one shared hazard, different context → infant-in-home tiers higher, filtered-adult lower, each with reasons. **Directionally correct, not just different:** the infant/at-risk context must never *lower* a relevant hazard's tier relative to the lower-exposure context.
* Intake accepts **free-text, non-medical context** — exposure proxies and environmental/proximity signals (children, renovation/gardening, water source, region, proximity to airports/military bases/industrial sites/farmland) — used both to condition tiers AND to drive contextual discovery (§11). The intake schema itself is scanned — never collects pregnancy, diagnoses, conditions, or age-as-health-proxy.

## **§7 Compliance + Confidence**

**Compliance** (verifier scans **all user-facing text AND all schema fields** — including `severity_basis`, `action`, `caveat` — FAIL on any hit):
* no diagnosis/prognosis/medical advice
* no "safe"/"fine" assertion (absence reads "no current recall/action in public records as of \<date\>")
* no healthy/unhealthy score
* no health-effect synthesis from independent sources (presence + evidence strength only)
* no safe/all-clear visual semantics (no green-as-safe iconography; see safety-signaling stance)
* `action` must trace to a source/regulator instruction; Warden originates none
* settlement language: "a settlement exists; eligibility criteria per the claim site" — never "you qualify"
* ranked action plan is primary, not a feed · down-ranked real hazards stay visible
* the adversarial skeptic explicitly hunts **implied** causation (e.g. a chemical's presence rendered next to "Strong evidence" reading as harm), not only banned phrases

**Confidence layer** (independent sources): evidence hierarchy regulatory-confirmed > meta-analysis > single peer-reviewed > preprint > NGO > journalism > anecdote, grounded in real metadata (publication type, citations) where available. Adversarial: prosecutor + skeptic + adjudicator (fresh context). Output per claim `{confidence: Strong|Moderate|Preliminary|Contested, evidence_tier, replication_status, caveat, what_would_change_this}`. Categorical only — no numeric scores. **The golden set must contain ≥1 independent-source finding so this layer is actually exercised by the gates.**

## **§9 Robustness (no embarrassing live failure)**

* **Empty/malformed input:** `{items:[]}` and garbage item strings return schema-valid JSON, never a 500.
* **No-findings / item-not-found:** returns the neutral record statement — "Checked \[sources\] as of \<date\>; no active recall or public action on file" — never a blank array rendered as silence or an implied all-clear.
* **All-CONTEXT result:** UI shows "nothing actionable; N suppressed items available," not a blank plan.
* **Source down at run time:** any source returning non-200 / timing out degrades to precomputed-only, labels the coverage gap, and still returns valid JSON — never errors.

## **§10 Orchestration visibility + the shield**

* **Confidence pipeline is legible:** per independent claim, the stored record shows the distinct prosecutor position, the skeptic position, and the adjudicator's resolution (run in a fresh context). This makes the most expensive component testable and visible to judges — orchestration is demonstrated, not asserted.
* **three.js invisible shield:** the centerpiece visual reacts to triage state (e.g. shimmer/breach cues at ACT, calm at clean) **without ever implying a safety verdict** — it visualizes *what the public record currently says*, timestamped, consistent with the safety-signaling stance. Capped for performance; tested on a non-dev machine with a static fallback.

## **§11 Contextual discovery (hypothesis-driven investigation)**

Warden does not only match a product list — it reasons from non-medical environmental/lifestyle context to **generate its own investigation hypotheses** and pursue them. *"I live near an airport and a military base"* → Warden infers a known exposure pathway (AFFF firefighting foam → PFAS) and investigates the local water system's PFAS/UCMR data, even though the user never listed PFAS or a product.

**Hard constraints — discovery must never reintroduce the hallucination/over-alarm that §3 and §5 forbid:**
* A **hypothesis is a reasoning artifact, never a finding.** It earns a dossier slot only when a real source confirms it at a locator (§3). No hypothesis is ever rendered as a hazard claim.
* A hypothesis that finds nothing resolves to a **calm, timestamped record statement** ("Checked EPA PFAS data for your water system as of \<date\>; no detection on file") — never a speculative alarm, never ADDRESS/ACT.
* Discovery obeys the same tiering + calibration: real regional baseline → AWARE; ubiquitous → CONTEXT; only a confirmed, located, conditioned hazard rises to ADDRESS/ACT.
* The investigation is shown transparently — a **"what we checked and why"** trail (the inferred pathway + the source queried) — itself a trust + autonomy artifact, not a list of scares.
* Still presence + provenance only — the exposure pathway is an *investigative reason*, never a health-effect claim.

**Golden-set coverage:** ≥2 discovery cases where context (no product naming the hazard) must produce the correct hypothesis + resolution, including ≥1 where a *plausible* hypothesis correctly finds nothing and must land as a calm record statement, NOT an alarm.

## **§A Runtime budget + fallback**

* Runtime agent is turn-capped and returns within a hard latency budget (target **≤8s**) or returns a precomputed-only result. Verifier forces a timeout path and confirms it returns valid JSON, not an error. No hang, ever.

## **§E Demo (live crawl) + guardrails**

The demo crawls sources live for authenticity. That makes Gate 8 (no-hang/fallback) and citation freshness load-bearing. Guardrails:
* Aggressive caching in front of every source; Warden rate-limits its own calls.
* A **seeded demo basket** (guaranteed ≥1 of each tier) is one click away as the safe path; judges can still type their own items.
* Pre-warm the Vercel function before judging.
* **T-30min smoke check (Gate 11):** seeded basket produces ≥1 of each tier; every demo citation returns 200; cold-start latency under budget; empty-input path graceful.

## **§8 Stop condition + verifier brief**

* Builder may not declare done until a verifier agent, in a **fresh context**, runs every HARD gate above against the live URL + holdout golden set and returns PASS on all.
* Verifier: re-run everything yourself (don't trust the builder), re-fetch every cited source, enforce zero-downward-mis-tier, scan output **and all schema fields** for prohibited assertions, drive the live UI via the Chrome plugin to confirm the §9 robustness states render. Return `{gate, pass, evidence}`. Be adversarial — find why it's NOT done.

## **Maps to judging**

Impact → §4–§7 (prioritized, caveated, actionable). Demo → §2 + §5 decoys + §9 robustness states + §10 shield + no-hang fallback. Autonomy → §8 loop + self-caught failures in the log. Orchestration → done is machine-checkable here; the harness + this rubric are the judged artifacts; the confidence pipeline is made legible in §10; swap fixtures/sources to rerun.
