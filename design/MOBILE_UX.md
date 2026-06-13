# Warden — Mobile & Tablet UX Spec

> **Design-only.** This is the brief a frontend coder executes; it does not touch code. The frontend is being edited live by another agent — **do not** read this as license to change code, only as the target.
> **Companion to [`UX_REWORK.md`](./UX_REWORK.md).** That doc defines the *what* (the four-act Enroll → Scan → Dossier → Initiatives experience, the two copy registers, every locked string, every component). **This doc adds only the mobile/tablet *how*: responsive layout, touch ergonomics, particle-field perf on a phone, and the per-component narrow mockups.** Where the two ever disagree, `UX_REWORK.md` wins; where `UX_REWORK.md` and `rubric.md` disagree, the rubric wins.
> **Build target:** the rework should be implemented **mobile-first / responsive in a single pass** — the desktop layouts in `UX_REWORK.md` and the mobile layouts here are the *same components* reflowing at breakpoints, not two builds.

---

## 0. What does NOT change on mobile (rubric invariants, restated)

Screen size never relaxes the rubric. On a phone, exactly as on desktop:

1. **Tier color is the sole severity signal** — chips, left edge-bars, scan ticks, the particle field. Origin (user-listed vs AI-inferred) never recolors anything and never reorders.
2. **No green, ever. No "all clear," ever.** A quiet result is a *calm, dated record statement*, never a blank screen, never a reassuring vibe. (A calm phone screen is the single biggest mobile-specific trap — see §11.)
3. **Reporter, not advisor.** Findings state a fact + quote the source's own action + stamp when it was checked. The warm WELCOME-register copy lives only in the hero/enrollment/empty states.
4. **Two-receipts honesty for AI-inferred** (`Checked because of your context` neutral chip + WHY-WE-LOOKED / WHAT-WE-FOUND trail). The chip string is pinned; never paraphrase, never add `found/extra/hidden/detected`.
5. **Legibility — text always sits on a solid panel** over the field (`UX_REWORK.md §1.1`). On mobile this is *more* load-bearing, not less: a narrow viewport puts the dome's bright core directly behind the content column, so panels MUST be opaque.

If a mobile layout could be screenshotted and captioned "Warden says I'm fine," it has failed — same bar as desktop.

---

## 1. Responsive breakpoints & layout strategy

One page, one state machine (`phase: "enroll" | "scanning" | "dossier"`), one continuous dome — identical to desktop. The page **reflows**, it does not branch. Breakpoints map onto the tokens already in the codebase (`sm` 640, `lg` 1024 are in use in `app/page.tsx`; the shield already switches point-count at `w < 820`).

| Band | Width | Name | Layout posture |
|---|---|---|---|
| **XS** | < 380px | small phone | Single column, full-bleed. Tightened type scale (−1 step). Sticky action bar. Dome = contained band behind hero / behind dome-stage only. |
| **S** | 380–639px | phone (design target ≈390px) | **The primary mobile target.** Single column, 16px gutters, sticky bottom action bar, accordion dossier, bottom-sheet inspectors. |
| **M** | 640–1023px | large phone / portrait tablet | Single column but wider (max ~560px content, centered), 24px gutters. Sticky bar persists. Enrollment questions get more breathing room. Dome can go fuller-bleed. Some side-by-side chip rows. |
| **L** | 1024px+ | landscape tablet / desktop | The `UX_REWORK.md` desktop layouts: enrollment centered panel, **scan = split (log left, dome center)**, dossier full-width over dome. Sticky bar becomes the inline `RUN AUDIT` again. |

**Core reflow rules**

- **The desktop two-column intake (`lg:grid-cols-[400px_1fr]` in today's `app/page.tsx`) collapses to one column below `lg`.** But note: the rework replaces that single-screen intake with the **3-question `EnrollFlow`** (`UX_REWORK.md §3`). On mobile that flow is *one question per screen* anyway, so mobile is the natural shape of the enrollment — desktop is the widened version of it.
- **Scan split → stacked on mobile.** Desktop puts the scan log left of a center dome (`UX_REWORK.md §4.1`). On phone there is no room for side-by-side: the **dome becomes a short reactive band pinned at the top** and the **scan log streams in the column below it** (§4 here).
- **Dossier column → full-width accordion.** Desktop dossier is a wide column of cards; mobile groups findings **by item** into a collapsible accordion to kill the long wall (§5 here, the one genuinely new mobile structure).
- **Sticky thumb action.** `RUN AUDIT` / `Run audit` is never something you scroll to find on a phone — it lives in a **sticky bottom bar** within safe-area insets on S/M, and returns to inline on L (§6).

**Tablet specifically:** portrait tablet (M band) is "a big phone" — same single-column flow, just more whitespace and a fuller dome. Landscape tablet (L band) gets the desktop split. Do not invent a third tablet-only layout.

---

## 2. The particle field on a phone (perf, battery, composition)

`InvisibleShield` is the spine of the experience and must survive contact with a mid-range Android on cellular without melting the battery or dropping the dossier's frame rate. The component already has the right hooks — **this section tells the coder how to use them on mobile, and what to add.** It does NOT ask for a count increase (rubric §10 / `UX_REWORK.md §10` forbid that).

### 2.1 What already exists and is correct

- **Device-aware point count** (`InvisibleShield.tsx` line ~155): `7000` desktop, `3000` when `window.innerWidth < 820 || deviceMemory <= 4`, `600` static. Phones land on **3000**, which is the mobile budget. **Do not raise it.**
- **`dpr={[1,2]}` cap**, `antialias:false`, `powerPreference:"high-performance"`, `depthWrite:false`, additive-free `NormalBlending`, hard-disc fragment (no halo) — all already perf-conscious. Keep.
- **Static fallback** on `prefers-reduced-motion` OR WebGL probe failure → frozen render / CSS radial stipple. Keep, and it is the mobile safety net (§2.4).
- `frameloop={isStatic ? "demand" : "always"}` — already pauses the render loop in static mode.

### 2.2 Mobile-specific perf guidance (for the coder)

These are *additions to the existing component's mobile path*, all behind capability checks so desktop is untouched:

1. **Tier the count further on small phones.** Current logic is binary (`820px → 3000`). Add a low tier for genuinely weak devices: roughly
   - `w < 380 || deviceMemory <= 2 || hardwareConcurrency <= 4` → **~1500 points**
   - else `< 820 || deviceMemory <= 4` → **3000** (unchanged)
   - else **7000** (unchanged).
   1500 still reads as a constellation at phone size because the dome is physically smaller on screen (fewer pixels to fill) — density per square-inch is preserved.
2. **Throttle the frameloop when the field is calm and off the critical path.** The dome only *needs* to animate continuously during the **scan** (the money shot) and while at a hot tier. Proposal:
   - During **enrollment IDLE** and the **settled dossier** at NONE/CONTEXT/AWARE, drop to **demand/`~30fps`** (render on a throttled rAF, or `invalidate()` on a timer) — the calm field's slow drift does not need 60fps.
   - During **scanning** and at **ADDRESS/ACT**, run full `always`. The agitation and breach pulse are the payoff; spend the frames there.
   - Implementation hook: gate `frameloop` / an `invalidate()` cadence on `tier` + `phase`, not just `isStatic`.
3. **Pause when not visible.** Add `IntersectionObserver` and/or `document.visibilitychange` → when the canvas is scrolled fully out of view (long dossier) or the tab is backgrounded, set `frameloop="never"`. This is the single biggest battery win on a long mobile scroll. (The field is `position:fixed` today, so it technically never scrolls off — see §2.3; pair this with the contained-band treatment so "out of view" is real.)
4. **Cap pixelRatio harder on low tier.** `Math.min(devicePixelRatio, 2)` is fine for most; on the low tier (point 1) cap at `1.5` — a 3x-DPR budget phone does not need to shade the field at full retina.
5. **No new shader work for mobile.** The existing shader is cheap (hash noise, no textures, hard disc). Do **not** add a "simpler mobile shader" — that's two code paths to maintain and the current one is already light. The lever is *count + framerate + visibility*, not shader complexity.

### 2.3 Composition on a tall narrow viewport (the real design problem)

On desktop the dome is a `min(90vw,96vh)` square centered behind a wide layout, radially masked so margins stay white. On a **390×844 phone** that same square would sit *directly behind the single content column* — exactly the legibility failure `UX_REWORK.md §1.1` forbids. Mobile composition rules:

- **The dome is a CONTAINED BAND, not full-bleed-behind-everything, on S/XS.** Per phase:
  - **Enrollment & Dossier (calm-dominant):** the dome lives in a **bounded region at the top** of the viewport (a ~`40vh` band behind the masthead + hero / behind the counts ledger), radially masked top-and-bottom so it fades to white *above the first panel*. Content panels scroll over solid white below it. The field is felt as an atmosphere overhead, never read through.
  - **Scan (dome-dominant — the money shot):** the dome gets a **larger top band (~50–55vh)** and becomes the visual lead, with the streaming log in opaque panels below/over its lower edge. This is the one mobile screen where the field is the hero; the panels still have solid fill and the field only peeks at their edges (`UX_REWORK.md §4.1` adapted to stacked).
- **Mask shape changes for portrait.** The desktop circular radial mask becomes a **vertical-bias radial / elliptical mask on mobile** so the bright core sits high (behind the masthead/dome-band) and fades out before the content column begins. Concretely: bias the mask center upward (`circle at 50% 30%`) and tighten the falloff so nothing dense sits under body text.
- **Panels are fully opaque on mobile.** Replace any translucent `bg-white/70` / `bg-white/60` (the textarea and area-box use these today) with **solid `#ffffff`** on S/XS. Grain may show *outside* panels; never through text. (This is already a hard requirement in `UX_REWORK.md §1.1`; restated because the narrow column makes violations invisible on desktop but glaring on a phone.)

### 2.4 Tier reaction must still read on mobile

The whole point of the field is the visceral tier reaction. On a small contained band it must still be unmistakable:

- **Color is the primary mobile signal** (it survives a tiny render where fine agitation/density nuance is lost): IDLE/NONE slate → AWARE steel-blue → ADDRESS amber → ACT red. Because the band is small, **color shift carries more of the load than motion** on mobile — which is fine, since tier color is the sole severity signal anyway.
- **The ACT breach pulse must remain visible** — it's the climax. On the contained band it reads as a radial flare washing the band; keep it. If anything, on mobile the breach is *more* legible because the band is small enough to take it in at a glance.
- **Never substitute a calm field for an "all-clear."** A quiet slate band at NONE is *quiet-but-present coverage*, paired ALWAYS with an explicit record statement below it (§11 trap). The field never tells the user they're safe; the dated statement carries the meaning.

### 2.5 Static fallback path on mobile

- `prefers-reduced-motion` (common on phones / low-power mode) and WebGL failure both already route to the static path. On mobile this is **expected, not exceptional** — Low Power Mode on iOS throttles WebGL hard.
- The static fallback must still **show tier color** (a tinted radial stipple in the tier accent), not just the neutral slate gradient in the current `!webglOk` branch. **Coder note:** extend the static/`isStatic` render so its radial-gradient color is driven by `TIER_CONFIG[tier].color`, so reduced-motion users still get the sole severity signal. A frozen colored field is rubric-compliant; a frozen *uncolored* field loses the tier signal.
- Battery / Low-Power detection: if `navigator.getBattery()` reports low/charging-off or Low Power Mode is inferable, prefer the throttled or static path proactively. (Progressive enhancement — never required for correctness.)

---

## 3. ENROLLMENT on mobile (the priority)

Mobile is the *native* shape of the `EnrollFlow` from `UX_REWORK.md §3` — one question per screen is exactly how a phone wants it. This section specifies the touch mechanics, the **#042 predicted-basket chips**, **#042 typeahead**, and how parse/confirm feel fast. It honors the locked questions, helper copy, and registers from `UX_REWORK.md §3` and `§8` — read those for the strings.

### 3.0 Hero (first load) — narrow

```
390px ───────────────────────────────────
┌─────────────────────────────────────┐
│ Warden        know what's around you │  ← masthead; eyebrow wraps under on XS
├─────────────────────────────────────┤
│        · ·  ·· ·· ·  ·               │  ← dome BAND (~38vh), masked, fades
│      ·  ·· :· ·: ·· ·  ·             │     to white before the panel
│        · ·· ·· · ·                   │
├─────────────────────────────────────┤
│ ┌─ solid white panel ─────────────┐ │
│ │                                  │ │
│ │ Know what's around you.          │ │  ← Fraunces, ~30px (clamp, §6 scale)
│ │                                  │ │
│ │ The things you own and the place │ │  ← Newsreader, ~16px, one paragraph
│ │ you live can carry recalls,      │ │
│ │ warnings, and water issues most  │ │
│ │ people never hear about. Warden  │ │
│ │ checks them for you — and tells  │ │
│ │ you what's worth knowing, and    │ │
│ │ what to do.                      │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
└─────────────────────────────────────┘
[ ───── sticky bottom bar ───────────── ]
[   Start →            see a sample     ]  ← §6 sticky action, thumb zone
```

- WELCOME register, three beats, no "public record"/"verdict". `Start →` opens Q1 in place; `see a sample` loads the demo basket straight to its dossier (safe path, rubric §E).
- The hero panel is solid white; the dome band fades out above it. No body text over particles.

### 3.1 Progress rail → top tick strip on mobile

Desktop uses a left rail of completed/upcoming ticks. On a phone there is no left gutter — **the rail becomes a slim horizontal tick strip pinned under the masthead**:

```
┌─────────────────────────────────────┐
│ ●━━━━━○─────────○                     │  3 ticks: done(filled) · current · upcoming
│ where    nearby     what you own      │  ← mono micro-labels, ink-faint
└─────────────────────────────────────┘
```

- Filled = answered, ring = current, hairline = upcoming. Tapping a completed tick re-opens that question (same as desktop `[edit]`).
- Reassures "this is short" — critical on mobile where users bail fast. ~24px tall, not a tap-target-heavy nav.

### 3.2 Q1 — "Where do you live?" + tap-water toggle

```
┌─ solid white panel ──────────────────┐
│ WHERE                                 │  ← mono eyebrow
│ Where do you live?                    │  ← Fraunces question
│                                       │
│ ┌─────────────────┐                   │
│ │ 48503           │  ← ZIP input      │  numeric keypad (inputMode="numeric"),
│ └─────────────────┘                   │  44px tall, solid white, 5-digit cap
│ ✓ ZIP 48503 · Genesee County, MI      │  ← mono resolve echo (never blocks)
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ ◻  I drink unfiltered tap water    │ │  ← HARD TOGGLE (#037), full-width
│ └───────────────────────────────────┘ │     tappable row, 48px, checkbox left
│                                       │
│ So Warden can check your water and    │  ← helper (WELCOME), Newsreader faint
│ what's nearby. Never shared.          │
└───────────────────────────────────────┘
[  Skip            Next →               ]  ← sticky; Skip advances, never blocks
```

- **ZIP triggers the numeric keypad** (`inputMode="numeric"`, `maxLength={5}`, digit-strip already in `page.tsx`). 44px min height; do not shrink the existing `w-[88px]` to a tiny box on mobile — give it room and a large hit area.
- **The tap-water toggle is a full-width tappable ROW**, not a tiny 15px checkbox (the current `h-[15px] w-[15px]` is a desktop affordance and fails the 44px target). The whole row toggles; the checkbox is the visual marker.
- Resolve echo is mono, appears inline, never gates `Next`.

### 3.3 Q2 — "Anything nearby?" proximity chips (multi-select, thumb-friendly)

```
┌─ solid white panel ──────────────────┐
│ NEARBY                                │
│ Anything nearby?                      │
│                                       │
│ ┌──────────┐ ┌────────────┐           │  multi-select chips, WRAP into rows,
│ │ airport  │ │ military…  │           │  ≥44px tall, ≥8px gaps so thumbs don't
│ └──────────┘ └────────────┘           │  mis-tap. Filled slate = selected;
│ ┌──────────┐ ┌──────────────┐         │  hairline outline = unselected.
│ │ farmland │ │ industrial    │         │  NEUTRAL slate — NOT tier-colored
│ └──────────┘ └──────────────┘         │  (these are inputs, not findings).
│ ┌────────────────────┐ ┌────────────┐ │
│ │ older home (pre-78)│ │ well water │ │
│ └────────────────────┘ └────────────┘ │
│ ┌──────────────────┐ ┌──────────────┐ │
│ │ recent renovation│ │ something… + │ │  ← free-text chip → inline input
│ └──────────────────┘ └──────────────┘ │
│                                       │
│ Lets Warden check things you'd never  │  ← helper (WELCOME); frames as
│ think to look up — like what's in the │     PLACES WE LOOK, never risks
│ water near an airport.                │
└───────────────────────────────────────┘
[  Skip            Next →               ]
```

- **Chips wrap, never horizontal-scroll a hidden row** (a hidden scroll row loses options on mobile). All proximity options are visible by wrapping; the set is small (7 + free-text).
- Tap toggles. Selected = `.neutral-chip` filled slate; unselected = hairline outline. The toggle gives a subtle scale/press feedback (CSS `:active`), respecting reduced-motion.
- "something else… +" expands an inline text field (folds into context via the LLM). Keyboard pushes the sticky bar up (see §6 keyboard handling).
- Copy stays WELCOME-warm — never a risk checklist (`UX_REWORK.md §3.2` compliance note).

### 3.4 Q3 — "What do you own?" + #042 predicted basket + #042 typeahead + live parse

This is the highest-leverage mobile screen. It layers three input paths (#042 a/b/c) so the user almost never has to free-type a full list on a phone keyboard. **Order of effort, least→most typing:** predicted chips → typeahead → free text.

**3.4a — Predicted-basket chips (#042a, the "beats typing" path)**

If the user answered enough of the lightweight profile (household / rent-own + home age / car / the ZIP+tap from Q1), Sonnet predicts likely-owned, recall-prone items and offers them as **accept/reject chips**. On mobile this is the fastest possible enrollment — tap to keep, done.

```
┌─ solid white panel ──────────────────┐
│ WHAT YOU OWN                          │
│ Tap what you have.                    │  ← prediction framing, WELCOME-warm
│                                       │
│ Based on your answers — keep what's   │  ← honest: these are GUESSES to confirm,
│ yours, drop the rest:                 │     possession proxies only (#042 compliance)
│                                       │
│ ┌──────────────────┐ ┌──────────────┐ │  PREDICTED chips, tap-to-KEEP.
│ │ ✓ Peloton-type   │ │ ✓ space heat…│ │  Kept = filled slate + ✓; not-kept =
│ │   treadmill      │ │              │ │  hairline (a tap removes the ✓).
│ └──────────────────┘ └──────────────┘ │  ≥44px, wrap. NEUTRAL slate (inputs,
│ ┌────────────────┐ ┌──────────────┐   │  never tier-colored — origin-blind).
│ │ ✓ extension … │ │   gas range  │   │
│ └────────────────┘ └──────────────┘   │
│                                       │
│ + add your own                        │  ← reveals the typeahead/free-text field
└───────────────────────────────────────┘
[  Skip            Next →               ]
```

- **Tap-to-keep, not tap-to-add:** predicted chips render pre-kept (`✓`, filled) so the common case is "glance, drop the two wrong ones, go." A tap toggles keep/drop. This is the thumb-friendly win.
- **Compliance (rubric §6 / #042):** the profile that drives prediction collects **possession proxies only** (household size, rent/own, home age, car y/n, ZIP, tap) — **never** age-as-health, pregnancy, diagnoses, conditions. The chips are framed as "what you have," never "what's risky for you." The profile doubles as §11 discovery context.
- **No prediction available** (user skipped profile) → this block is absent; go straight to typeahead + free text below.

**3.4b — Typeahead autocomplete (#042b) with the mobile keyboard**

"+ add your own" reveals a single-line input with **instant local typeahead** from a static recall-prone brand/category dict, plus debounced Haiku canonicalization (`"pelo" → "Peloton Tread+"`).

```
┌─ solid white panel ──────────────────┐
│ ┌───────────────────────────────────┐ │
│ │ pelo|                             │ │  ← single-line input, keyboard open
│ └───────────────────────────────────┘ │
│ ┌───────────────────────────────────┐ │  SUGGESTION LIST drops directly under
│ │ Peloton Tread+                    │ │  the input (above the keyboard, never
│ │ Peloton Bike                      │ │  hidden behind it — see §6 keyboard).
│ │ Peloton Bike+                     │ │  Each row ≥44px, tap to add as a pill.
│ └───────────────────────────────────┘ │  Instant local matches first; the
│                                       │  Haiku-canonicalized result appends
│                                       │  when it lands (debounced ~250ms).
└───────────────────────────────────────┘
```

- **Local dict = instant** (no network), so the list never feels laggy on cellular — critical on mobile. Haiku canonicalization is a debounced *enhancement* that quietly upgrades a fuzzy entry; it never blocks the local suggestions.
- Tapping a suggestion adds an **item pill** (below) and clears the input for the next entry — fast serial entry without re-summoning anything.
- `autocapitalize="off" autocorrect="off"` on this field so the phone's autocorrect doesn't fight brand names.

**3.4c — Free-text parse fallback (#042c / the `UX_REWORK.md §3.2` hero micro-interaction)**

The textarea is always available (toggle between "tap" and "type it all" modes, or just below the typeahead). Natural-language welcome; Sonnet parses on debounce (~600ms) into item pills. This is the desktop default, here as the mobile fallback.

```
┌─ solid white panel ──────────────────┐
│ ┌───────────────────────────────────┐ │
│ │ a peloton, a couple space heaters,│ │  ← textarea, SOLID white (not bg/70),
│ │ my kid's inclined sleeper, the    │ │     mono, ~5 rows, natural language
│ │ usual extension cords|            │ │
│ └───────────────────────────────────┘ │
│ ● parsed 5 items            re-parse  │  ← pulse-dot while Sonnet works;
│                                       │     pills fade in via .reveal
│ ┌──────────────────┐ ┌──────────────┐ │  PARSED ITEM PILLS (removable ×),
│ │ Peloton Tread+ × │ │ space htr ×2×│ │  editable on tap. Wrap. ≥44px.
│ └──────────────────┘ └──────────────┘ │
│ ┌────────────────────┐ ┌───────────┐  │
│ │ baby inclined slp ×│ │ ext cords×│  │
│ └────────────────────┘ └───────────┘  │
└───────────────────────────────────────┘
```

- **Parse is shown, not hidden** — pills materialize as proof something intelligent is working. `parsed N items` + `.warden-pulse-dot` while Sonnet runs; `.reveal` fade-in per pill.
- **Fallback (never block):** if parse errors/times out, split the textarea by lines (current `page.tsx` behavior). On mobile, a stalled parse must NEVER trap the user — the line-split lets `Next` work regardless.
- "Use demo basket" lives here too — fills + parses instantly.

### 3.5 Confirm slip (parse confirmed back) — narrow

The three answers collapse into the request slip (`UX_REWORK.md §3.3`), reflowed to one column. This is the single commitment screen before the audit.

```
┌─ THE REQUEST ───────────────── № 001 ─┐
│                                        │
│ WHERE                          [edit]  │
│ ZIP 48503 · Genesee County, MI         │
│                                        │
│ NEARBY                         [edit]  │
│ farmland · well water · older home     │  ← wraps; mono
│                                        │
│ WHAT YOU OWN                   [edit]  │
│ ┌──────────────────┐ ┌──────────────┐ │  item pills, wrap, removable here too
│ │ Peloton Tread+   │ │ space htr ×2 │ │
│ └──────────────────┘ └──────────────┘ │
│ ┌────────────────────┐ ┌────────────┐ │
│ │ baby inclined slp  │ │ ext cords  │ │
│ └────────────────────┘ └────────────┘ │
│                                        │
│ Warden will check each of these for    │  ← WELCOME-register promise
│ recalls, warnings, and water and       │     (warm, honest, no health claim)
│ environmental issues near you — and    │
│ show you what's worth knowing, as of   │
│ today.                                 │
└────────────────────────────────────────┘
[ ────── sticky bottom bar ───────────── ]
[   RUN AUDIT →        use demo basket   ]  ← the commitment, in the thumb zone
```

- `[edit]` per section re-opens that question in place (taps to the matching tick in the strip).
- Skipped sections show `— not provided —` in faint mono; Warden runs anyway (rubric §9).
- `RUN AUDIT →` is the dark pill in the sticky bar — the moment the dome leaves IDLE and the stream starts.

### 3.6 #043 recently-viewed baskets (gated, when signed in)

When Clerk auth is present and the user has prior baskets (#043, gated on #040), the hero / Q3 gains a **one-tap re-run strip** — the fastest possible mobile re-entry:

```
┌─ solid white panel ──────────────────┐
│ YOUR BASKETS                          │  ← only when signed in + history exists
│ ┌───────────────────────────────────┐ │
│ │ Home · 5 items · audited Jun 6  →  │ │  tap = one-click re-run.
│ │ ● 1 new recall since last audit   │ │  ← the monitoring hook (#043): a tier
│ └───────────────────────────────────┘ │     dot (sole color) flags a NEW action
│ ┌───────────────────────────────────┐ │     filed since last audit. Mono, neutral
│ │ Garage · 3 items · audited May 30 →│ │     framing, never "you're at risk".
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘
```

- Each basket is a ≥56px tappable row (re-run). The "new recall since last audit" line uses the **tier dot as the sole color**; phrasing is RECORD-register factual (`a new recall was filed on your <item>`), never an alarm or a verdict.
- Inert with no Clerk keys (matches the existing `AuthMasthead` flag-gating) — the strip simply doesn't render.

---

## 4. LIVE SCAN (§12) on mobile — compact streaming list, dome reaction visible

Desktop is a split (log left / dome center, `UX_REWORK.md §4.1`). On a phone there's no room — **stack it: a reactive dome band on top, the streaming log below.** Honest motion only (rows append on real events, no fabricated delays — rubric §12 / #035).

```
390px ───────────────────────────────────
┌─────────────────────────────────────┐
│ Warden        know what's around you │
├─────────────────────────────────────┤
│         ·· ·:·:· ·· · ·              │  ← DOME BAND (~50vh), the lead.
│      · ·:· ·:: ·· :· : · ·· ·        │     Reacts to RUNNING TOP TIER —
│     ·· · ·· ·:·:·· ·· :· · ·         │     warms slate→steel→amber→RED and
│       · ·· : ·· ·:·· · ·· ·  ·       │     pulses on the first ACT. Visible
│         ·  ·   ·  ·   ·              │     above the fold the whole scan.
├─────────────────────────────────────┤
│ CHECKING…                            │  ← mono eyebrow, opaque panel begins
│ ┌─ solid panel (scrolls over field) ┐ │
│ │ CPSC · Peloton Tread+             │ │  ← scan rows append as REAL events
│ │   → 1 recall  ■ ACT  ✓            │ │     land. tier-tick ■ = SOLE color.
│ │ CPSC · space heater               │ │
│ │   → 6 recalls  ■ ACT  ✓           │ │
│ │ EPA · water · ZIP 48503           │ │
│ │   → FLINT → 1 SDWA viol ■ ADDRESS✓│ │
│ │ ✶ Checked because of your context │ │  ← §11 step: ✶ + pinned phrase,
│ │   well water → EPA PFAS · …       │ │     NEUTRAL slate, never tier-colored
│ │ Prop 65 · ext cords               │ │
│ │   → 19 notices ▫ CONTEXT (suppr.) │ │  ← hollow slate tick, row dims
│ └───────────────────────────────────┘ │
│ ▌ streaming · 4 of 6 · 3.1s          │  ← footer ticker, real elapsed
└─────────────────────────────────────┘
```

- **Dome band stays pinned above the fold for the whole scan** so the tier reaction is always visible while rows stream beneath. This is the mobile money shot — the user watches the band warm to red as ACT findings land. (Desktop puts log beside dome; mobile puts dome above log — same relationship, stacked.)
- **Reuse `ScanLog` as-is structurally.** It already: streams rows, uses the tier dot/tick as sole color, dims CONTEXT, handles `started/done/empty/error` glyphs, auto-scrolls newest into view, has a `collapsible` mode. Mobile changes are container/sizing only:
  - The log panel is **opaque white** (it overlaps the dome band's lower edge).
  - `max-h-[52vh]` (current) is fine on mobile; the inner list scrolls within the panel while the dome band stays put.
  - Rows are mono ~11–12px — already compact; keep. Ensure the tier-tick + tier WORD are both present (color is never the only affordance — rubric/accessibility, restated for color-blind users on small screens).
- **`aria-live="polite"` / `role="log"`** on the streaming list (per `UX_REWORK.md §10`) — matters more on mobile where VoiceOver/TalkBack users rely on it.
- **States (all from `UX_REWORK.md §4.5`, unchanged on mobile):**
  - *Clean/empty path must still stream* — `→ nothing on file` rows, dome stays quiet slate, footer settles to `checked {sources} · nothing on file as of {date}`. Never a blank wait, never an all-clear.
  - *Source-down* → degrade row (`source unavailable — using cached record`), no alarm color, run completes.
  - *Stream can't start / budget* → fall back to the single-shot loader (existing three-scan-bar) with label `Checking…`, then the dossier. No hang.
  - *Whole service down* → existing ErrorCard, list preserved.
- **Transition to dossier:** on terminal `{type:"dossier"}`, the log **collapses upward** into a one-line `<details>` — `✓ scan complete · 6 sources · 4.2s — view` — and the dossier reveals below with the staggered `.reveal`. The dome band shrinks to the calmer dossier band (§2.3) and holds the final top tier. On mobile this collapse also reclaims vertical space — important on a small screen.

---

## 5. DOSSIER on mobile — group BY ITEM as a collapsible accordion (kills the wall)

The single most important mobile-specific structural change. The desktop dossier is a flat ranked list of cards; on a phone that becomes an endless scroll. **Group findings by item into an accordion**, ranked, with the worst tier surfaced on each collapsed header so the user can triage without expanding.

### 5.1 Counts ledger (top, on white) — reflowed

```
┌─ solid white panel ──────────────────┐
│  1     1      1      21               │  big Fraunces numbers; tier label in
│  ACT   ADDR   AWARE  suppressed       │  accent under each. ACT→ADDR→AWARE
│                                       │  order. NO score, NO total, NO green.
│  checked 2026-06-13 · what we found   │  ← timestamp + RECORD eyebrow, wraps
└───────────────────────────────────────┘
```

- The desktop counts row (`flex flex-wrap` in `page.tsx`) already wraps — on mobile it lays the 3 visible tiers + suppressed across 1–2 rows. Keep tabular nums; keep the right-aligned timestamp (drops below on narrow). No grade.

### 5.2 The accordion — grouped by item

```
┌─ ITEM GROUP (collapsed) ─────────────┐
│▌ Fisher-Price Rock 'n Play     ⌄     │  ← ▌ left bar = WORST tier in group
│  [ACT] · 1 finding                    │     (sole color). Tap row to expand.
└───────────────────────────────────────┘   Header ≥56px tap target.
┌─ ITEM GROUP (expanded) ──────────────┐
│▌ Peloton Tread+                ⌃     │
│  [ACT] · 1 finding                    │
│ ┌─ FindingCard (full, §5.2 UX_REWORK)┐ │  ← the existing FindingCard, unchanged:
│ │ [ACT]              STRONG CONF     │ │     tier chip + left bar, Fraunces hazard
│ │ Recalled by CPSC                   │ │     name, severity_basis prose,
│ │ on "Peloton Tread+"                │ │     conditional, ACTION — PER THE RECALL,
│ │ …severity basis prose…             │ │     mono receipt footer.
│ │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │ │
│ │ ACTION — PER THE RECALL            │ │
│ │ Stop using the product and contact…│ │
│ │ ──────────────────────────────────│ │
│ │ CPSC · 19V088   checked 2023-01-09 │ │  ← receipt; locator + URL WRAP, never
│ └────────────────────────────────────┘ │     truncate a citation (provenance is
└───────────────────────────────────────┘     load-bearing — rubric).
```

- **Group ordering = by the group's worst tier** (ACT groups first, then ADDRESS, then AWARE). Within a group, findings sort by tier too. This preserves the desktop severity-first reading on a small screen.
- **Collapsed header shows the worst-tier chip + count** (`[ACT] · 1 finding`) and the **left edge-bar in that tier color** — so a user scanning collapsed headers triages by color/chip alone, no expansion needed. This is what kills the wall while keeping severity legible.
- **Default expansion state:** ACT and ADDRESS groups **start expanded** (you must see what to act on without a tap); AWARE and below **start collapsed**. Never auto-collapse an ACT finding behind a tap — the most important thing is always visible.
- **The lead ACT card** (biggest type, 6px bar) is the first finding in the first (ACT) group, expanded — same loud-via-size/weight/position treatment, reflowed: Fraunces hazard name steps down ~one size on XS so it doesn't overflow.
- **Receipts WRAP, never truncate.** `source.name · source.locator` + `checked as of {date}` must wrap to a second line on narrow rather than ellipsize — the citation is the proof and must stay readable/ tappable (≥44px link target, generous line-height).
- **`FindingCard` itself is unchanged** — it already uses responsive type (`text-[20px] sm:text-[22px]`, `px-5 py-5 sm:px-6`). Mobile just nests it inside the accordion group instead of the flat list.

### 5.3 Judge INSPECT expander — inline expander on phone, bottom-sheet on the densest views

The judge "Inspect" / "Why Warden checked this" trail (the two-receipts `DiscoveryTrail`, `UX_REWORK.md §6.3) needs a home on a small screen.

- **Default: inline `<details>` expander** below the receipt footer — same as desktop, reflowed. Caret rotates (`.disclosure-caret` exists). The WHY-WE-LOOKED / WHAT-WE-FOUND blocks stack vertically (they're side-considerations of one card):

```
│ ▸ Why Warden checked this              │  ← tap to expand inline
│ ┌────────────────────────────────────┐ │
│ │ WHY WE LOOKED                       │ │  ← block 1, mono receipt voice
│ │ You said "well water" and "near a   │ │     pathway as plain-language arrow
│ │ former air base." Warden inferred:  │ │     chain (route/transport only —
│ │  AFFF → soil/groundwater → your     │ │     NO health-outcome words)
│ │  well → ingestion.                  │ │
│ │ Grounded in: ATSDR PFAS [Tier 1] →  │ │  ← link, Tier-n mono badge
│ │ ─────────────────────────────────── │ │
│ │ WHAT WE FOUND                       │ │  ← block 2, the §3 source receipt
│ │ EPA UCMR for your system, 2026-…:   │ │
│ │ PFOA above the reporting level.     │ │
│ │ Source: EPA UCMR5 · PWSID … →       │ │  ← second link
│ └────────────────────────────────────┘ │
```

- **Where the trail is long or the judge "Inspect" carries the full machinery view** (gates run, confirmation seal, the heavier receipt-panel content), promote it to a **bottom-sheet** on S/XS: tapping `Inspect` slides a panel up from the bottom (to ~85vh, swipe-down or X to dismiss, backdrop dims the dossier). This keeps the dense machinery readable at full width without the card itself becoming a scroll-trap mid-accordion. Bottom-sheet respects safe-area inset at the bottom and `prefers-reduced-motion` (no slide → instant present).
- **Two receipts stay two labeled blocks** — never merge (rubric / `UX_REWORK.md` risk 6). On mobile they stack with a clear hairline divider and their two distinct labels.
- The pinned `Checked because of your context` neutral chip rides in the card header alongside the tier chip — unchanged, slate, never tier-colored.

### 5.4 "Considered & set aside" / aggregated initiatives line + suppressed toggle

```
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ✶ Also checked, from your context: 4  │  ← the anti-flood valve (§6.4). ONE
│   environmental pathways as of 2026-  │     calm slate line, ranked dead last
│   06-13 — nothing on file.    [show]  │     before suppressed. [show] expands
│                                       │     to §9-style record statements.
├───────────────────────────────────────┤
│ ┌─ <details> ──────────────────────┐  │
│ │ Show 21 set aside — common /      │  │  ← suppressed CONTEXT toggle, collapsed
│ │ non-specific                  ⌄   │  │     by default. Full-width tap row.
│ └───────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Checked CPSC, Prop 65, EPA · 2026-06- │  ← clean-coverage closing line when
│ 13. Records can change — Warden re-   │     applicable (anti-all-clear). Mono.
│ checks each time.                     │
├───────────────────────────────────────┤
│ ✓ scan complete · 6 sources · 4.2s    │  ← collapsed scan log stays available
│   — view                       [open] │     (§4 transition), one-line <details>
└───────────────────────────────────────┘
```

- The aggregated initiatives line, suppressed `<details>`, and collapsed scan log are all **existing full-width `<details>` patterns** — they reflow with zero structural change; just ensure the summary rows are ≥44px tap targets on mobile.
- **No-findings / clean dossier on mobile** is exactly the desktop §5.4 surface: headline *"Nothing on file for your items, as of today."* + per-group record statements + the `Records can change…` line + quiet slate dome band. **Never blank, never an all-clear, no checkmark, no green.** (See §11 — this is the mobile trap epicenter.)

---

## 6. Touch ergonomics, type scale, safe areas, motion

### 6.1 Tap targets

- **Every interactive element ≥44×44px** (Apple HIG) / 48px (Material) — buttons, chips, toggles, accordion headers, `<details>` summaries, citation links, `[edit]` affordances, suppressed/scan-log toggles.
- The current `h-[15px] w-[15px]` tap-water checkbox and tight `[edit]`/`re-parse` text links are **desktop-only sizes** — on mobile wrap them in ≥44px hit areas (the visual mark can stay small; the touch target expands).
- Chip rows get **≥8px gaps** so adjacent thumbs don't mis-tap; chips themselves ≥44px tall.
- Citation links inside receipts get a padded hit area and generous line-height so a wrapped URL is tappable without zooming.

### 6.2 The sticky thumb-reachable primary action

- On **S/XS** the primary action (`Start →`, `Next →`, `RUN AUDIT →`, `Run audit`) lives in a **sticky bottom bar** pinned to the bottom of the viewport, within `env(safe-area-inset-bottom)`. The thumb arc on a phone reaches the bottom third far more comfortably than a button buried mid-scroll.
- The bar has a **solid white fill + top hairline** (it overlaps the field / scrolling content — must be opaque, §2.3) and a subtle upward shadow to read as a layer.
- Pairs the primary (dark pill) with the secondary (`see a sample` / `use demo basket` / `Skip`) as a text link beside it — both in the thumb zone.
- On **M** the bar persists (portrait tablet still benefits). On **L** the bar dissolves and the action returns inline (the desktop `RUN AUDIT` pill in the request slip), per `UX_REWORK.md`.
- **Loading/disabled states** carry through: the existing `disabled:opacity-30` + `Auditing…` label apply to the sticky button.

### 6.3 Safe-area insets

- Respect `env(safe-area-inset-*)` on all four edges: the sticky bottom bar (bottom inset, the home-indicator gap), the masthead (top inset / notch / dynamic island), and side insets in landscape (notch side).
- The fixed dome canvas should extend *under* the insets (full-bleed atmosphere) but no readable content or tap target may sit in an inset region.

### 6.4 Type scale (responsive, `clamp`-driven)

Fonts are locked (Fraunces display, Newsreader body, IBM Plex Mono — `UX_REWORK.md §1`). Mobile only adjusts sizes; use `clamp()` so it scales smoothly rather than snapping at breakpoints.

| Role | Desktop (current) | Mobile target (S) | XS (<380) |
|---|---|---|---|
| Hero headline (Fraunces) | ~`text-[34px]`+ | ~28–30px | ~26px |
| Lead card hazard name | `34px` | ~26–28px | ~24px |
| Standard hazard name | `20–22px` | `20px` | `18px` |
| Body / severity basis (Newsreader) | `14–15.5px` | `15px` (do not go below ~15px for primary reading prose) | `14.5px` |
| Mono receipts / eyebrows / chips | `10–11px` | keep `11px` (mono stays legible small); never below 10px | `10–11px` |
| Counts numbers (Fraunces) | `22px` | `20–22px` | `20px` |

- **Body prose floor ≈15px** on mobile — receipts and severity-basis text are the substance; do not shrink them to fit. Let the accordion/scroll handle length instead.
- Mono can stay small (it's monospace, designed to read at 10–11px) — the receipt voice survives.
- Tighten line-length: cap readable prose at ~`38–42ch` within panels so lines don't run edge-to-edge on a wide phone.

### 6.5 Reduced motion

- Already wired (`prefers-reduced-motion` freezes `.reveal`, `.reveal-fade`, `.warden-pulse-dot`, `.warden-ellipsis`, `.warden-scan-bar`, `.disclosure-caret`, and routes the dome to static). **Honor it on every net-new mobile interaction:**
  - Bottom-sheet (judge inspect) → instant present, no slide.
  - Accordion expand/collapse → instant, no height animation.
  - Chip press feedback → no scale animation (a static selected state still reads).
  - Sticky-bar appearance → no transition.
- The dome static fallback must still carry **tier color** (§2.5) so reduced-motion users keep the sole severity signal.

---

## 7. Masthead / value-prop copy responsive

- **Masthead** (`UX_REWORK.md §1` / §8): `Warden` (Fraunces) + mono eyebrow `know what's around you` + `№ 001`.
  - On **S/XS** the eyebrow wraps **under** the wordmark (the current `flex items-end gap-3` row is too wide at 390px for `Warden` + tagline side-by-side). Stack them: `Warden` on top, `know what's around you` mono eyebrow beneath.
  - `№ 001` is already `hidden ... sm:block` in `page.tsx` — keep it hidden on XS, optionally show on S+. It's a flourish, not load-bearing.
  - `AuthMasthead` (flag-gated Clerk affordance) collapses to an icon/avatar on mobile; inert without keys (unchanged behavior).
- **Hero value-prop** (golden circle, §3.0): the three beats stack in a single solid panel. Headline `clamp`s down (§6.4); the one-paragraph body stays intact (don't truncate the HOW/WHAT — it's the whole pitch). CTAs (`Start →` / `see a sample`) move to the sticky bar on S/XS.
- **Register discipline is unchanged on mobile** (`UX_REWORK.md §0/§8`): WELCOME-warm only in masthead/hero/enrollment/empty; RECORD-factual everywhere in findings/receipts/scan rows. A small screen does not earn a shortcut that blurs them. Never "public record" / "verdict" / any health claim about a specific item in user copy.

---

## 8. Implementation notes for the UX coder (mobile-first, one pass)

Build the rework **mobile-first**, then layer desktop at `lg`. The mobile column *is* the base layout; the desktop split/grid is the enhancement. Concretely:

1. **One component tree, responsive props — not two builds.** Every component in `UX_REWORK.md §7` renders on both; the differences here are container layout (single column vs grid/split), sizing (`clamp` type, ≥44px targets), and two net-new mobile *containers*: the **by-item accordion** wrapper around `FindingCard` (§5.2) and the **bottom-sheet** for the judge inspect on small screens (§5.3). The cards, scan rows, chips, receipts themselves are shared.
2. **Reuse the existing responsive seams.** `page.tsx` already uses `sm:`/`lg:` and a `lg:grid-cols-[400px_1fr]` that collapses below `lg`; `FindingCard` already steps type at `sm:`; the counts row already `flex-wrap`s; `ScanLog` already has `collapsible` + `max-h-[52vh]`. Extend these, don't replace them.
3. **Particle field (§2):**
   - Add the low point-count tier (~1500) for weak phones; keep 3000 mid / 7000 desktop. Do not raise any tier.
   - Gate `frameloop` / `invalidate()` cadence on `phase` + `tier`: throttle (~30fps or demand) when calm and not scanning; full `always` during scan and at ADDRESS/ACT.
   - Add `IntersectionObserver` + `visibilitychange` → `frameloop="never"` when the canvas is off-screen/backgrounded. This requires the **contained-band** treatment (§2.3) so "off-screen" is real (the current `fixed inset-0` never scrolls away — change the mask/containment so the dome is a top band on mobile, not a full-bleed fixed layer behind everything).
   - Bias the radial mask upward on portrait (`circle at 50% ~30%`) and fade out before the first content panel.
   - Extend the static/no-WebGL fallback to tint by `TIER_CONFIG[tier].color` so the tier signal survives reduced-motion.
4. **Panels are opaque on mobile (hard, §2.3 / `UX_REWORK.md §1.1`).** Replace `bg-white/70` (textarea) and `bg-white/60`/`bg-white/50` (area box, scan-log details, suppressed details) with solid `#ffffff` (or `rgba(255,255,255,0.96)`) at S/XS. No body text, label, input, or receipt floats on the field on a phone.
5. **Enrollment (§3) — the priority:**
   - `EnrollFlow` = one `QuestionCard` per screen on mobile, advanced by the sticky `Next →`; a top tick-strip replaces the desktop left rail.
   - **#042 predicted chips:** tap-to-keep (pre-kept `✓`), neutral slate, possession proxies only (no health/age-as-health). Profile doubles as §11 context.
   - **#042 typeahead:** instant local dict first (no network lag on cellular), debounced Haiku canonicalization as a non-blocking upgrade; suggestion list drops directly under the input, above the keyboard.
   - **#042c free-text:** Sonnet parse on ~600ms debounce → `ItemPill`s with `.reveal`; **fallback to line-split** on parse failure — never block `Next`.
   - **Keyboard handling:** when the soft keyboard opens, the sticky bottom bar and any suggestion list must reposition above it (use `visualViewport` / `interactiveWidget=resizes-content` and `scroll-padding`). The active input must never be hidden behind the keyboard. `inputMode="numeric"` for ZIP; `autocapitalize/autocorrect off` on the item/typeahead fields.
   - Confirm slip (§3.5) reflows to one column; `[edit]` re-opens the matching question.
6. **Live scan (§4):** stack the dome band on top, `ScanLog` below in an opaque panel. Pin the dome band above the fold for the scan duration. Keep `aria-live="polite"`/`role="log"`. Honest motion only (no fabricated delays). All states from `UX_REWORK.md §4.5` apply unchanged.
7. **Dossier (§5):** wrap findings in a **by-item accordion**; group ordered by worst tier; collapsed headers show worst-tier chip + count + left bar; ACT/ADDRESS groups default-expanded, AWARE+ default-collapsed; the lead ACT card is always visible. Judge inspect = inline `<details>` by default, **bottom-sheet** for the dense machinery view on S/XS. Receipts wrap, never truncate. Aggregated initiatives line + suppressed `<details>` + collapsed scan log reflow as-is with ≥44px summary rows.
8. **Touch & a11y (§6):** ≥44px everywhere; sticky bottom action within `safe-area-inset-bottom`; `clamp()` type with a ~15px prose floor; honor `prefers-reduced-motion` on all net-new interactions (bottom-sheet, accordion, chip press, sticky bar). Color is never the only severity affordance — tier WORD always rides with the tier color (scan ticks, chips).
9. **#043 recently-viewed (§3.6):** the one-tap re-run strip + monitoring-hook dot — only when Clerk keys present and history exists; inert otherwise (mirror `AuthMasthead`'s flag-gating). RECORD-register factual phrasing on the "new recall since last audit" line.
10. **Do not touch the rubric invariants (§0).** Tier = sole severity color, no green/all-clear, reporter-not-advisor, origin-blind dome, two-receipts honesty, text always on solid panels. Screen size relaxes none of these.

---

## 9. Per-phase mobile state summary (quick reference)

| Phase | Dome (mobile) | Layout | Sticky action | Anti-all-clear guard |
|---|---|---|---|---|
| **Hero / first load** | Top band ~38vh, IDLE slate, throttled fps | Hero panel below band | `Start →` / `see a sample` | (n/a — pre-audit) |
| **Enroll Q1–Q3** | Top band, IDLE slate, throttled | One QuestionCard + top tick-strip | `Skip` / `Next →` | (n/a) |
| **Confirm slip** | Top band, IDLE | One-column request slip | `RUN AUDIT →` / `use demo basket` | (n/a) |
| **Scan** | **Lead band ~50vh, eases to running top tier, full fps, ACT breach pulse** | Dome band + streaming log panel below | (none — scan running) | Empty rows stream as neutral completed lines; clean path streams, never blank |
| **Dossier (findings)** | Calmer band, holds final top tier, throttled once settled | By-item accordion + ledger + initiatives + suppressed | (inline next-audit / re-run) | Counts are a ledger not a grade |
| **Dossier (clean)** | **Quiet slate band — paired with explicit dated record statements** | Headline + record statements + `Records can change…` line | — | The dated statements carry meaning; field never implies safety |
| **Error (service down)** | Static/idle | ErrorCard, list preserved | `Try again` | — |
| **Reduced-motion / no-WebGL / low-power** | Static stipple, **tinted by tier color** | unchanged | unchanged | Tier color still present in static field |

---

## 10. Tablet notes (condensed)

- **Portrait tablet (M, 640–1023px):** "a big phone." Same single-column flow, wider content (max ~560px centered), more whitespace, fuller dome band. Sticky bottom bar persists (a tablet held in two hands still wants a thumb action). Some chip rows go two-up comfortably; the dossier accordion stays single-column but each card breathes more.
- **Landscape tablet (L, 1024px+):** the desktop layouts from `UX_REWORK.md` — enrollment centered panel, **scan split** (log left / dome center), dossier full-width over the dome, inline `RUN AUDIT`. No tablet-specific third layout.
- Touch targets stay ≥44px on tablet too (it's a touch device even at desktop widths) — do not assume a mouse just because the viewport is wide. Hover affordances must have a tap-equivalent.

---

## 11. Top mobile risks

1. **Field perf / battery on a real phone (highest technical risk).** A continuously-animating WebGL particle field is the classic mobile battery/fps killer, and a dropped-frame dome during the scan ruins the one moment that matters. Mitigations (§2.2): the low ~1500-point tier for weak devices, throttle-when-calm/full-fps-only-during-scan, `IntersectionObserver`/`visibilitychange` → pause off-screen, harder DPR cap on low tier, proactive static path under Low Power Mode. **Watch in review:** scrolling a long dossier must not pin the GPU (the field should pause when the band scrolls off), and the scan must hold 60fps on mid-range Android. If the phone gets warm during a dossier read, the throttle/visibility gating has failed.
2. **The all-clear-by-vibe trap, amplified on a calm phone screen (highest product risk).** On a small screen a quiet slate dome band + a couple of calm cards reads as "you're fine" even harder than on desktop — there's less surrounding context, and the dome band dominates the small viewport. Mitigations: clean/empty states are ALWAYS explicit dated record statements (never a blank or a bare calm field), the dome's calm = quiet-but-present slate (never green, never empty), the static fallback is *tinted by tier* not a soothing neutral wash, counts are a ledger not a grade, and empty scan rows are neutral completed lines. **The mobile-specific test:** screenshot every clean/quiet state on a 390px phone — if any could be captioned "Warden says I'm safe," it has failed (rubric §11 / `UX_REWORK.md` risk 1). The dated statement, not the field, must carry the meaning.
3. **Tap-target & legibility pitfalls (highest "death by a thousand cuts" risk).** The current build has desktop-only affordances that are mobile traps: the 15px tap-water checkbox, tight text-link `[edit]`/`re-parse`/citation links, translucent `bg-white/70`+`/60`+`/50` panels that let grain bleed through text, and a `RUN AUDIT` button that on a phone would sit mid-scroll instead of in the thumb zone. Each individually small; together they make the app feel un-built-for-mobile. Mitigations: ≥44px everywhere (§6.1), solid-white panels on mobile (§2.3/§4), sticky thumb action (§6.2), `clamp` type with a ~15px prose floor and wrapping receipts that never truncate a citation (§5.2/§6.4), safe-area insets (§6.3). **Watch:** any receipt URL that ellipsizes (the citation is the proof and must stay tappable/readable), any body text floating on the field, any tap target under 44px, and the keyboard hiding the active input or the suggestion list during enrollment.
4. **Enrollment friction collapsing back into a form (priority-feature risk).** The whole #042 win is "tap a few chips, never type a list on a phone keyboard." If the predicted chips don't appear, the typeahead lags on cellular (network round-trip per keystroke), or the live parse is hidden/slow, mobile enrollment degrades into the exact government-intake feeling the rework set out to kill. Mitigations: predicted chips tap-to-keep as the default path (§3.4a), **instant local typeahead** before any network (§3.4b), visible/debounced parse with a never-block line-split fallback (§3.4c), demo basket always one tap away. **Watch:** the typeahead must feel instant on 3G; the parse must never trap the user behind a stalled request.
5. **The judge-inspect / two-receipts trail breaking on a small screen.** Forced into a tiny inline expander, the WHY-WE-LOOKED / WHAT-WE-FOUND blocks could get cramped, merged-looking, or turn the card into a scroll-trap mid-accordion — losing the two-receipts honesty (`UX_REWORK.md` risk 6). Mitigation: inline `<details>` for the light trail, **bottom-sheet at full width** for the dense machinery view on S/XS (§5.3), with the two blocks always rendered as two clearly-labeled, hairline-divided sections and two distinct links. **Watch:** the two receipts must never visually collapse into one, even at 390px.
