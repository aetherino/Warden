"use client";

// §11 DISCOVERY TRAIL (UX_REWORK §6.1–6.3) — the two-receipts honesty for an
// ai_inferred / curated_pathway finding. Rendered as an expandable trail below the
// finding's normal §3 receipt footer. TWO clearly-labeled, hairline-divided blocks
// that must NEVER collapse into one:
//
//   WHY WE LOOKED  — the pathway grounding (discovery.grounding): proof the PATHWAY
//                    is a real, established route. Plain-language arrow chain
//                    (route/transport only — no health-outcome words) + the Tier-1/2
//                    citation. This is the "why we looked", never "what we found".
//   WHAT WE FOUND  — the finding's own §3 source{} (rendered by the card footer; here
//                    we restate it as the second labeled receipt so the two proofs are
//                    visibly independent).
//
// Origin-blind: this adds NO severity color. The only AI signal is the neutral chip
// (in the card header) + this trail.

import type { Finding } from "@/lib/types";
import { fmtAsOf } from "@/lib/judge";

function OriginLabel({ origin }: { origin: Finding["origin"] }) {
  // The expand summary names the origin honestly. NEVER tier-colored.
  const label = origin === "curated_pathway" ? "Curated pathway" : "AI-inferred";
  return (
    <span className="tier-badge" aria-label={`Origin: ${label}`}>
      {label}
    </span>
  );
}

export default function DiscoveryTrail({ f }: { f: Finding }) {
  const d = f.discovery;
  if (!d) return null;

  const p = d.pathway;
  const g = d.grounding;
  const asOf = fmtAsOf(f.as_of);

  // The 5-element ATSDR pathway as a plain-language arrow chain — route/transport ONLY.
  const chain = [
    p.source_category,
    p.environmental_media,
    p.point_of_exposure,
    p.exposure_route,
  ].filter(Boolean);

  return (
    <details className="mt-3.5 reveal-fade" data-testid="discovery-trail">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
        <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
          ›
        </span>
        Why Warden checked this
        <span className="ml-1.5">
          <OriginLabel origin={f.origin} />
        </span>
      </summary>

      <div className="trail-panel mt-2.5 px-4 py-3.5">
        {/* ── BLOCK 1 — WHY WE LOOKED (the pathway grounding) ─────────────────── */}
        <section>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Why we looked
          </p>
          {d.trigger_signal && (
            <p className="mt-1.5 text-[13px] leading-[1.55] text-[var(--ink-soft)]">
              You said{" "}
              <span className="italic text-[var(--ink)]">
                &ldquo;{d.trigger_signal}&rdquo;
              </span>
              . Warden inferred a known route:
            </p>
          )}
          {chain.length > 0 && (
            <p className="pathway-chain mt-2">
              {chain.map((seg, i) => (
                <span key={i}>
                  {i > 0 && <span className="arrow" aria-hidden>→</span>}
                  {seg}
                </span>
              ))}
            </p>
          )}
          {/* Pathway grounding citation — Tier-1/2 source, a real "why we looked" receipt. */}
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="uppercase tracking-[0.12em]">Pathway grounded in:</span>
            <a
              href={g.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-[3px] hover:text-[var(--ink)]"
            >
              {g.source_name}
              {g.locator ? ` · ${g.locator}` : ""}
            </a>
            <span className="tier-badge">Tier {g.source_tier}</span>
          </div>
          {g.established_route_quote && (
            <p className="mt-2 border-l border-[var(--rule)] pl-2.5 text-[12px] italic leading-[1.5] text-[var(--ink-soft)]">
              &ldquo;{g.established_route_quote}&rdquo;
            </p>
          )}
        </section>

        {/* ── BLOCK 2 — WHAT WE FOUND (the finding's §3 source) ──────────────── */}
        <section className="mt-3.5 border-t border-dashed hairline pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            What we found
          </p>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-[var(--ink-soft)]">
            Then checked the record{asOf ? ` as of ${asOf}` : ""}: {f.severity_basis}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="uppercase tracking-[0.12em]">Source:</span>
            <a
              href={f.source.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-[3px] hover:text-[var(--ink)]"
            >
              {f.source.name}
              {f.source.locator ? ` · ${f.source.locator}` : ""}
            </a>
          </div>
        </section>
      </div>
    </details>
  );
}
