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
12. **Contextual discovery + open inference (§11):** context with no product naming the hazard yields ≥1 correct hypothesis → cited finding or calm record statement, never a speculative alarm. Every finding carries non-null `origin ∈ {user_listed, curated_pathway, ai_inferred}`; every `ai_inferred` finding re-passes BOTH layers — `discovery.grounding.url` re-fetches 200 with `source_tier ∈ {1,2}` (tier re-derived mechanically from the domain allowlist, **not** trusted from the judge) and `hazard_type`/`inferred_agent` + pathway source term at/near `discovery.grounding.locator`, **and** its own `source{}` passes §3. No `ai_inferred` finding at ADDRESS/ACT without a non-null `condition` (inherits §5). Every judge-rejected pathway is absent from all user-facing surfaces and present in `discovery_rejected.json` with a `reject_reason`. **Surface cap:** ≤3 top-level `ai_inferred` rows, each a §3-confirmed finding; grounded-but-empty pathways aggregate into one bottom-ranked coverage line. Holdout adds two distinct fixtures: a REAL pathway the judge must PASS to a cited finding, and a TEMPTING-BUT-UNGROUNDED pathway the judge must REJECT to `discovery_rejected.json`. Determinism is asserted **only** over the cached/precomputed seeded basket; live open-inference is non-deterministic, covered instead by a 5/5 stability-reject of the negative control. One downward mis-tier = fail.

## **Sources**

* **Core (build first):** CPSC recalls · CA Prop 65 (chemical list + 60-day notices) · EPA water violations by ZIP (incl. PFAS/UCMR detections + ECHO facility data, which power proximity-based discovery in §11).
* **Differentiator (act two):** independent-source confidence layer via Exa + scholarly APIs (OpenAlex / Semantic Scholar).
* **Stretch (stubs, shown as extensible):** FDA/USDA recalls, warning letters, settlement claims, radon/NOA.
* **Never:** photo input · healthy/unhealthy scoring · medical claims.

## **Dossier schema (per finding)**

**Finding** (`origin` REQUIRED, non-null, default `user_listed`): `{item, tier: ACT|ADDRESS|AWARE|CONTEXT, hazard_type, severity_basis, action, condition?, confidence?, is_ubiquitous: bool, source:{name,url,locator}, origin: "user_listed"|"curated_pathway"|"ai_inferred", discovery?}`

When `origin != "user_listed"`, `discovery` is REQUIRED — the **pathway-level receipt**, orthogonal to `source{}` (the finding-level §3 receipt): `discovery:{pathway_id, trigger_signal, pathway:{source_category, source_to_media_mechanism, environmental_media, point_of_exposure, exposure_route, receptor_population}, grounding:{source_name, url, locator, source_tier:1|2, matched_allowlist_entry, established_route_quote, evidence_hash}}`. An `ai_inferred` finding thus carries **two citations** (pathway + finding); both re-fetch 200 (Gate 12). `confidence`/`evidence_tier` (§7) is unchanged and **origin-blind**.

**Record statement** (a grounded-but-empty pathway — NOT a finding, so no `source{}`/`hazard_type`): `{kind:"record_statement", origin, discovery:{…grounding only…}, checked_sources[], as_of, statement}`. Renders only via the aggregated coverage line, never a top-level row.

**`discovery_rejected.json`** (pathway-layer analogue of `rejected.json`; §10/verifier-only, **never user-facing**): `{pathway_id, trigger_signal, pathway, reject_reason ∈ [no_source_found, only_tier3_4_support, linkage_unattested, equivocated_source, agent_mismatch, agent_unnormalizable, locator_mismatch, duplicate_of_curated, uncertain_or_flapping], judge_search_trace}`.

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
* **(open inference, §11)** the all-fields scan covers `discovery.pathway` (the 5-element route prose) and `discovery.grounding.established_route_quote`; the quote must come from the source's **fate-and-transport / exposure-pathway** section and assert ROUTE/RELEASE/TRANSPORT only — **Gate 6 FAILS the finding if it contains health-outcome tokens** (causes/cancer/toxic-to/harms/disease/dose-response). This is a mechanical sub-check, not merely a skeptic heuristic (ATSDR/IRIS route language often co-occurs with harm clauses).
* **(open inference, §11)** the neutral provenance chip copy is pinned **"Checked because of your context"** — it states WHY we looked, never answer reliability or discovery-of-danger; the skeptic FAILs on `found`/`extra`/`hidden`/`detected`/danger framing (these reintroduce the §5 cardinal sin via the discovery door)
* **(open inference, §11)** an `ai_inferred` `action` still traces to a regulator/source instruction — origin grants no authority to originate advice; `discovery_rejected.json` is never rendered (rejected-pathway specifics, incl. `inferred_agent` names + route prose, live only in the §10 verifier view)

**Confidence layer** (independent sources): evidence hierarchy regulatory-confirmed > meta-analysis > single peer-reviewed > preprint > NGO > journalism > anecdote, grounded in real metadata (publication type, citations) where available. Adversarial: prosecutor + skeptic + adjudicator (fresh context). Output per claim `{confidence: Strong|Moderate|Preliminary|Contested, evidence_tier, replication_status, caveat, what_would_change_this}`. Categorical only — no numeric scores. **The golden set must contain ≥1 independent-source finding so this layer is actually exercised by the gates.**

## **§9 Robustness (no embarrassing live failure)**

* **Empty/malformed input:** `{items:[]}` and garbage item strings return schema-valid JSON, never a 500.
* **No-findings / item-not-found:** returns the neutral record statement — "Checked \[sources\] as of \<date\>; no active recall or public action on file" — never a blank array rendered as silence or an implied all-clear.
* **All-CONTEXT result:** UI shows "nothing actionable; N suppressed items available," not a blank plan.
* **Source down at run time:** any source returning non-200 / timing out degrades to precomputed-only, labels the coverage gap, and still returns valid JSON — never errors.

## **§10 Orchestration visibility + the shield**

* **Confidence pipeline is legible:** per independent claim, the stored record shows the distinct prosecutor position, the skeptic position, and the adjudicator's resolution (run in a fresh context). This makes the most expensive component testable and visible to judges — orchestration is demonstrated, not asserted.
* **Pathway judge is legible (§11):** per judged open-inference pathway, the record stores the candidate, the prosecutor/skeptic/adjudicator positions, per-element citations + the `(url→assigned_tier, matched_allowlist_entry)` decision + weakest-link tier + the pinned `evidence_hash`, and the verdict — so a verifier re-derives the tier mechanically and re-checks the **same** evidence the judge saw. `discovery_rejected.json` lives here, never in a user surface.
* **three.js invisible shield:** the centerpiece visual reacts to triage state (e.g. shimmer/breach cues at ACT, calm at clean) **without ever implying a safety verdict** — it visualizes *what the public record currently says*, timestamped, consistent with the safety-signaling stance. **Reacts to tier only, origin-blind** — an `ai_inferred` finding never adds a distinct shield cue (tier is the sole severity signal at the centerpiece too). Capped for performance; tested on a non-dev machine with a static fallback.

## **§11 Contextual discovery (hypothesis-driven investigation)**

Warden does not only match a product list — it reasons from non-medical environmental/lifestyle context to **generate its own investigation hypotheses** and pursue them. *"I live near an airport and a military base"* → Warden infers a known exposure pathway (AFFF firefighting foam → PFAS) and investigates the local water system's PFAS/UCMR data, even though the user never listed PFAS or a product. A **curated pathway library** encodes the highest-precision of these inferences as a fast path; **beyond it, an open inference pass proposes further candidate pathways with no library ceiling, each gated by a search-grounded default-reject judge** before it can cost an investigation turn (see *Open-ended pathway inference* below).

**Hard constraints — discovery must never reintroduce the hallucination/over-alarm that §3 and §5 forbid:**
* A **hypothesis is a reasoning artifact, never a finding.** It earns a dossier slot only when a real source confirms it at a locator (§3). No hypothesis is ever rendered as a hazard claim.
* A hypothesis that finds nothing resolves to a **calm, timestamped record statement** ("Checked EPA PFAS data for your water system as of \<date\>; no detection on file") — never a speculative alarm, never ADDRESS/ACT.
* Discovery obeys the same tiering + calibration: real regional baseline → AWARE; ubiquitous → CONTEXT; only a confirmed, located, conditioned hazard rises to ADDRESS/ACT.
* The investigation is shown transparently — a **"what we checked and why"** trail (the inferred pathway + the source queried) — itself a trust + autonomy artifact, not a list of scares.
* Still presence + provenance only — the exposure pathway is an *investigative reason*, never a health-effect claim.

**Golden-set coverage (three distinct failure modes, holdout):** (1) a **real** inferred pathway the judge must PASS to a §3-cited finding — e.g. *former air-base + private well* → AFFF/PFAS → SDWIS/UCMR, where `inferred_agent` normalizes as the PFAS **class** id (proving the class/mixture normalization rule — a single-CASRN-only gate would wrongly drop this flagship case); (2) a **tempting-but-ungrounded** pathway the judge must REJECT to `discovery_rejected.json` — e.g. *new memory-foam mattress → flame retardant → drinking water*: element-wise plausible, but no Tier-1/2 document links the source to a waterborne medium → `linkage_unattested` (the granite→arsenic chain is **not** a valid negative control — granitic bedrock is a real Tier-1 arsenic→groundwater→well source); (3) a **grounded-but-empty** pathway resolving to a calm aggregated record statement, never an alarm. The reject case proves the default-reject judge rejects under temptation rather than rubber-stamping. All negative controls require re-validation against the source hierarchy each release.

### Open-ended pathway inference (high-recall extension; gated by a search-grounded judge)

The curated pathway library above is the **high-precision fast path** and is unchanged — and **low-recall by construction** (it only fires on pre-enumerated pathways). The "Warden found something I'd never have known to ask about" moment lives in pathways *no list anticipated*. So §11 widens: from the user's free-text context + item set, an inference pass **freely proposes candidate exposure pathways with no library ceiling** — and a **search-grounded, default-reject judge** kills every one it cannot mechanically prove is a real, established route before it costs one investigation turn. **Two gates in series: pathway-is-real (judge, search-grounded) → finding-is-real (§3, mechanical).** Open inference changes *what* gets investigated, never the bar for *what becomes a claim*; it feeds the **same** judge and **same** §3 verifier the curated library feeds.

**Pipeline: INFER → GROUND → SCAN → LABEL.**

* **INFER (wide, cost-bounded; separate context from the judge).** Curated library is consulted **first**; a curated hit short-circuits to investigation stamped `origin="curated_pathway"` and **never enters the judge**. For everything else the model associates freely from *every* context signal but **cannot emit a bare hazard name**: each candidate is a structured **ATSDR completed-exposure-pathway** object — `source_category` → `source_to_media_mechanism` → `environmental_media` → `point_of_exposure` → `exposure_route` → `receptor_population` — plus `trigger_signal` (verbatim intake span), `proposed_source_to_query`, `inferred_agent`, and `inference_rationale`. `inferred_agent` **must resolve to a registered identifier in a named registry — a single-substance CASRN OR a class/group id** (ATSDR ToxProfile id, EPA contaminant-group id, PubChem class) so mixtures/classes (PFAS, AFFF, creosote, diesel exhaust) are admissible — else the candidate is dropped. **The 5-slot decomposition is a STRUCTURING device, not a filter** — a fluent model fills all five slots effortlessly with individually-true components; element-wise grounding is necessary-but-grossly-insufficient and the actual gate is the **linkage** check below. Bounded for §A: hard **cap of N=8** candidates after curated reservations; pre-judge **drop** of any candidate naming no registered queryable Warden source, restating a listed product, or duplicating a curated entry; self-ranked by trigger-signal directness (verbatim span > loose proxy). Plausibility floor is **intentionally low** — the judge, not inference, is the gate.

* **GROUND (the gate; default-reject; search-backed; adversarial; fresh context).** Each surviving candidate goes to the **§7 prosecutor/skeptic/adjudicator** structure (not a single confirm pass), asking **only** *"is this proposed pathway a real, established exposure route in the authoritative record?"* — **never** "is this user exposed" (that is §3). The judge receives **only** `trigger_signal` + the pathway STRUCTURE; `inference_rationale` and `inferred_agent` are **WITHHELD** — the judge **independently re-derives the agent** from sources, and if its agent ≠ the inferrer's it **REJECTs as `agent_mismatch`** (a fresh context window without withholding is cosmetic). It **must run ≥1 search (incl. a SKEPTIC negative query, e.g. "is X a documented source of Y in Z" / "X NOT a source of Y") and fetch ≥1 source.** PASS is **mechanical, never a prose grade** (mirrors §3) and requires ALL of:
  * **Tier is mechanical, not inferred.** Source tier is assigned by a hardcoded **eTLD+1 domain allowlist**: Tier-1 = `atsdr.cdc.gov`, `*.epa.gov` (IRIS/Envirofacts/ECHO/SDWIS/UCMR/TRI), `usgs.gov`, `niosh`/`osha.gov` (`cdc.gov`/`dol.gov`), `pubchem.ncbi.nlm.nih.gov`; Tier-2 = an explicit enumerated set of `oehha.ca.gov` + `*.state.*.us` env/health endpoints. **A domain not on the allowlist is Tier-3/4 by default and the judge cannot promote it by prose.** Tier-3 (NGO incl. EWG/advocacy orgs with federal-sounding names, journalism, preprint) = **corroborating only, never sufficient**; Tier-4 (blogs/SEO/affiliate/litigation-marketing) = **never admissible**. The `(url → assigned_tier)` decision + matched allowlist entry is stored (§10) so a verifier re-derives the tier mechanically.
  * **"Established" route, not "evidenced" route.** A route counts as established **only** via a regulatory/agency **route statement** (ATSDR ToxProfile/PHA fate-and-transport or exposure-pathway section, EPA IRIS/fact sheet, ECHO–SDWA record). A single peer-reviewed primary study **never** establishes a route (§7's hierarchy grades evidence STRENGTH on an *already-established* route, not route reality) — this closes the journal-laundered-fringe-chain hole.
  * **String-mechanical linkage (the real gate).** A **single Tier-1/2 source** must attest the WHOLE chain in one document: `established_route_quote` is a span where the `source_category` term AND the `environmental_media` term co-occur within N characters joined by a transport verb-class from a fixed list (leaches/migrates/released-to/contaminates/discharged-to). Five documents each covering one element does NOT satisfy it → `linkage_unattested`.
  * **Anti-equivocation (physical continuity).** The quote must name the `trigger_signal`'s actual **object class** co-located with the medium — grounding a homonym/different physical form is **REJECT as `equivocated_source`** (e.g. granite *countertop* ≠ granitic *bedrock*; the finished installed object must be the releaser, not a co-named geologic matrix).
  * URL returns **200** and the `hazard_type`/`inferred_agent` + pathway source term appear at/near the `locator`.
  
  `grounding.source_tier` records the **weakest** element's tier. **DEFAULT-REJECT:** any UNCERTAIN, unreachable source, missing element, Tier-3/4-only support, `linkage_unattested`, `equivocated_source`, `agent_mismatch`, or duplicate-of-curated → **REJECTED → `discovery_rejected.json`** (the §3 `rejected.json` analogue at the pathway layer) with `reject_reason` + `judge_search_trace`. A rejected pathway spawns **no** scan item, reaches **no** dossier, surfaces **no** alarm — it vanishes exactly like a §3 unconfirmed finding. The judge pins its evidence: the fetched bytes + hash are stored in the §10 record so a verifier re-checks the SAME evidence the judge saw. **Grounding earns the right to investigate, never to alarm.**

* **SCAN (unchanged, shared).** Only GROUNDED pathways (curated or judge-passed) spawn scan items against `proposed_source_to_query`. From here it is **identical** to the curated path and product-list matching: §3 re-fetches `source{}`, requires `hazard_type` + identifier at/near `locator`, else drops to `rejected.json`. A grounded-but-empty pathway resolves to the **calm timestamped record statement** above — never an alarm, never ADDRESS/ACT. **§5 is inherited and origin-blind:** every `ai_inferred` finding runs the `is_ubiquitous` / regional-baseline check identically and may **NOT** sit above AWARE without a non-null person-specific `condition` from intake (a grounded regional water detection with no drink-unfiltered-tap condition lands AWARE, not ADDRESS).

* **LABEL (provenance-of-origin, neutral; surface-capped).** Two axes, **never collapsed**: **ORIGIN** (where the *question* came from) and **CONFIRMATION** (the existing §3 `source{}` + §7 confidence, **identical regardless of origin**). An `ai_inferred` finding carries **two receipts**: `discovery.grounding` (judge's proof the *pathway* is real) shown **alongside** the finding's own `source{}` (§3 proof the *finding* is real), labeled as two different receipts — *"why we looked"* vs *"what we found"*. The dossier shows a **neutral provenance chip**, copy pinned as **"Checked because of your context"** (NOT "AI-inferred from your context" — `origin=ai_inferred` stays machine-readable but the displayed string describes WHY-we-looked, never discovery-of-danger; the chip must not contain "found"/"extra"/"hidden"/"detected"/danger framing and is scanned by the §7 skeptic like any surface string). Same neutral/slate styling as the source-name chip, **never alarm-colored; tier color is the sole severity signal** — including at the §10 shield, which reacts to **tier only, origin-blind** (`ai_inferred` origin never adds a distinct shield cue). **Surface cap (calibration, not just latency):** investigate up to N=8, **surface at most M=3** top-level `ai_inferred` rows, all of which must be §3-confirmed findings; **grounded-but-empty `ai_inferred` pathways NEVER each get a top-level row — they collapse into ONE aggregated, bottom-ranked §9-style coverage line** ("Also checked, from your context: \<N\> environmental pathways as of \<date\> — no public record on file", expandable), ranked strictly below every `user_listed`/`curated` row and every AWARE+ finding. Expanding a surfaced finding reveals the "what we checked and why" trail: *checked because you said "\<trigger_signal\>" → \<5-element pathway in plain language\> → pathway grounded in \<source_name\> [Tier \<n\>] (link) → then checked \<live source\> as of \<date\>: \<finding\>.* There is **no** user-facing "considered & discarded" panel — `discovery_rejected.json` is **§10/verifier-only** (rendering rejected hazard chains in the user's home context is the §5 cardinal sin via the discovery door).

**Relationship to the curated library:** complementary, not replacement — **one schema, one judge, one investigation engine, one §3 verifier**; only the *source* of the pathway differs (what `origin` records). Curated stays the pre-vetted fast path (skips the search judge → zero extra latency, deterministic basket). Two feedback loops, both human-gated: (1) an `ai_inferred` pathway that repeatedly grounds **and** yields §3-confirmed findings is a **promotion candidate** into the curated library **only on independent-labeler/human sign-off** (mirroring §4's fresh-context labeler) — never auto-promoted from repeated judge passes; promoted entries are periodically **re-judged**, not trusted in perpetuity. (2) An **immutable, human-curated SEED set** (never judge-promoted) is the **regression oracle**: every seed pathway SHOULD pass the judge, so a rejected known-real seed flags judge mis-tuning — the oracle's ground truth is independent of the judge's own prior outputs.

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
