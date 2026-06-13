"use client";

// JUDGE INSPECTION (rubric §7 trust surface). A per-finding "Inspect" expander
// rendered as a printed receipt slip (mono, near-solid paper) showing:
//   • judge.why        — why THIS tier (the reasoning, record voice)
//   • judge.confirmed  — re-fetched & confirmed AT THE SOURCE (a provenance signal,
//                        NOT an all-clear; no green, no "safe")
//   • judge.checks     — the gates that ran (matched-at-locator / compliance-scan /
//                        action-traced). "redacted" gates render honestly as withheld.
//
// Renders nothing if there is no judge block (graceful absence). Never tier-colored
// here — the inspector is machinery, not severity (color stays on the card's bar/chip).

import type { Finding } from "@/lib/types";
import { getJudge, judgeCheckStatusLabel } from "@/lib/judge";

function CheckGlyph({ status }: { status: "pass" | "info" | "redacted" }) {
  // Neutral typographic marks — never iconography that reads "safe".
  const glyph = status === "pass" ? "·" : status === "info" ? "›" : "—";
  return (
    <span
      aria-hidden
      className="mt-[1px] inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[2px] border text-[11px] hairline-soft text-[var(--ink-faint)]"
    >
      {glyph}
    </span>
  );
}

export default function JudgeInspector({ f }: { f: Finding }) {
  const judge = getJudge(f);
  if (!judge) return null;

  const why = typeof judge.why === "string" ? judge.why.trim() : "";
  const confirmed =
    judge.confirmed && typeof judge.confirmed === "object" ? judge.confirmed : null;
  const checks = Array.isArray(judge.checks) ? judge.checks : [];

  // Nothing useful to show -> don't render an empty expander.
  if (!why && !confirmed && checks.length === 0) return null;

  return (
    <details className="mt-3.5 reveal-fade" data-testid="inspect">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
        <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
          ›
        </span>
        Inspect — how Warden judged this
      </summary>

      <div className="receipt-panel mt-2.5 px-4 py-3.5">
        {/* WHY THIS TIER — the reasoning, in record voice. */}
        {why && (
          <section>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Why this tier
            </p>
            <p className="mt-1.5 font-mono text-[11.5px] leading-[1.6] text-[var(--ink)]">
              {why}
            </p>
          </section>
        )}

        {/* CONFIRMED AT SOURCE — a provenance stamp, never an all-clear. */}
        {confirmed && (
          <section className={why ? "mt-3.5" : ""}>
            <div className="confirm-seal inline-flex items-start gap-2 px-2.5 py-1.5">
              <span aria-hidden className="mt-[1px] font-mono text-[11px] text-[var(--ink-faint)]">
                {confirmed.ok ? "✓" : "·"}
              </span>
              <span className="font-mono text-[11px] leading-[1.55] text-[var(--ink-soft)]">
                <span className="uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                  {confirmed.ok ? "Re-fetched & confirmed at the source · " : "Source check · "}
                </span>
                {typeof confirmed.detail === "string" ? confirmed.detail : ""}
              </span>
            </div>
          </section>
        )}

        {/* THE GATES THAT RAN — matched-at-locator / compliance-scan / action-traced. */}
        {checks.length > 0 && (
          <section className="mt-3.5 border-t border-dashed hairline-soft pt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              Gates that ran
            </p>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c, i) => {
                const status =
                  c.status === "pass" || c.status === "info" || c.status === "redacted"
                    ? c.status
                    : "info";
                return (
                  <li key={`${c.name}-${i}`} className="flex items-start gap-2">
                    <CheckGlyph status={status} />
                    <span className="font-mono text-[11px] leading-[1.5] text-[var(--ink-soft)]">
                      <span className="text-[var(--ink)]">{c.name}</span>
                      {status === "redacted" ? (
                        <span className="ml-1.5 italic text-[var(--ink-faint)]">
                          — detail withheld
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[var(--ink-faint)]">
                          — {judgeCheckStatusLabel(status)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
