"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ScanEvent, Tier } from "@/lib/types";

// LIVE AGENTIC SCAN (rubric §12 / Gate 13). During the run this is the HERO of the
// loading state — a prominent, framed "watching the clerk work the stacks" moment,
// not a buried log. Each real step event streams in as a mono receipt row; the row's
// status drives its state and the event's tier drives the ONLY color (a small square
// tier-tick). After completion it collapses to an inviting "what Warden checked" line.
//
// Honest motion only — rows animate when REAL events land, never on a timer. The
// clean/empty path streams too (an "empty" row is a quiet completed line, never relief).

const TIER_KLASS: Record<Tier, string> = {
  ACT: "tier-act",
  ADDRESS: "tier-address",
  AWARE: "tier-aware",
  CONTEXT: "tier-context",
};

// Status glyph — neutral typographic marks, never iconography that reads "safe".
function statusGlyph(status: ScanEvent["status"]): string {
  switch (status) {
    case "started":
      return "›";
    case "done":
      return "·";
    case "empty":
      return "–";
    case "error":
      return "!";
    default:
      return "·";
  }
}

// A §11 context-driven step is declared honestly with the pinned phrase. We detect
// it from the phase marker; the phrase states WHY we looked, never what we found.
function isContextStep(e: ScanEvent): boolean {
  const p = (e.phase ?? "").toLowerCase();
  return p.includes("context") || p.includes("inferred") || p.includes("discovery");
}

function ScanRow({ e }: { e: ScanEvent }) {
  const tierKlass = e.tier ? TIER_KLASS[e.tier] : "";
  const ctx = isContextStep(e);
  const running = e.status === "started";
  return (
    <div
      className={`reveal-fade ${tierKlass} flex items-start gap-2.5 font-mono text-[11px] leading-[1.5]`}
    >
      {/* tier-tick (square) — the sole severity signal; hollow/neutral when no tier. */}
      <span
        aria-hidden
        className={`mt-[4px] tier-tick shrink-0 ${e.tier ? "" : "tier-tick--hollow"}`}
      />
      <span className="w-3 shrink-0 text-center text-[var(--ink-faint)]">
        {statusGlyph(e.status)}
      </span>
      <span className="min-w-0 flex-1">
        {ctx && (
          <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            ✶ Checked because of your context ·
          </span>
        )}
        <span
          className={
            e.status === "error"
              ? "text-[var(--ink-soft)]"
              : e.tier
              ? "text-[var(--ink)]"
              : "text-[var(--ink-soft)]"
          }
        >
          {e.detail}
        </span>
      </span>
      {running && <span className="warden-scan-bar mt-[6px] shrink-0" aria-hidden />}
    </div>
  );
}

export default function ScanLog({
  events,
  running,
  collapsible = false,
  startedAt,
}: {
  events: ScanEvent[];
  running: boolean;
  collapsible?: boolean;
  startedAt?: number | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view while the scan runs.
  useEffect(() => {
    if (running) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [events.length, running]);

  // Distinct sources touched + a started/completed tally for the footer ticker.
  const { sources, doneCount } = useMemo(() => {
    const src = new Set<string>();
    let done = 0;
    for (const e of events) {
      if (e.source) src.add(e.source);
      if (e.status !== "started") done += 1;
    }
    return { sources: src.size, doneCount: done };
  }, [events]);

  const rows = (
    <div
      className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto pr-1"
      role="log"
      aria-live="polite"
      aria-label="Live scan steps"
    >
      {events.map((e) => (
        <ScanRow key={e.seq} e={e} />
      ))}
      <div ref={endRef} />
    </div>
  );

  // ── Collapsed (post-run) — inviting, not a buried "log". ─────────────────────
  if (collapsible) {
    return (
      <details className="reveal rounded-[3px] border bg-white/70 px-5 py-3.5 hairline-soft">
        <summary className="inline-flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
          <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
            ›
          </span>
          What Warden checked — {events.length} step{events.length === 1 ? "" : "s"}
        </summary>
        {rows}
      </details>
    );
  }

  // ── Live (during run) — the HERO of the loading state. ───────────────────────
  const elapsed =
    running && startedAt ? Math.max(0, (Date.now() - startedAt) / 1000) : null;

  return (
    <section
      className="reveal rounded-[3px] border bg-white/95 px-5 py-5 shadow-[0_18px_44px_-30px_rgba(28,27,24,0.4)] hairline sm:px-6 sm:py-6"
      data-testid="scan-hero"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {running && <span className="warden-pulse-dot" aria-hidden />}
          <p className="font-display text-[19px] font-medium leading-none text-[var(--ink)]">
            {running ? (
              <>
                Checking
                <span className="warden-ellipsis" aria-hidden />
              </>
            ) : (
              "Scan"
            )}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          live · the agentic record
        </p>
      </div>

      <p className="mt-2 max-w-prose font-mono text-[11px] leading-[1.55] text-[var(--ink-faint)]">
        Watching Warden work the stacks — one real step per source, as it lands.
      </p>

      {rows}

      {/* Footer ticker — honest counts; no fabricated progress. */}
      <div className="mt-4 flex items-center gap-2.5 border-t border-dashed hairline-soft pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        <span aria-hidden className="text-[var(--ink-soft)]">
          ▌
        </span>
        {running ? (
          <span>
            streaming · {doneCount} of {events.length || "…"} steps
            {sources > 0 ? ` · ${sources} source${sources === 1 ? "" : "s"}` : ""}
            {elapsed !== null ? ` · ${elapsed.toFixed(1)}s` : ""}
          </span>
        ) : (
          <span>
            done · {events.length} step{events.length === 1 ? "" : "s"} · {sources}{" "}
            source{sources === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </section>
  );
}
