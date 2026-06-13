# Warden — UX Rework Spec

> **Design-only.** This is the brief a frontend coder executes. It does not touch code.
> **Source of truth for "done":** `rubric.md`. Where this spec and the rubric ever disagree, the rubric wins.
> **Status:** reworks the established UI (`app/page.tsx`, `components/InvisibleShield.tsx`, `app/globals.css`) into a four-act experience: **Enroll → Scan → Dossier → Initiatives**. Reuses the existing visual language wholesale; adds three net-new surfaces (enrollment flow, live scan log, initiatives section) and restyles the existing dossier into the new layout.

---

## 0. The one idea everything serves

Warden helps you **be aware of the things around you that affect your health — and act on them.** That's the whole promise, in plain words. You tell it where you live and what you own; it does the checking you'd never do yourself; it hands back a short, ranked list of what's worth knowing and what to do about it.

Behind that warm promise sits a strict discipline. **The spec runs in two registers, and they must never blur:**

- **The WELCOME register (top-level value prop, hero, enrollment, empty states).** Warm, human, benefit-led. Golden-circle order: **WHY** (be aware of what affects your health) → **HOW** (Warden checks the records for you) → **WHAT** (a short ranked list with next steps). Short. Inviting. Normal-person language. **No manifesto, no "public record," no "we never render a verdict," no meta-explanation of how Warden reasons.** This is where the user decides to trust it.
- **The RECORD register (every finding card, every receipt, every record statement).** Reporter, not advisor. **No "safe/unsafe" verdict, no health-effect synthesis, no diagnosis.** Each finding states a fact, quotes the source's own instruction for the action, and stamps when it was checked. This is where Warden stays honest and compliant (rubric §7).

**The bright line:** "things that affect your health" is a *reason to be aware* at the top of the funnel — it is **never** an assertion that any one item *is* harming you. A welcome headline can say "know what affects your health near you"; a finding card can **only** say "this product was recalled by CPSC; the recall says stop use," with a timestamp and a link. Inviting up top; factual in the findings.

Three mechanics are non-negotiable and govern every pixel (these are the *how*, kept out of the user's face):

1. **Findings report a fact + its source, never a verdict.** No "safe", no "fine", no "healthy," no green.
2. **Absence is neutral, never reassuring.** A clean result is a calm, dated record statement ("Checked CPSC, Prop 65, EPA on <date> — nothing on file"), never a blank screen and never an all-clear. **Calm = quiet-but-present**, not "you're good."
3. **Tier color is the sole severity signal.** Everywhere — cards, counts, the particle field, the scan log. Origin (user-listed vs AI-inferred) is *never* a severity signal and never recolors anything.

The whole design is built to resist the two traps called out at the end of this doc: **the all-clear-by-vibe trap** and **flooding the user with initiatives**.

---

## 1. Visual language (reuse, do not reinvent)

Everything here already exists in `app/globals.css` / `app/layout.tsx`. **Reuse the tokens; do not introduce new colors, new fonts, or alarm-colored surfaces.**

**Type**
- **Display** — Fraunces (`--font-display`). Expressive optical serif. Headlines, hazard names, big questions, counts.
- **Body** — Newsreader (`--font-body`). Warm humanist serif/italic. Prose, severity basis, conditions, helper text.
- **Mono** — IBM Plex Mono (`--font-mono`). **The "receipt" voice.** Citations, locators, `as_of` dates, tier labels, chips, scan-log lines, section eyebrows. If it is provenance or machinery, it is mono.

**Color (`:root` tokens — do not add to these)**
- Paper `#ffffff` · Ink `#1c1b18` · Ink-soft `#5a564e` · Ink-faint `#8b867b` · hairline rules.
- Tier accents (sole severity signal): ACT `#c8362b` red · ADDRESS `#b8791a` amber · AWARE `#3c6e91` steel-blue · CONTEXT/NONE `#6e6a60` slate-taupe.
- **No green anywhere. No new accent for "AI-inferred" — the origin chip is neutral slate (`.neutral-chip`).**

**Texture & depth**
- Faint paper grain (`body::before`) stays. Cards are near-white `.paper-card` with a **left edge-bar in the tier accent** (3px; 6px for the loud lead card) and a hairline border. Severity loudness comes from **size / weight / position / left-bar width**, never a colored fill.
- **The particle dome** (`InvisibleShield`) is the atmospheric centerpiece: a spherical shell of discrete specks, radially masked at the edges so margins stay paper-white. It reacts to **tier only** (origin-blind): IDLE/NONE slate & quiet → AWARE steel-blue, tighter → ADDRESS amber, denser/agitated → ACT red, dense + breach pulse. Static fallback for reduced-motion / no-WebGL is already built.

**Motion**
- Staggered reveal on results (`.reveal`, `animation-delay` per row) stays — it is the "one orchestrated page-load" moment.
- New motion is added only at the **scan** (per-step append) and **enrollment** (question advance). Honest motion only: scan steps animate when *real* events land, never on a timer (rubric §12: "no fabricated delays").

**Masthead** (keep structure, change words): `Warden` (Fraunces) · a short warm tagline in the mono eyebrow — **`know what's around you`** (NOT "the public record, audited" — drop the meta framing). `№ 001` top-right stays as a quiet archival flourish.

### 1.1 Legibility — text lives in containers, the field stays behind (hard requirement)

The particle field is **atmosphere, never a substrate for text.** In the current build, copy sits directly on the gray field and gets visually lost. **Fix, applied everywhere:**

- **All copy lives in a panel with a solid or near-solid backing.** Body text, questions, findings, scan log, ledger — every readable string sits inside a `.paper-card`-style container (white/near-white fill, hairline border) or on a guaranteed paper-white band. **No paragraph, label, or input ever floats directly on the particle field.**
- **Two zones, deliberately:**
  - **FRAMED zones** (panels, cards, the scan log, the request slip, the dossier column): solid white fill `#ffffff` or `rgba(255,255,255,0.96)` with the existing soft shadow + hairline. The field is **masked out / sits fully behind** these — they read as paper laid on top of the atmosphere. Contrast is full; text is never compromised.
  - **ATMOSPHERE zones** (margins, the area immediately around the dome, the gutter behind a centered panel): the field shows through here, masked at the edges as today. This is where the dome lives and breathes.
- **The dome composition becomes panel-aware.** Instead of text overlapping the densest part of the field, the field is centered/offset so its bright core sits in negative space *beside or behind* the panels, not under the words. Where a panel must overlap the field (e.g. the scan, where dome + log share the screen), give the panel an opaque fill and let the field surround it — the field peeks at the panel's edges, never through its text.
- **Inputs** (ZIP field, textarea) get a solid white fill (not the current translucent `bg-white/70` that lets grain through) so typed text is crisp.
- **Contrast floor:** body text is `--ink` / `--ink-soft` on white — already AA+. The rule is simply: *if there are words, there is a solid panel under them.* The field's job is depth and reaction, never to be read through.

Net effect: the white-paper-on-atmosphere aesthetic is preserved and arguably strengthened (paper now reads as physically *on top of* the field), and copy is always crisp.

---

## 2. End-to-end flow

```
            ┌─────────────────────────────────────────────────────────────────┐
            │  ACT 1 — ENROLL          one question at a time, parsed live      │
            │  ┌──────────┐  ┌──────────────┐  ┌──────────────────────────┐    │
            │  │ Q1 WHERE │→ │ Q2 NEARBY?   │→ │ Q3 WHAT DO YOU OWN (free) │    │
            │  │  (ZIP)   │  │ (chip multi) │  │  parsed → item pills      │    │
            │  └──────────┘  └──────────────┘  └──────────────────────────┘    │
            │                          ↓                                         │
            │             CONFIRM SLIP  "Here's what I'll check"                 │
            │             (parsed items + location + context, all editable)      │
            └───────────────────────────────┬─────────────────────────────────┘
                                             │  Run audit
                                             ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │  ACT 2 — LIVE SCAN  (the money shot, §12)                         │
            │  scan log streams REAL per-source steps · dome reacts as          │
            │  findings land · "Checked because of your context" steps marked   │
            └───────────────────────────────┬─────────────────────────────────┘
                                             │  terminal dossier event
                                             ▼
            ┌─────────────────────────────────────────────────────────────────┐
            │  ACT 3 — DOSSIER     ranked record · ACT→ADDRESS→AWARE            │
            │  counts ledger · lead card · receipts · CONTEXT suppressed        │
            ├─────────────────────────────────────────────────────────────────┤
            │  ACT 4 — INITIATIVES (§11)  "Checked because of your context"     │
            │  ≤3 surfaced ai_inferred findings (interleaved by tier) +         │
            │  ONE calm aggregated "also checked, nothing on file" line         │
            └─────────────────────────────────────────────────────────────────┘
                              (scan stays available, collapsed)
```

Acts 3 and 4 live on **one scrolling record**, not separate pages — initiatives are part of the same dossier, ranked into it (see §6 for exact placement). The scan log collapses to a one-line "view the scan" affordance once the dossier lands.

**Routing:** single page, state-machine driven — `phase: "enroll" | "scanning" | "dossier"`. No hard navigation; transitions are in-place so the particle dome is continuous from enroll → scan → dossier (it is the spine of the whole experience).

---

## 3. ACT 1 — Snappy enrollment

### 3.0 The hero / value prop (WELCOME register — golden circle)

Before the first question, a brief warm hero inside a paper panel (centered, field behind it). Golden-circle order, condensed — this is the only place the *why* is spelled out, and it's three short lines, not a manifesto:

```
┌─ paper panel, field behind ────────────────────────────────┐
│                                                             │
│   Know what's around you.                  ← Fraunces, big  │
│                                                             │
│   The things you own and the place you live   ← Newsreader, │
│   can carry recalls, warnings, and water          one short │
│   issues most people never hear about.            paragraph │
│   Warden checks them for you — and tells                    │
│   you what's worth knowing, and what to do.                 │
│                                                             │
│              [ Start → ]      see a sample                  │
└─────────────────────────────────────────────────────────────┘
```

- WHY = *"Know what's around you" / things can carry issues you never hear about.* HOW = *"Warden checks them for you."* WHAT = *"what's worth knowing, and what to do."* Three beats, plain language, benefit-led. **No "public record," no "verdict," no method-explainer.**
- `Start →` opens Q1; `see a sample` loads the demo basket straight to its dossier (the safe demo path, rubric §E).

### 3.1 The feel

Not a form. **A short interview, one question at a time, that parses as you go.** Three questions, smart defaults, instant LLM parsing feedback, and a confirm slip at the end. The user should feel *asked a few quick things*, not handed a government intake. Target: under ~30 seconds to a runnable audit; **the sample/demo basket is always one click away** as the safe path (rubric §E). Every question lives in its own paper panel — the field is behind, never under the words (§1.1).

Principles:
- **One question on screen at a time.** The others are present as faint, completed/upcoming ticks in a left rail so the user always knows where they are and that it's short.
- **Every question is skippable** except none are *required* — Warden runs on whatever it's given (an empty audit still returns a §9 record statement). "Skip" advances; it never blocks.
- **Parsing is shown, not hidden.** When the user types "a peloton, two space heaters, kids' bunk bed," they watch it resolve into discrete item pills. This is the first proof that something intelligent is on the other end.
- **The dome is already alive** behind the questions at IDLE (quiet slate). Enrollment happens *inside* the coverage field — you're already in the reading room.

### 3.2 The three questions

**Q1 — "Where do you live?"** (location + region for EPA/water + §11 grounding)
- Single input: ZIP (5 digits) — the only structured field in the whole app. Optional free-text region hint ("Flint, MI" / "rural Vermont") accepted and parsed.
- Inline validation: 5 digits → a mono confirmation appears (`ZIP 48503 · Genesee County, MI` once resolved; if not resolvable yet, just echo the ZIP). Never blocks on resolution.
- Microcopy under the field: *"So Warden can check your water and what's nearby. Never shared."*

**Q2 — "Anything nearby?"** (proximity signals → drives §11 contextual discovery)
- A row of **multi-select chips** (neutral slate, NOT tier-colored — these are inputs, not findings):
  `near an airport` · `military base` · `farmland` · `industrial site` · `older home (pre-1978)` · `well water` · `recent renovation`
- Tapping toggles selected/unselected (filled slate vs hairline outline). Plus a free-text "something else…" that the LLM folds into context.
- This is the screen that *earns* the §11 "Warden checked something I'd never have known to ask about" moment — so the microcopy primes it without promising scares: *"Lets Warden check things you'd never think to look up — like what's in the water near an airport."*
- **Compliance note for copy:** never frame these as risks. They are *places we'll look*, not *dangers you have*. Keep it WELCOME-register-warm, not a risk checklist.

**Q3 — "What do you own?"** (free text → LLM-parsed item list)
- A generous textarea, natural language welcome: *"a peloton, a couple space heaters, my kid's inclined sleeper, the usual extension cords."*
- **Live parse feedback (the hero micro-interaction):** as the user pauses (debounced ~600ms) or hits "parse," Sonnet returns structured items and they materialize as **item pills** below the textarea, each removable (×). A faint mono line: `parsed 5 items` with a subtle re-parse affordance. Pills are editable on click. The textarea remains the source of truth; pills are the parsed view.
- Demo basket button sits here too: **"Use demo basket"** fills the textarea with the seeded basket and parses it instantly.

### 3.3 The confirm slip (parsed result, confirmed back)

After Q3, the three answers collapse into **one "request slip"** — the thing the user hands the clerk. This is where the LLM's parse is confirmed back, editable, before any audit runs. It reads like a filled-in intake form on the record's letterhead.

```
┌─ THE REQUEST ──────────────────────────────────── № 001 ─┐
│                                                            │
│  WHERE          ZIP 48503 · Genesee County, MI      [edit] │
│  NEARBY         farmland · well water · older home  [edit] │
│                                                            │
│  WHAT YOU OWN                                       [edit] │
│   ┌─────────────────────┐ ┌──────────────────┐            │
│   │ Peloton Tread+      │ │ portable space ×2│            │
│   └─────────────────────┘ └──────────────────┘            │
│   ┌──────────────────────────┐ ┌───────────────┐          │
│   │ baby inclined sleeper    │ │ extension cords│          │
│   └──────────────────────────┘ └───────────────┘          │
│                                                            │
│  Warden will check each of these for recalls, warnings,   │
│  and water and environmental issues near you — and show   │
│  you what's worth knowing, as of today.                   │
│                                                            │
│             [ RUN AUDIT → ]      use demo basket            │
└────────────────────────────────────────────────────────────┘
```

- Each section editable inline (clicking `[edit]` re-opens that question in place).
- The body line is the **WELCOME-register promise** — warm and benefit-led ("show you what's worth knowing"), but still honest: never "find dangers" / "keep you safe" / a health claim. (The findings themselves stay in the RECORD register — see §0.)
- `RUN AUDIT` is the dark pill (existing button style). This is the single moment of commitment; it transitions the dome from IDLE and starts the stream.

### 3.4 Enrollment states

- **Empty / first load:** the hero panel (§3.0) over the quiet IDLE dome, masthead present. `Start →` reveals Q1.
- **Parsing (Q3):** the `parsed N items` line shows a `.warden-pulse-dot` while Sonnet works; pills fade in via `.reveal` as they resolve. If parse fails, fall back gracefully to "one item per line" splitting (the current behavior) — never block the user.
- **Skipped questions:** confirm slip shows `— not provided —` in ink-faint mono for any skipped section. Warden runs anyway.

---

## 4. ACT 2 — The live agentic scan (the money shot, §12)

This is the demo's most important 8 seconds. The runtime **streams real per-source step events** (`{seq, phase, source, item?, status, detail, tier?}`) and the UI renders them as a **live scan log** while the **dome reacts as findings land**, then the dossier replaces the log. **No fabricated delays; the clean/empty path streams too.**

### 4.1 Layout (split, dome-led)

The dome moves to **center stage** (it gets bigger than at idle) and the scan log streams in a column to its left. The page is "watching the clerk work in the stacks."

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Warden   know what's around you                                  № 001    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  CHECKING…                                   ·  ·     ·   ·                │
│  ─────────                                  ·    ·  ·· · ·   ·              │
│                                          ·  · ··:·:· ·· ·  ·  ·            │
│  CPSC · Peloton Tread+                  · ·:· ·:: ·· :· : · ·· ·           │
│    → 1 recall  → ACT  ████ [done]      ·· · ·· ·:·:·· ·· :· · ·            │
│                                         ·  ·· : ·· ·:·· · ·· ·  ·          │
│  CPSC · space heater                     · · ·· ·· : ·· · ·· ·             │
│    → 6 recalls → ACT  ████ [done]         ·  ·· ·· · · ·· ·  ·             │
│                                              ·  ·   ·  ·   ·               │
│  EPA · water system, ZIP 48503                  (dome reacts to TOP tier   │
│    → FLINT, CITY OF → 1 SDWA           ░░░     as each finding lands —      │
│    violation → ADDRESS  ███ [done]              red here because ACT)       │
│                                                                            │
│  ✶ Checked because of your context                                         │
│    well water + farmland → EPA PFAS/UCMR                                   │
│    → checking SDWIS…  ▓▓▓░ [in progress]                                   │
│                                                                            │
│  Prop 65 · extension cords                                                 │
│    → 19 notices → CONTEXT (suppressed)  ███ [done]                         │
│                                                                            │
│  ▌ streaming · 4 of 6 sources · 3.1s                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Scan-log row anatomy

Each step event renders one mono row (receipt voice). The row's **status drives its state**, the event's **tier drives the only color**:

```
[source · item]                              ← mono, ink-soft.  e.g. "CPSC · space heater"
  → [detail]  [tier-tick] [status]           ← detail mono ink; tier-tick = a SMALL square
                                                in the tier accent (sole color); status word.
```

- **status = `started`** → row appears, a thin indeterminate scan bar pulses (reuse `.warden-scan-bar`), no tier yet.
- **status = `done`** with a `tier` → bar fills solid, a **tier-tick** (a small filled square in the tier accent) appears, detail text settles. ACT/ADDRESS/AWARE ticks are red/amber/steel; CONTEXT tick is slate and the row dims slightly (`text-ink-faint`) with `(suppressed)`.
- **status = `empty`** → "→ nothing on file" in ink-faint, a hollow slate tick. **This is not styled as relief** — it's just a quiet completed line. (Anti-all-clear.)
- **status = `error`** → "→ source unavailable — using cached record" in ink-soft, no alarm color. Degrades, never breaks (rubric §9 source-down).

### 4.3 The §11 steps in the scan (declared as such, live)

Context-driven source checks appear in the same log, **prefixed with a small `✶` glyph and the pinned phrase "Checked because of your context"** — the same neutral declaration used in the dossier, so the AI-inference is honest from the first instant it appears, not retrofitted later.

```
  ✶ Checked because of your context
    well water + farmland → EPA PFAS/UCMR for your water system
    → checking SDWIS…
```

- The `✶` and the chip text are **neutral slate**, never tier-colored. The phrase must **never** contain `found` / `extra` / `hidden` / `detected` / danger framing (rubric §7 skeptic scan) — it states *why we looked*, full stop.
- **Rejected pathways never appear here.** Only grounded (curated or judge-passed) pathways spawn a visible scan step. `discovery_rejected.json` is verifier-only; nothing about it touches this log.
- A grounded-but-empty §11 step resolves to `→ nothing on file` (quiet, slate) and later collapses into the single aggregated initiatives line (§6.4) — it does *not* get its own dossier row.

### 4.4 Dome reaction during scan

- The dome reads the **running top tier** across landed findings and eases toward that tier's config as each event arrives. So the field visibly tightens and warms from slate → (steel/amber) → red as worse findings land. This is the visceral payload of the money shot.
- **Origin-blind:** an `ai_inferred` finding landing at ADDRESS pushes the dome exactly like a `user_listed` ADDRESS would. No special cue for AI-inferred at the centerpiece (rubric §10).
- The breach pulse (ACT) is the climax — it fires the moment the first ACT finding lands.

### 4.5 Scan states

- **Streaming:** rows append as events arrive; footer ticker `▌ streaming · N of M sources · {elapsed}s`.
- **Clean / empty path (critical — must stream, never blank):** rows still stream (`→ nothing on file`), the dome stays quiet slate, and the terminal event yields a dossier of record statements. Footer settles to `checked {sources} · nothing on file as of {date}`. **Never a blank wait, never an all-clear.** (rubric §12 + §9.)
- **Source-down:** the affected row shows the degrade message; the run completes on cached/precomputed data and labels the coverage gap in the dossier. **No error screen unless the whole service is unreachable.**
- **Fallback / budget exceeded (§A):** if streaming can't start or stalls, fall back to a single-shot loading state (the existing three-scan-bar loader, with its label changed from "Checking the public record…" to plain **`Checking…`**) and then the dossier. No hang, ever.
- **Hard error (service unreachable):** the existing error card ("Warden can't reach the record right now," with Try again and the list preserved). Reuse as-is.

### 4.6 Transition to dossier

On the terminal `{type:"dossier"}` event, the scan log **collapses upward** into a single mono line — `✓ scan complete · 6 sources · 4.2s — view` (a `<details>` the user can re-open) — and the ranked dossier reveals below with the existing staggered `.reveal`. The dome settles to the final top tier and holds. The collapse should feel like the clerk closing the drawer and laying the finished record on the table.

---

## 5. ACT 3 — The dossier (restyle of existing, into the new flow)

Largely the **existing dossier**, re-homed into the full-width record (no longer a narrow right column beside a sticky intake — enrollment is done, so the record gets the whole page; the dome sits behind it as before).

### 5.1 Counts ledger (keep, refine)

A single hairline-ruled row at the top of the record (inside the dossier panel, on white): the four tier counts as `{big Fraunces number}{mono tier label in accent}`, plus `{N} suppressed` in slate, plus a right-aligned `checked {timestamp}`. **No total "score," no "X clear," no green.** Counts are a ledger, not a grade.

```
  1          1            1          21               checked 2026-06-13 14:35
  ACT        ADDRESS      AWARE      CONTEXT           ── here's what we found
                                     (suppressed)
```

(Order the visible counts ACT → ADDRESS → AWARE left-to-right for severity reading; show CONTEXT count as "suppressed" only.)

### 5.2 Finding card anatomy (keep — it's right)

The existing `FindingCard` is on-thesis. Confirm/lock these details:

```
┌▌────────────────────────────────────────────────────────┐   ▌ = left edge-bar,
│ [ACT]  [✶ Checked because of your context]   STRONG CONF │       tier accent (3px;
│                                                           │       6px for lead card)
│ Recalled by CPSC                          ← Fraunces, big │
│ on "Fisher-Price Rock 'n Play Sleeper"    ← mono, faint   │
│                                                           │
│ At least eight infant fatalities occurred after the      │   ← severity_basis,
│ original 2019 recall…                       Newsreader   │      record-stating prose
│                                                           │
│ Conditional — applies if an infant sleeps in this product│   ← italic Fraunces label
│                                              (ADDRESS+)   │      + condition (when present)
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ACTION — PER THE RECALL                     ← mono eyebrow│
│ Stop using the product and contact Fisher-Price for a    │   ← action, quoting the
│ refund or voucher.                                        │      regulator verbatim
│ ─────────────────────────────────────────────────────── │
│ CPSC · RecallNumber 19V088    checked as of 2023-01-09   │   ← mono receipt: source ·
└───────────────────────────────────────────────────────────┘      locator · as_of date
```

Rules locked by the rubric:
- **Tier chip** is the only severity badge; tier color appears only on chip + left bar. Lead card (top ACT) is bigger type + 6px bar + stronger lift — **loud via size/weight/position, never a new color.**
- **`action` is quoted from the source** under an "ACTION — PER THE RECALL" eyebrow. Warden originates no advice; the eyebrow makes the attribution explicit. For a settlement: "ACTION — PER THE CLAIM SITE" and the body must read "a settlement exists; eligibility criteria per the claim site" — never "you qualify."
- **Receipt footer** is mono: linked `source.name · source.locator` + `checked as of {as_of}`. This is the printed-receipt voice; keep it.
- **Confidence** (independent-source findings) sits top-right in mono: `STRONG CONFIDENCE` / `MODERATE` / `PRELIMINARY` / `CONTESTED` — categorical only, never a number, never rendered as a safety grade. Skeptic-safe: it grades *evidence strength on the public record*, not harm.

### 5.3 Ordering

ACT → ADDRESS → AWARE, then record statements, then the aggregated initiatives line (§6.4), then suppressed CONTEXT in a `<details>`. Within the top of ACT, the first card is the **lead**. `ai_inferred` findings are **interleaved by their own tier** (a §11 ADDRESS sits among ADDRESS findings) — origin does not change *rank*; it only adds the neutral chip. (See §6.3.)

### 5.4 No-findings / clean dossier (the §9 + anti-all-clear surface)

When nothing actionable is on file, the dossier is **never blank and never reassuring**:

- Headline (Fraunces): *"Nothing on file for your items, as of today."*
- A stack of **record statements**, one per checked group, in the existing neutral card:
  > **NO ACTION ON FILE** *(mono eyebrow)*
  > Checked CPSC, CA Prop 65, and EPA water records for "portable space heater" as of 2026-06-13 — no active recall or public action on file.
- A closing mono line that names coverage and recency, factually, without lecturing: `Checked {sources} · {date}. Records can change — Warden re-checks each time.` (states recency + that absence isn't permanent, in plain words — no "clearance," no "verdict" meta-talk, no safety claim.)
- The dome stays quiet slate (NONE). **No checkmark, no green, no "all clear," no celebratory anything.**

### 5.5 All-CONTEXT result

Headline: *"Nothing to act on. {N} routine notices set aside."* Then the suppressed `<details>` (labeled "common / non-specific"). Reuse existing suppressed rendering. Never present this as "you're fine."

---

## 6. ACT 4 — Initiatives (§11 contextual discovery, declared as such)

The "Warden checked things you never named" moment. **It is part of the dossier, ranked into it — not a separate scary panel.** Its entire job is to be *honest about why Warden looked* and *calm about what it found*, while staying capped so it never floods.

### 6.1 The two-receipts model (the core of honest AI inference)

Every `ai_inferred` finding declares **two separate things, never collapsed**:

1. **WHY WE LOOKED** — the pathway grounding (`discovery.grounding`): proof the *pathway* is a real, established route. Surfaced as the neutral chip **"Checked because of your context"** + an expandable trail.
2. **WHAT WE FOUND** — the finding's own `source{}` (§3): identical to any other finding's receipt.

These are **labeled as two different receipts** in the expanded view. The user can see Warden had a real reason to look *and* a real source for what it found — two independent proofs.

### 6.2 The neutral chip (pinned copy — do not paraphrase)

- Chip text is **exactly**: `Checked because of your context`
- Styled with `.neutral-chip` (slate, hairline) — **never tier-colored, never alarm-colored.** Visually a sibling of the source-name chip.
- **Forbidden in the chip and anywhere on the §11 surface:** `found`, `extra`, `hidden`, `detected`, and any danger framing. The chip states *why we looked*, never *what we discovered* or *how reliable it is*. (rubric §7 — the skeptic scans this string.)

### 6.3 Surfaced ai_inferred finding card

Same `FindingCard` as everything else (tier color = sole severity), **plus**:
- the `Checked because of your context` chip in the header (alongside the tier chip);
- an **expandable "what we checked and why" trail** below the receipt footer.

The expand trail renders the pathway in plain language — the rubric's pinned shape:

```
  ▸ Why Warden checked this
  ┌──────────────────────────────────────────────────────────────┐
  │ WHY WE LOOKED                                                  │
  │ You said "well water" and "near a former air base."            │
  │ Warden inferred a known route:                                 │
  │   firefighting foam (AFFF)  →  soil/groundwater  →  your well   │
  │   →  ingestion.                                                │
  │ Pathway grounded in: ATSDR PFAS ToxProfile [Tier 1] (link)     │
  │                                                                │
  │ WHAT WE FOUND                                                  │
  │ Then checked EPA UCMR for your water system as of 2026-06-13:  │
  │ PFOA detected above the UCMR minimum reporting level.          │
  │ Source: EPA UCMR5 · PWSID MI0000823 (link)                    │
  └──────────────────────────────────────────────────────────────┘
```

- Two clearly labeled blocks: **WHY WE LOOKED** (grounding/pathway, `Tier n` mono badge) and **WHAT WE FOUND** (the §3 source). Two links, two receipts.
- The 5-element pathway renders as a plain-language arrow chain (`source → media → point of exposure → route`), describing **route/transport only** — no health-outcome words (rubric §7 forbids causes/cancer/toxic-to/harms in this prose).
- **Caps (rubric §11, load-bearing):** at most **M=3** surfaced `ai_inferred` rows, each a §3-confirmed finding. These 3 are interleaved by tier with the rest; they are not a segregated list. A §11 finding may **not** sit above AWARE without a non-null `condition` (origin-blind §5).

### 6.4 The aggregated coverage line (the anti-flood valve)

Every grounded-but-empty pathway — *and* any surfaced-cap overflow — collapses into **ONE calm, bottom-ranked line**, never one-row-per-pathway:

```
  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  ✶  Also checked, from your context: 4 environmental pathways
     as of 2026-06-13 — nothing on file.                       [show]
```

- Slate, mono, ranked **below every user/curated row and every AWARE+ finding** — the literal bottom of the record (above only the suppressed-CONTEXT `<details>`).
- Expandable (`[show]`) to a quiet list of *what was checked* (pathway + source queried + "no detection on file as of {date}"), each a §9-style record statement. **Never an alarm, never ADDRESS/ACT, never green.**
- This single line is **the primary defense against flooding the user with initiatives**: investigate up to 8, surface at most 3, and **everything else becomes this one quiet sentence.**

### 6.5 What is NEVER shown

- **Rejected pathways.** `discovery_rejected.json` is verifier/§10-only. No "considered & discarded" panel — rendering rejected hazard chains in the user's home is the §5 cardinal sin via the discovery door.
- **Hypotheses as findings.** A hypothesis that found nothing is a calm record statement (the aggregated line), never a top-level row, never an alarm.

---

## 7. Component inventory

| Component | Net-new / Restyle / Keep | Notes |
|---|---|---|
| `EnrollFlow` | **NET-NEW** | The 3-question state machine + progress rail + confirm slip. Owns enrollment state and emits `{items, context:{zip, region, proximity[]}}`. |
| `QuestionCard` | **NET-NEW** | One question on screen; variants: `zip` (input + inline resolve), `chips` (multi-select proximity), `freetext` (textarea + live parse). |
| `ItemPill` | **NET-NEW** | A parsed item, removable/editable. Reused in confirm slip. |
| `RequestSlip` | **NET-NEW** | The confirm-back card: WHERE / NEARBY / WHAT YOU OWN, each `[edit]`. Reuses `ItemPill`. |
| `ScanLog` | **NET-NEW (#035)** | Consumes the SSE stream; renders `ScanStep` rows; tracks running top tier → drives dome; collapses to a `<details>` on terminal event. |
| `ScanStep` | **NET-NEW** | One mono row; status (started/done/empty/error) + tier-tick. The `✶ Checked because of your context` variant for §11 steps. |
| `InvisibleShield` / `ShieldLoader` | **KEEP** | No code change needed for visuals. Now driven by the *running* tier during scan, not just final. The `tier` prop already supports this. **Origin-blind — do not add an AI cue.** |
| `CountsLedger` | **RESTYLE** | Extract the existing counts row into its own component; ACT→ADDRESS→AWARE order; suppressed + timestamp. No score. |
| `FindingCard` | **KEEP + extend** | Add the optional "Why Warden checked this" expand trail for `ai_inferred` (the two-receipts block). Everything else stays. |
| `DiscoveryTrail` | **NET-NEW** | The WHY-WE-LOOKED / WHAT-WE-FOUND expandable block inside an `ai_inferred` `FindingCard`. |
| `RecordStatement` | **KEEP + extend** | Existing neutral no-action card. Add the aggregated `also-checked` variant (§6.4) with `[show]` expand. |
| `SuppressedDetails` | **KEEP** | Existing `<details>` for CONTEXT. |
| `ErrorCard` | **KEEP** | Existing service-unreachable card. |
| `Masthead` | **KEEP, change eyebrow text** | Warden / `know what's around you` / № 001. |
| `Hero` | **NET-NEW** | The golden-circle value-prop panel (§3.0), WELCOME register. Shown on first load over the IDLE dome; `Start →` / `see a sample`. |

---

## 8. Copy & microcopy (two registers — locked strings)

Copy is organized by register (see §0). **WELCOME** = warm, benefit-led, plain — top of funnel only. **RECORD** = factual receipts — every finding and statement. **Never mix them.** When in doubt about a string: is the user *deciding to trust Warden* (WELCOME) or *reading what Warden found* (RECORD)?

### WELCOME register (warm, plain, golden-circle — marketing/enrollment/empty only)
- Masthead eyebrow: `know what's around you`
- Hero — WHY/HOW/WHAT, three beats:
  - Headline: *"Know what's around you."*
  - Body: *"The things you own and the place you live can carry recalls, warnings, and water issues most people never hear about. Warden checks them for you — and tells you what's worth knowing, and what to do."*
  - CTAs: `Start →` · `see a sample`
- Q1 helper: *"So Warden can check your water and what's nearby. Never shared."*
- Q2 helper: *"Lets Warden check things you'd never think to look up — like what's in the water near an airport."*
- Q3 placeholder: *"a peloton, a couple space heaters, my kid's inclined sleeper, the usual extension cords…"*
- Parse feedback: `parsed {N} items` · re-parse: `re-parse`
- Confirm-slip promise: *"Warden will check each of these for recalls, warnings, and water and environmental issues near you — and show you what's worth knowing, as of today."*
- Run button: `RUN AUDIT →` · safe path: `use demo basket`
- **WELCOME copy may say "things that affect your health / what's around you" as a reason to look — it may NEVER claim a specific item affects the user's health. That assertion never exists, in any register.**

### RECORD register (factual receipts — every finding, statement, scan row)
**Pinned / compliance-critical (must match exactly — rubric):**
- §11 origin chip: `Checked because of your context` — exact, never paraphrased; no `found/extra/hidden/detected`/danger words.
- Aggregated initiatives line: `Also checked, from your context: {N} environmental pathways as of {date} — nothing on file.`
- No-action record statement: `Checked {sources} for "{item}" as of {date} — no active recall or public action on file.`
- Settlement language: `A settlement exists; eligibility criteria per the claim site.` (never "you qualify").
- Closing coverage line (clean dossier): `Checked {sources} · {date}. Records can change — Warden re-checks each time.`

**Scan rows / log:**
- Section eyebrow: `CHECKING…`  (plain action label, not philosophy)
- Row detail examples (mirror real events): `→ 1 recall → ACT`, `→ FLINT, CITY OF → 1 SDWA violation → ADDRESS`, `→ 19 notices → CONTEXT (suppressed)`, `→ nothing on file`, `→ source unavailable — using cached record`.
- §11 step: `✶ Checked because of your context` / `{trigger} → {source} · checking…`
- Footer: `streaming · {N} of {M} sources · {elapsed}s` → `✓ done · {M} sources · {elapsed}s — view`
- Clean-path footer: `checked {sources} · nothing on file as of {date}`

**Dossier:**
- Ledger eyebrow (right): `here's what we found`
- Card action eyebrows: `ACTION — PER THE RECALL` / `ACTION — PER THE CLAIM SITE` / `ACTION — PER THE NOTICE`
- Conditional label (italic Fraunces): `Conditional — {condition}`
- No-findings headline: *"Nothing on file for your items, as of today."*
- All-CONTEXT headline: *"Nothing to act on. {N} routine notices set aside."*
- Discovery trail labels: `WHY WE LOOKED` / `WHAT WE FOUND`
- Suppressed summary: `Show {N} set aside — common / non-specific`

**Forbidden everywhere (compliance — rubric §7):** "safe", "unsafe", "fine", "healthy/unhealthy", "you're protected", "all clear", any green/check-as-safe semantics, any health-effect synthesis or claim that an item affects *this user's* health, "you qualify", and on §11 surfaces `found/extra/hidden/detected`/danger framing. A clean result is always *coverage + recency*, never reassurance. (Note: "recall," "warning," "notice," "violation" are fine — they name what a *source* published, not a verdict Warden renders.)

---

## 9. All states (matrix)

| Surface | Empty | Loading | Streaming/Scan | Results | Error |
|---|---|---|---|---|---|
| **Enroll** | Q1, dome IDLE, hook line | Q3 parse: pulse dot + pills `.reveal` | — | Confirm slip (editable) | Parse fails → fall back to line-split; never block |
| **Scan** | (n/a — runs only after audit) | Fallback single-shot loader if stream can't start | Rows append on real events; dome eases to running top tier; ✶ §11 steps; footer ticker | Terminal event → collapse to `view` line | Source-down row degrades; whole-service down → ErrorCard |
| **Dossier** | No-findings: record statements + coverage line, dome slate, NO all-clear | (covered by scan) | — | Counts ledger + ranked cards + initiatives + suppressed | Malformed body → ErrorCard ("can't reach the record"), list preserved |
| **Initiatives** | 0 surfaced + N empty → only the aggregated line | — | ✶ steps in scan | ≤3 cards interleaved by tier + aggregated line | (inherits dossier error) |
| **Dome** | IDLE slate (quiet, present) | IDLE | Eases per running tier | Holds final top tier; NONE = slate | Static CSS stipple fallback (no-WebGL / reduced-motion) |

**Robustness invariants (rubric §9 — all must hold):** empty/garbage input → schema-valid record statement, never a 500 or blank; no-findings → neutral timestamped statement, never silence/all-clear; all-CONTEXT → "nothing to act on, N set aside"; source-down → degrade + label coverage gap, valid output. **No blank screen, ever; no all-clear, ever.**

---

## 10. Implementation notes for the coder

**Reuse first.** All tokens, fonts, card styles, reveal/scan-bar animations, and the shield already exist. This rework is mostly *new composition + net-new surfaces*, not a re-theme. Do not add colors, fonts, or alarm-colored fills.

**Two copy registers (do not blur — §0, §8).** WELCOME-register strings live only in `Hero`, the masthead eyebrow, `EnrollFlow`, and empty/first-load states. Everything inside `FindingCard`, `RecordStatement`, `ScanStep`, and `CountsLedger` is RECORD register — factual receipts. A useful lint: any user-visible string containing "safe/unsafe/fine/healthy/all-clear" fails; any string asserting a *specific item* affects the user's health fails (even in WELCOME). Drop the words "public record" and "verdict" from all user copy — they're internal concepts, not user language.

**Legibility — text in containers (hard requirement, §1.1).** Every readable string sits on a solid/near-solid panel (`#fff` or `rgba(255,255,255,0.96)` + hairline + soft shadow), never directly on the particle field. Give inputs a solid white fill (replace the current translucent `bg-white/70` on the textarea). Compose so the dome's bright core sits in negative space *beside/behind* panels; where a panel overlaps the field (the scan), make the panel opaque and let the field peek at its edges only. The field is atmosphere; if there are words, there is paper under them.

**State machine.** Add a top-level `phase: "enroll" | "scanning" | "dossier"` in `app/page.tsx` (or a small reducer). Enrollment produces `{items, context}`; submitting it kicks the SSE scan; the terminal dossier event flips to `dossier`. Keep it one page so the dome is continuous.

**Enrollment (net-new):**
- `EnrollFlow` owns the 3 questions + confirm slip. Free-text → POST to a parse endpoint (Sonnet) returning structured `{items[], context}`; **debounce ~600ms**, show `parsed N items`, render `ItemPill`s. **Fallback:** if parse errors/times out, split the textarea by lines (current behavior) — never block.
- Proximity chips and ZIP feed `context:{zip, region, proximity[]}` exactly as the brain expects (coordinate field names with the backend agent; rubric ties these to EPA + §11). Per #036 the backend already wants `context.{zip, water_source}` — extend, don't fight it.
- **Compliance:** the intake schema is itself scanned (rubric §6) — collect only proxies/proximity; **never** pregnancy, diagnoses, conditions, or age-as-health-proxy. The proximity chips listed in §3.2 are safe; do not add health questions.

**Live scan (net-new, #035 / Gate 13):**
- `ScanLog` consumes the SSE/chunked stream from the runtime. Render each `{seq, phase, source, item?, status, detail, tier?}` as a `ScanStep`. Track `runningTopTier` = worst tier seen so far → pass to `<ShieldLoader tier={runningTopTier}>`.
- **Honest motion only:** animate a row when its event arrives; do NOT add setTimeout delays between rows (rubric §12 forbids fabricated delays). The drama comes from real streaming + the dome easing.
- §11 steps are identified by `origin: "ai_inferred"` (or a phase marker) on the event → render the `✶ Checked because of your context` variant. Never render anything from `discovery_rejected`.
- On `{type:"dossier"}`, collapse to a `<details>` and reveal the dossier. If the stream never starts (budget/transport), fall back to the existing single-shot loading UI, then the dossier — **no hang.**

**Dossier (restyle + extend):**
- Extract `CountsLedger` from the existing counts row; reorder visible counts ACT→ADDRESS→AWARE; keep suppressed + timestamp; **no score/total**.
- Extend `FindingCard`: when `origin === "ai_inferred"`, render the `Checked because of your context` chip (already present in current code) **and** add the `DiscoveryTrail` expand (`<details>`) reading `f.discovery.grounding` (WHY) + `f.source` (WHAT), two labeled receipt blocks. Both links open in new tab.
- **Interleave by tier** — do not segregate `ai_inferred` into their own section; rank purely by tier (origin-blind). Enforce the M=3 surfaced cap and route overflow + empties into the aggregated line.
- Extend `RecordStatement` with the aggregated `also-checked` variant (one line, `[show]` expand). Rank it dead last before the suppressed `<details>`.

**Origin-blindness (verifier checks this — do not break):** tier color is the sole severity signal on cards, ledger, scan ticks, and the dome. The only thing `ai_inferred` adds is the **neutral slate chip + the trail**. No accent, no extra dome cue, no reordering by origin.

**Performance / fallback (rubric §10, §A):** the shield is already capped (device-aware point count, static fallback). Don't raise the count. Test the scan + dome on non-dev hardware. Keep the static stipple path intact.

**Accessibility:** all motion respects `prefers-reduced-motion` (already wired — reveal/scan-bar/dome freeze). Scan log should be a `role="log" aria-live="polite"` region so streamed steps are announced. Tier ticks need text labels (the tier word is already in the detail) — never rely on color alone for severity (color-blind users; also a rubric-aligned "color is *a* signal, not the *only* affordance" hedge even though it's the sole *severity* signal).

---

## 11. Top design risks

1. **The all-clear-by-vibe trap (highest).** A quiet dome + few cards can *read* as "you're safe" even with zero "safe" words. Mitigations baked in: dome calm = *quiet-but-present* slate (never green, never empty), clean dossiers are explicit **record statements** with the `Records can change — Warden re-checks each time` line, counts are a ledger not a grade, and the scan's `empty` rows are styled as neutral completed lines, not relief. **Watch this in review:** if any state could be screenshotted and captioned "Warden says I'm fine," it has failed.
2. **Flooding the user with initiatives.** §11 can balloon into a wall of scary "we checked X near you" rows. Hard valve: investigate ≤8, surface ≤3 (interleaved by tier, each §3-confirmed), and **everything else — empties and overflow — collapses into ONE calm bottom-ranked line.** Rejected pathways are invisible. If initiatives ever feel like a feed of scares, the cap or the aggregation has broken.
3. **Origin leaking into severity.** Tempting to make AI-inferred findings look special (a badge color, a dome flicker, a separate section). The rubric forbids it — tier is the sole severity signal and the shield is origin-blind. The *only* AI signal is the neutral chip + the two-receipts trail.
4. **The scan turning theatrical.** Adding fake delays to make the money-shot "feel" agentic violates §12 and the reporter stance. The drama must come from *real* streamed events + the dome easing — if the run is genuinely fast, the scan is fast (and that's fine; the clean path still streams honestly).
5. **Enrollment becoming a form again.** The whole win is "a clerk asked me three things and parsed them instantly." If the live parse is hidden, slow, or the proximity chips read as a risk checklist, the snappy feel collapses into a government intake. Keep parse visible/instant, chips framed as *places we look*, demo basket always one click away.
6. **Two-receipts collapsing into one.** If WHY-WE-LOOKED (grounding) and WHAT-WE-FOUND (§3 source) get merged in the UI, the honesty of AI inference is lost — it starts to read as "the AI decided this is dangerous." Keep them two labeled blocks, two links.
7. **The two registers bleeding (compliance).** The warm "things that affect your health" framing is a powerful hook — and a liability if it leaks into a finding. The instant a *card* implies an item harms the user, Warden becomes a health advisor and fails rubric §7. Hard line: WHY-framing only at the top of the funnel; every finding stays a factual receipt. If a finding ever reads like advice or a verdict, the register has bled.
8. **Text lost on the field (the flagged legibility bug).** The current build floats copy on the gray particles; it must always sit on a solid panel (§1.1). The temptation is to keep the "ethereal" overlap — resist it. Atmosphere behind, paper in front, full contrast on every word. If any state has unframed body text over the field, it regresses the explicit fix.
```
