"use client";

// §11 AGGREGATED COVERAGE LINE (UX_REWORK §6.4) — the ANTI-FLOOD valve. Every
// grounded-but-empty pathway (DiscoveryRecordStatement) — and any surfaced-cap
// overflow — collapses into ONE calm, bottom-ranked line, never one-row-per-pathway.
//
// Slate, mono, never an alarm, never ADDRESS/ACT, never green. Expandable to a quiet
// list of WHAT was checked (pathway + source queried + "nothing on file as of {date}"),
// each a §9-style record statement. This is the primary defense against flooding the
// user with initiatives: investigate up to 8, surface at most 3, everything else
// becomes this one quiet sentence.

import type { DiscoveryRecordStatement } from "@/lib/types";
import { fmtAsOf } from "@/lib/judge";

export default function AggregatedCoverage({
  statements,
}: {
  statements: DiscoveryRecordStatement[];
}) {
  if (!statements.length) return null;

  // A single representative date (most recent / first available).
  const asOf =
    fmtAsOf(statements.find((s) => s.as_of)?.as_of) ?? new Date().toISOString().slice(0, 10);
  const n = statements.length;

  return (
    <details
      className="reveal rounded-[3px] solid-panel-soft px-5 py-3.5"
      data-testid="aggregated-coverage"
    >
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
        <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
          ›
        </span>
        <span aria-hidden className="text-[var(--ink-faint)]">
          ✶
        </span>
        <span>
          Also checked, from your context: {n} environmental pathway{n === 1 ? "" : "s"} as
          of {asOf} — nothing on file.
        </span>
      </summary>

      <ul className="mt-3 space-y-3">
        {statements.map((s, i) => {
          const pathway = s.discovery?.pathway;
          const chain = pathway
            ? [
                pathway.source_category,
                pathway.environmental_media,
                pathway.point_of_exposure,
                pathway.exposure_route,
              ].filter(Boolean)
            : [];
          return (
            <li
              key={`${s.pathway_id}-${i}`}
              className="border-t border-dashed hairline-soft pt-3 first:border-t-0 first:pt-0"
            >
              {s.trigger_signal && (
                <p className="font-mono text-[11px] leading-[1.5] text-[var(--ink-faint)]">
                  from{" "}
                  <span className="italic text-[var(--ink-soft)]">
                    &ldquo;{s.trigger_signal}&rdquo;
                  </span>
                </p>
              )}
              {chain.length > 0 && (
                <p className="pathway-chain mt-1">
                  {chain.map((seg, j) => (
                    <span key={j}>
                      {j > 0 && (
                        <span className="arrow" aria-hidden>
                          →
                        </span>
                      )}
                      {seg}
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-1.5 font-mono text-[11px] leading-[1.55] text-[var(--ink-soft)]">
                {s.statement ||
                  `Checked ${(s.checked_sources ?? []).join(", ") || "the record"} as of ${
                    fmtAsOf(s.as_of) ?? asOf
                  } — no detection on file.`}
              </p>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
