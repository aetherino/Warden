"use client";

// CONSIDERED & SET ASIDE (the triage-discipline disclosure). Lists dossier.rejected —
// candidates Warden weighed and deliberately did NOT surface. This dramatizes the
// restraint: Warden looked at more than it showed, and tells you what it set aside
// and why. Neutral framing throughout; rejected items carry NO tier color (they are
// not findings) and are never alarmist. Renders nothing when there's nothing to show.

import type { Dossier } from "@/lib/types";
import { getRejected, rejectedReasonLabel } from "@/lib/judge";

export default function ConsideredSetAside({ dossier }: { dossier: Dossier }) {
  const rejected = getRejected(dossier);
  if (rejected.length === 0) return null;

  return (
    <details
      className="reveal rounded-[3px] border bg-white/70 px-5 py-3.5 hairline-soft"
      data-testid="considered-set-aside"
    >
      <summary className="inline-flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
        <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
          ›
        </span>
        Considered &amp; set aside — {rejected.length} weighed, not surfaced
      </summary>

      <p className="mt-3 max-w-prose font-mono text-[11px] leading-[1.6] text-[var(--ink-faint)]">
        Warden weighed these and set them aside — they didn&rsquo;t clear the bar to
        show as findings. Listed for the record, with the reason.
      </p>

      <ul className="mt-3 space-y-3">
        {rejected.map((r, i) => (
          <li
            key={`${r.item}-${i}`}
            className="border-t border-dashed hairline-soft pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              {/* NO tier color — these are not findings. Neutral slate only. */}
              <span className="font-mono text-[12px] text-[var(--ink)]">
                {r.candidate}
              </span>
              <span className="neutral-chip rounded-full px-2 py-[2px] font-mono text-[9.5px] uppercase tracking-[0.14em]">
                {rejectedReasonLabel(r.reason)}
              </span>
              {r.item && (
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  for &ldquo;{r.item}&rdquo;
                </span>
              )}
            </div>
            {r.detail && (
              <p className="mt-1.5 font-mono text-[11px] leading-[1.55] text-[var(--ink-soft)]">
                {r.detail}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
