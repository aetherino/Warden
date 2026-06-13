"use client";

import { useEffect, useRef } from "react";
import type { ScanEvent, Tier } from "@/lib/types";

// LIVE SCAN LOG (rubric §12): renders each real step event as it streams in, in a
// mono / receipt style matching the archival theme. Tier color is the SOLE severity
// signal (a small left-edge tier dot, reusing the .tier-* accent vars) — never an
// alarm-colored row, never green/all-clear. The clean/empty path streams too.

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

export default function ScanLog({
  events,
  running,
  collapsible = false,
}: {
  events: ScanEvent[];
  running: boolean;
  collapsible?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view while the scan runs.
  useEffect(() => {
    if (running) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [events.length, running]);

  const rows = (
    <div className="mt-4 max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
      {events.map((e) => {
        const tierKlass = e.tier ? TIER_KLASS[e.tier] : "";
        return (
          <div
            key={e.seq}
            className={`reveal-fade ${tierKlass} flex items-start gap-2.5 font-mono text-[11px] leading-[1.5]`}
          >
            {/* tier dot — the sole severity signal; absent (neutral) when no tier yet */}
            <span
              aria-hidden
              className="mt-[5px] inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{
                background: e.tier ? "var(--accent)" : "transparent",
                border: e.tier ? "none" : "1px solid var(--rule)",
              }}
            />
            <span className="w-3 shrink-0 text-center text-[var(--ink-faint)]">
              {statusGlyph(e.status)}
            </span>
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
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );

  if (collapsible) {
    return (
      <details className="reveal rounded-[3px] border bg-white/60 px-5 py-3.5 hairline-soft">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Scan log — {events.length} step{events.length === 1 ? "" : "s"} (what Warden checked)
        </summary>
        {rows}
      </details>
    );
  }

  return (
    <div className="reveal-fade">
      <div className="flex items-center gap-3">
        {running && <span className="warden-pulse-dot" aria-hidden />}
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">
          {running ? (
            <>
              Live scan
              <span className="warden-ellipsis" aria-hidden />
            </>
          ) : (
            "Scan log"
          )}
        </p>
      </div>
      {rows}
    </div>
  );
}
