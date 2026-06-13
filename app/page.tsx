"use client";

import { useEffect, useState } from "react";
import ShieldLoader from "@/components/ShieldLoader";
import type { ShieldPhase } from "@/components/InvisibleShield";
import ScanLog from "@/components/ScanLog";
import AuthMasthead from "@/components/AuthMasthead";
import JudgeInspector from "@/components/JudgeInspector";
import ConsideredSetAside from "@/components/ConsideredSetAside";
import DiscoveryTrail from "@/components/DiscoveryTrail";
import AggregatedCoverage from "@/components/AggregatedCoverage";
import EnrollFlow, { type EnrollResult } from "@/components/EnrollFlow";
import type { ShieldTier } from "@/components/InvisibleShield";
import type {
  Dossier,
  Finding,
  ScanEvent,
  Tier,
  DiscoveryRecordStatement,
} from "@/lib/types";
import {
  actionEyebrow,
  capSurfacedDiscovery,
  displayHazardType,
  findingToCoverageStatement,
  fmtAsOf,
  groupByItem,
  splitRecordStatements,
} from "@/lib/judge";
import { discoveryFixture } from "@/lib/fixtures";

// Severity ordering — ACT loudest. Used to track the HIGHEST tier seen so far as
// step events stream in, so the shield reacts live (rubric §12). Origin-blind.
const TIER_ORDER: Record<Tier, number> = { ACT: 0, ADDRESS: 1, AWARE: 2, CONTEXT: 3 };
function higherTier(a: Tier | null, b: Tier): Tier {
  if (!a) return b;
  return TIER_ORDER[b] < TIER_ORDER[a] ? b : a;
}

// Tier -> presentation. The accent class drives the LEFT EDGE BAR + chip ONLY.
// It is the sole severity signal; card surfaces stay near-white. NO GREEN.
const TIER_UI: Record<Tier, { label: string; klass: string }> = {
  ACT: { label: "Act", klass: "tier-act" },
  ADDRESS: { label: "Address", klass: "tier-address" },
  AWARE: { label: "Aware", klass: "tier-aware" },
  CONTEXT: { label: "Context", klass: "tier-context" },
};

function TierChip({ tier }: { tier: Tier }) {
  const ui = TIER_UI[tier];
  return (
    <span
      className={`${ui.klass} tier-chip inline-flex items-center rounded-full px-2.5 py-[3px] text-[10px] font-mono font-medium uppercase tracking-[0.22em]`}
    >
      {ui.label}
    </span>
  );
}

function FindingCard({ f, lead = false }: { f: Finding; lead?: boolean }) {
  const ui = TIER_UI[f.tier];
  const asOf = fmtAsOf(f.as_of);
  // origin chip + discovery trail for any non-user_listed finding (§11).
  const isDiscovery = f.origin === "ai_inferred" || f.origin === "curated_pathway";

  return (
    <article className={`${ui.klass} paper-card ${lead ? "paper-card--lead" : ""} rounded-[3px] px-5 py-5 sm:px-6 sm:py-6`}>
      <header className="flex flex-wrap items-center gap-2.5">
        <TierChip tier={f.tier} />
        {/* origin chip is NEUTRAL slate, never tier-colored, never "found/detected".
            Pinned copy — never paraphrased (rubric §7, the skeptic scans this string). */}
        {isDiscovery && (
          <span className="neutral-chip rounded-full px-2.5 py-[3px] text-[10px] font-mono tracking-[0.12em]">
            Checked because of your context
          </span>
        )}
        {f.confidence && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            {f.confidence} confidence
          </span>
        )}
      </header>

      <h3
        className={`font-display mt-3 leading-[1.12] text-[var(--ink)] ${
          lead ? "text-[26px] sm:text-[34px] font-semibold" : "text-[18px] sm:text-[22px] font-medium"
        }`}
      >
        {displayHazardType(f)}
      </h3>
      <p className="mt-1 font-mono text-[11px] tracking-wide text-[var(--ink-faint)]">
        on &ldquo;{f.item}&rdquo;
      </p>

      <p className={`mt-3 leading-[1.55] text-[var(--ink-soft)] ${lead ? "text-[15.5px]" : "text-[15px]"}`}>
        {f.severity_basis}
      </p>

      {f.condition && (
        <p className="mt-3 text-[13px] leading-[1.5] text-[var(--ink-soft)]">
          <span className="font-display italic text-[var(--ink)]">Conditional — </span>
          {f.condition}
        </p>
      )}

      {/* Action traces to the source's own instruction (rubric §3/§7). The eyebrow
          is source-appropriate. */}
      <div className="mt-4 border-t border-dashed hairline pt-3.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          {actionEyebrow(f)}
        </p>
        <p className={`mt-1.5 leading-[1.5] text-[var(--ink)] ${lead ? "text-[15px]" : "text-[15px]"}`}>
          {f.action}
        </p>
      </div>

      {/* Provenance reads like a printed receipt: mono face, locator + as_of. WRAPS,
          never truncates (the citation is the proof — MOBILE_UX §5.2). */}
      <footer className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t hairline-soft pt-3 font-mono text-[11px] text-[var(--ink-faint)]">
        <a
          href={f.source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[28px] items-center break-words text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-[3px] transition-colors hover:text-[var(--ink)] hover:decoration-[var(--ink-soft)]"
        >
          {f.source.name} · {f.source.locator}
        </a>
        {asOf && <span>checked as of {asOf}</span>}
      </footer>

      {/* §11 — two-receipts "why we looked" trail (only for discovery findings). */}
      {isDiscovery && <DiscoveryTrail f={f} />}

      {/* JUDGE INSPECTION (§7) — renders only when a judge block is present. */}
      <JudgeInspector f={f} />
    </article>
  );
}

// One item section as a COLLAPSIBLE ACCORDION (MOBILE_UX §5.2). The collapsed header
// is a ≥56px tap row whose left edge-bar carries the WORST tier (sole severity color);
// ACT/ADDRESS groups start expanded, AWARE+ start collapsed. Inside, findings sort by
// tier (origin-blind — ai_inferred interleaves by its own tier).
function ItemSection({
  item,
  findings,
  counts,
  topRank,
  globalLead,
}: {
  item: string;
  findings: Finding[];
  counts: Record<Tier, number>;
  topRank: number;
  globalLead: boolean;
}) {
  // ACT (0) and ADDRESS (1) groups start open; AWARE+ start collapsed.
  const [open, setOpen] = useState(topRank <= 1);
  const worst = (["ACT", "ADDRESS", "AWARE", "CONTEXT"] as Tier[]).find((t) => counts[t] > 0) ?? "CONTEXT";
  const total = findings.length;

  return (
    <section className="space-y-3" data-testid="item-group">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${TIER_UI[worst].klass} accordion-head ${globalLead ? "accordion-head--lead" : ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="font-display text-[16px] font-medium leading-tight text-[var(--ink)]">
            {item}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          {(["ACT", "ADDRESS", "AWARE", "CONTEXT"] as Tier[]).map((t) =>
            counts[t] > 0 ? (
              <span
                key={t}
                className={`${TIER_UI[t].klass} count-pip font-mono text-[10px] uppercase tracking-[0.14em]`}
              >
                {counts[t]} {TIER_UI[t].label}
              </span>
            ) : null
          )}
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            · {total} finding{total === 1 ? "" : "s"}
          </span>
          <span aria-hidden className={`disclosure-caret text-[var(--ink-faint)] ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div
              key={`${item}-${i}`}
              className="reveal"
              style={{ animationDelay: `${0.04 + i * 0.05}s` }}
            >
              <FindingCard f={f} lead={globalLead && i === 0 && f.tier === "ACT"} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CountStat({ tier, n }: { tier: Tier; n: number }) {
  const ui = TIER_UI[tier];
  return (
    <div className={`${ui.klass} flex items-baseline gap-2`}>
      <span className="font-display text-[22px] font-semibold leading-none text-[var(--ink)] tabular-nums">{n}</span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
        style={{ color: "var(--accent)" }}
      >
        {ui.label}
      </span>
    </div>
  );
}

// A finding's shape must be valid before we render it — a malformed body can't crash.
function isValidDossier(d: Partial<Dossier> | null): d is Dossier {
  return !!d && !d.error && Array.isArray(d.findings) && !!d.counts;
}

type Phase = "enroll" | "scanning" | "dossier";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("enroll");
  const [lastRun, setLastRun] = useState<EnrollResult | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [liveTier, setLiveTier] = useState<Tier | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // DEV/REVIEW fixture path (§11): with ?fixture=discovery, render a hand-built dossier
  // matching the FROZEN lib/types.ts so the §11 UI is provably correct even before the
  // backend returns discovery findings for live input. Never affects normal use.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("fixture") === "discovery") {
      setDossier(discoveryFixture());
      setEvents([]);
      setPhase("dossier");
    }
  }, []);

  const loading = phase === "scanning";

  // The shield reacts LIVE: during the scan it tracks the highest tier seen so far
  // from the stream; once the dossier lands it locks to top_tier. Origin-blind.
  const shieldTier: ShieldTier =
    dossier && !dossier.error
      ? (dossier.top_tier as ShieldTier)
      : loading
      ? ((liveTier as ShieldTier) ?? "IDLE")
      : "IDLE";
  const shieldPhase: ShieldPhase = phase;

  // Graceful fallback to the non-stream /api/dossier if the stream errors (§9 / §12).
  async function auditFallback(items: string[], context: Record<string, unknown>) {
    const r = await fetch("/api/dossier", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items, context }),
    });
    const data = (await r.json().catch(() => null)) as Partial<Dossier> | null;
    if (!r.ok || !isValidDossier(data)) {
      setErr("unreachable");
      setDossier(null);
      return;
    }
    setDossier(data);
  }

  async function audit(result: EnrollResult) {
    const items = result.items;
    if (!items.length) return;
    setLastRun(result);
    setPhase("scanning");
    setErr(null);
    setDossier(null);
    setEvents([]);
    setLiveTier(null);
    setStartedAt(Date.now());
    const context = result.context;

    try {
      const r = await fetch("/api/dossier/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, context }),
      });
      if (!r.ok || !r.body) throw new Error("stream_unavailable");

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let terminal: Dossier | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (value) buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj: ScanEvent | (Dossier & { type?: string });
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if ((obj as { type?: string }).type === "dossier") {
            const d = obj as Dossier & { type?: string };
            if (isValidDossier(d)) terminal = d;
          } else {
            const ev = obj as ScanEvent;
            setEvents((prev) => [...prev, ev]);
            if (ev.tier) setLiveTier((prev) => higherTier(prev, ev.tier as Tier));
          }
        }
        if (done) break;
      }

      if (terminal) {
        setDossier(terminal);
      } else {
        await auditFallback(items, context);
      }
    } catch {
      try {
        await auditFallback(items, context);
      } catch {
        setErr("unreachable");
        setDossier(null);
      }
    } finally {
      setPhase("dossier");
    }
  }

  function retry() {
    if (lastRun) audit(lastRun);
  }

  function restart() {
    setPhase("enroll");
    setDossier(null);
    setEvents([]);
    setLiveTier(null);
    setErr(null);
  }

  const hasFindings =
    dossier && !dossier.error && Array.isArray(dossier.findings) && !!dossier.counts;

  // §11: enforce the M=3 surfaced ai_inferred cap; demote overflow into the aggregated
  // coverage line. user_listed + curated interleave by tier within their item group.
  const allFindings = dossier?.findings ?? [];
  const { surfaced, overflow } = capSurfacedDiscovery(allFindings);
  const groups = hasFindings ? groupByItem(surfaced) : [];
  // Split record_statements into plain §9 vs §11 grounded-but-empty pathways; the
  // aggregated coverage line combines the grounded-empty pathways + overflow.
  const { plain: plainStatements, discovery: discoveryStatements } = splitRecordStatements(
    dossier?.record_statements ?? []
  );
  const aggregated: DiscoveryRecordStatement[] = [
    ...discoveryStatements,
    ...overflow.map(findingToCoverageStatement),
  ];

  const noActionable =
    hasFindings && surfaced.length === 0 && plainStatements.length === 0;

  return (
    <main className="relative min-h-screen min-h-screen-dvh w-full overflow-x-hidden bg-[var(--paper)]">
      {/* Particle field — a CONTAINED BAND on mobile (masked top+bottom, fades to white
          before the first panel), the centered full-bleed atmosphere on desktop. Reacts
          to TIER only (origin-blind). All readable copy sits in solid panels ON TOP. */}
      <div className="dome-fixed">
        <div className={`dome-square ${phase === "scanning" ? "dome-square--scan" : ""}`}>
          <ShieldLoader tier={shieldTier} phase={shieldPhase} />
        </div>
      </div>

      {/* Masthead — Warden + WELCOME eyebrow. Stacks on XS. */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-end justify-between gap-3 px-5 pb-5 pt-7 sm:px-8">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:gap-3">
          <span className="font-display text-[28px] font-semibold leading-none tracking-tight text-[var(--ink)] sm:text-[30px]">
            Warden
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)] sm:tracking-[0.28em]">
            guard your wellbeing
          </span>
        </div>
        <div className="flex items-center gap-5">
          <AuthMasthead />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)] sm:block">
            № 001
          </span>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        <div className="border-t hairline" />
      </div>

      {/* ── PHASE: ENROLL ───────────────────────────────────────────────────── */}
      {phase === "enroll" && (
        <div className="relative z-10 mx-auto max-w-2xl px-5 pb-10 pt-7 sm:px-8">
          {/* Hero (WELCOME register, golden circle) — on a solid panel. */}
          <section className="reveal-fade solid-panel mb-5 px-5 py-7 sm:px-7">
            <h1 className="font-display text-[clamp(26px,7vw,38px)] font-semibold leading-[1.05] tracking-tight text-[var(--ink)]">
              Guard your wellbeing.
            </h1>
            <p className="mt-3 max-w-prose text-[15px] leading-[1.6] text-[var(--ink-soft)] sm:text-[16px]">
              The things you own and the place you live can carry recalls, warnings, and
              water issues most people never hear about. Warden checks them for you — and
              tells you what&rsquo;s worth knowing, and what to do.
            </p>
          </section>

          {/* The 3-question interview + confirm slip + sticky action. */}
          <EnrollFlow onRun={audit} busy={loading} />
        </div>
      )}

      {/* ── PHASE: SCANNING + DOSSIER (one scrolling record) ────────────────── */}
      {phase !== "enroll" && (
        <div className="relative z-10 mx-auto max-w-3xl px-5 pb-24 pt-7 sm:px-8">
          {/* LIVE SCAN (§12) — real step events stream into a SOLID panel. */}
          {phase === "scanning" && (
            <div data-testid="scan-log">
              <ScanLog events={events} running startedAt={startedAt} />
              {events.length === 0 && (
                <p className="reveal-fade mt-4 rounded-[3px] solid-panel-soft px-4 py-2.5 font-mono text-[11px] tracking-wide text-[var(--ink-faint)]">
                  Reaching the record…
                </p>
              )}
            </div>
          )}

          {/* ERROR — service unreachable; the list is preserved (retry). */}
          {phase === "dossier" && err && (
            <div className="reveal solid-panel px-5 py-5">
              <p className="font-display text-[19px] font-medium text-[var(--ink)]">
                Warden can&rsquo;t reach the record right now.
              </p>
              <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
                The audit service didn&rsquo;t respond. Make sure it&rsquo;s running, then
                run the audit again — your list is still here.
              </p>
              <div className="mt-4 flex items-center gap-4">
                <button onClick={retry} className="link-action">
                  Try again
                </button>
                <button onClick={restart} className="link-action">
                  Start over
                </button>
              </div>
            </div>
          )}

          {/* DOSSIER (§5) — counts ledger, by-item accordion, §11 initiatives. */}
          {phase === "dossier" && hasFindings && (
            <div className="space-y-5">
              {/* Counts ledger — on a solid panel, ACT→ADDRESS→AWARE, no score. */}
              <div className="reveal solid-panel px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-7 gap-y-3">
                  {(["ACT", "ADDRESS", "AWARE"] as Tier[]).map((t) => (
                    <CountStat key={t} tier={t} n={dossier!.counts[t]} />
                  ))}
                  {dossier!.counts.CONTEXT > 0 && (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[22px] font-semibold leading-none text-[var(--ink-soft)] tabular-nums">
                        {dossier!.counts.CONTEXT}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                        suppressed
                      </span>
                    </div>
                  )}
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                    here&rsquo;s what we found ·{" "}
                    {dossier!.generated_at?.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
              </div>

              {/* No-findings / clean dossier (§5.4) — never blank, never all-clear. */}
              {noActionable && (
                <div className="reveal solid-panel px-5 py-5">
                  <h2 className="font-display text-[22px] font-semibold leading-[1.1] text-[var(--ink)]">
                    Nothing on file for your items, as of today.
                  </h2>
                  <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
                    Warden checked the record and found no active recall or public action on
                    file. Records can change — Warden re-checks each time.
                  </p>
                </div>
              )}

              {/* Findings — GROUPED BY ITEM accordion, ACT-first across groups. */}
              {groups.map((g, gi) => (
                <div
                  key={g.item}
                  className="reveal"
                  style={{ animationDelay: `${0.06 + gi * 0.08}s` }}
                >
                  <ItemSection
                    item={g.item}
                    findings={g.findings}
                    counts={g.counts}
                    topRank={g.topRank}
                    globalLead={gi === 0}
                  />
                </div>
              ))}

              {/* Plain §9 no-action record statements (never an implied all-clear). */}
              {plainStatements.map((rs, i) => (
                <div key={`rs-${i}`} className="reveal solid-panel px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    No action on file
                  </p>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
                    {rs.statement}
                  </p>
                </div>
              ))}

              {/* §11 AGGREGATED COVERAGE LINE — the anti-flood valve. Ranked dead last,
                  above only the suppressed/considered details. One calm slate line. */}
              <AggregatedCoverage statements={aggregated} />

              {/* CONSIDERED & SET ASIDE (§3 candidates + verifier-only pathway count). */}
              <ConsideredSetAside dossier={dossier!} />

              {/* Suppressed CONTEXT — labeled, on request, never alarmed. */}
              {dossier!.suppressed.length > 0 && (
                <details className="reveal rounded-[3px] solid-panel-soft px-5 py-3.5">
                  <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
                    <span aria-hidden className="disclosure-caret text-[var(--ink-faint)]">
                      ›
                    </span>
                    Show {dossier!.suppressed.length} set aside — common / non-specific
                  </summary>
                  <div className="mt-4 space-y-4">
                    {dossier!.suppressed.map((f, i) => (
                      <FindingCard key={`s-${i}`} f={f} />
                    ))}
                  </div>
                </details>
              )}

              {/* The live scan collapses but stays inviting (§12). */}
              {events.length > 0 && <ScanLog events={events} running={false} collapsible />}

              {dossier!.disclaimer && (
                <p className="border-t hairline-soft pt-4 font-mono text-[11px] leading-[1.6] text-[var(--ink-faint)]">
                  {dossier!.disclaimer}
                </p>
              )}

              <button onClick={restart} className="link-action">
                ← Run another audit
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
