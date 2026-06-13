# Shield FX — animating the "invisible shield" (backlog / "for later")

Status: **idea capture, not scheduled.** The current background is a tier-reactive
particle sphere (components/InvisibleShield.tsx). This note records the direction for
evolving it from a "naive swarm sphere" into a thing that reads + behaves as an
**invisible shield**, and for better loading/scan animation.

## Core principle: a shield is invisible until something touches it

A force field you can't see — until a threat hits it and it ripples, flares, and
reveals its shape at the point of contact. Makes the metaphor literal and gives every
state a reason to animate:
- Nothing wrong → you barely see it (sparse, calm, slow-breathing). Invisibility is the feature.
- Something detected → it reveals itself *exactly where* the threat is, in proportion to the hazard.

## States as behaviors (maps onto existing tier config)
- **Idle / NONE** (slate): slow breathing + faint patrol drift; never dead — it's watching.
- **Scanning / loading**: active vigilance (see below).
- **AWARE / CONTEXT** (steel-blue): field tightens/converges, cool glow rises — focusing.
- **ADDRESS** (amber): localized watch-zone — particles cluster + warm at one region; rest calm.
- **ACT** (red + breach): membrane RUPTURES — puncture, particle scatter, shockwave ring,
  red Fresnel flare at the breach point. The money-shot frame.

## Loading / scanning — bind to the live agent (§12 ScanEvent stream), not a generic spinner
1. **Sonar pings** — each source-check event emits a ripple ring across the shell.
2. **Lighthouse/radar sweep** — rotating wedge of brightened particles; one pass ≈ one source.
3. **Recruitment particles** — particles peel off to a source node and return carrying brightness.
4. **Progress arc** — thin arc traces the equator as sources complete.
5. **Settle on result** — on resolve, field redistributes into its result tier; loading→outcome is one continuous motion.
6. **Dossier handoff** — particles detach + hover where each finding card mounts, card crystallizes from them (replaces gray skeletons).

## Structural moves — read as a shield, not a ball
1. **Fresnel membrane** (shade by view-angle: glowing rim, faint face) — biggest single win.
2. **Negative-space core** — particles avoid a central void = the protected home/you.
3. **Twin shells** — sparse outer sensor perimeter + denser inner core, guarded space between.
4. **Faint geodesic lattice** — distribute on subdivided icosphere; looks engineered, not noise.
5. **Pushable surface** — cursor/scroll dents the membrane locally with a ripple.

## On-thesis binding (optional, strong)
Particles mean something: density grows with basket size; during scan they brighten in
waves matching the real event stream; a confirmed finding "freezes" one particle into a
fixed, cited point. The visual becomes the audit, rendered.

## Recommended hero combo for a first pass
Fresnel membrane + negative-space core (structure) → sonar-ping loading driven by
ScanEvents → breach rupture on ACT. Sells "invisible shield" with the least new
machinery; reuses the existing stream. Perf-safe: shader uniforms + per-particle
attributes on the existing THREE.Points, device-aware count, static fallback untouched.
