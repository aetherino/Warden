"use client";

import { useState } from "react";
import ShieldLoader from "@/components/ShieldLoader";
import type { ShieldTier } from "@/components/InvisibleShield";
import type { Dossier, Finding, Tier } from "@/lib/types";

const DEMO_BASKET = [
  "Fisher-Price Rock 'n Play Sleeper",
  "Peloton Tread+ treadmill",
  "portable space heater",
  "lithium-ion power bank",
  "baby inclined sleeper",
];

// Tier -> presentation. The accent class drives the LEFT EDGE BAR + chip ONLY.
// It is the sole severity signal; card surfaces stay near-white. NO GREEN.
const TIER_UI: Record<Tier, { label: string; klass: string }> = {
  ACT: { label: "Act", klass: "tier-act" },
  ADDRESS: { label: "Address", klass: "tier-address" },
  AWARE: { label: "Aware", klass: "tier-aware" },
  CONTEXT: { label: "Context", klass: "tier-context" },
};

function fmtDate(s?: string | null) {
  if (!s) return null;
  const d = s.slice(0, 10);
  return d;
}

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
  const asOf = fmtDate(f.as_of);
  const isInferred = f.origin === "ai_inferred";

  return (
    <article className={`${ui.klass} paper-card ${lead ? "paper-card--lead" : ""} rounded-[3px] px-5 py-5 sm:px-6 sm:py-6`}>
      <header className="flex flex-wrap items-center gap-2.5">
        <TierChip tier={f.tier} />
        {/* origin chip is NEUTRAL slate, never tier-colored, never "found/detected" */}
        {isInferred && (
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
          lead ? "text-[28px] sm:text-[34px] font-semibold" : "text-[20px] sm:text-[22px] font-medium"
        }`}
      >
        {f.hazard_type}
      </h3>
      <p className="mt-1 font-mono text-[11px] tracking-wide text-[var(--ink-faint)]">
        on “{f.item}”
      </p>

      <p className={`mt-3 leading-[1.55] text-[var(--ink-soft)] ${lead ? "text-[15.5px]" : "text-[14px]"}`}>
        {f.severity_basis}
      </p>

      {f.condition && (
        <p className="mt-3 text-[13px] leading-[1.5] text-[var(--ink-soft)]">
          <span className="font-display italic text-[var(--ink)]">Conditional — </span>
          {f.condition}
        </p>
      )}

      {/* Action traces to the source's own instruction (rubric §3/§7). */}
      <div className="mt-4 border-t border-dashed hairline pt-3.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Action — per the recall
        </p>
        <p className={`mt-1.5 leading-[1.5] text-[var(--ink)] ${lead ? "text-[15px]" : "text-[14px]"}`}>
          {f.action}
        </p>
      </div>

      {/* Provenance reads like a printed receipt: mono face, locator + as_of. */}
      <footer className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t hairline-soft pt-3 font-mono text-[11px] text-[var(--ink-faint)]">
        <a
          href={f.source.url}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-[3px] transition-colors hover:text-[var(--ink)] hover:decoration-[var(--ink-soft)]"
        >
          {f.source.name} · {f.source.locator}
        </a>
        {asOf && <span>checked as of {asOf}</span>}
      </footer>
    </article>
  );
}

function CountStat({ tier, n }: { tier: Tier; n: number }) {
  const ui = TIER_UI[tier];
  return (
    <div className={`${ui.klass} flex items-baseline gap-2`}>
      <span className="font-display text-[22px] font-semibold leading-none text-[var(--ink)]">{n}</span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em]"
        style={{ color: "var(--accent)" }}
      >
        {ui.label}
      </span>
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shieldTier: ShieldTier = loading
    ? "IDLE"
    : dossier && !dossier.error
    ? (dossier.top_tier as ShieldTier)
    : "IDLE";

  async function audit(items: string[]) {
    setLoading(true);
    setErr(null);
    setDossier(null);
    try {
      const r = await fetch("/api/dossier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, context: {} }),
      });
      // The proxy can return a non-dossier error body — gate on HTTP status first.
      const data = (await r.json().catch(() => null)) as Partial<Dossier> | null;
      if (!r.ok || !data || data.error) {
        setErr("unreachable");
        setDossier(null);
        return;
      }
      // Only render when the shape is valid so a malformed body can't crash the page.
      if (!Array.isArray(data.findings) || !data.counts) {
        setErr("unreachable");
        setDossier(null);
        return;
      }
      setDossier(data as Dossier);
    } catch {
      setErr("unreachable");
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }

  const submit = () => {
    const items = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (items.length) audit(items);
  };

  const hasFindings =
    dossier &&
    !dossier.error &&
    Array.isArray(dossier.findings) &&
    !!dossier.counts;
  const findings = dossier?.findings ?? [];

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[var(--paper)]">
      {/* Particle field — fixed behind the record, the volumetric "coverage" dome.
          Softly masked at the extreme edges so the page stays paper-white at the
          margins, but the dome reads as a large atmospheric presence. Reacts to
          TIER only (origin-blind). */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center">
        <div
          className="h-[min(90vw,96vh)] w-[min(90vw,96vh)]"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at 50% 50%, #000 0%, rgba(0,0,0,0.7) 46%, rgba(0,0,0,0.18) 64%, transparent 75%)",
            maskImage:
              "radial-gradient(circle at 50% 50%, #000 0%, rgba(0,0,0,0.7) 46%, rgba(0,0,0,0.18) 64%, transparent 75%)",
          }}
        >
          <ShieldLoader tier={shieldTier} />
        </div>
      </div>

      {/* Header — masthead of the record. */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-end justify-between px-6 pb-6 pt-8 sm:px-8">
        <div className="flex items-end gap-3">
          <span className="font-display text-[30px] font-semibold leading-none tracking-tight text-[var(--ink)]">
            Warden
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--ink-faint)]">
            the public record, audited
          </span>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)] sm:block">
          № 001
        </span>
      </header>
      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8">
        <div className="border-t hairline" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-24 pt-8 sm:px-8 lg:grid-cols-[400px_1fr]">
        {/* Intake — the request slip. */}
        <section className="self-start lg:sticky lg:top-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
            Intake
          </p>
          <h1 className="font-display mt-2 text-[34px] font-semibold leading-[1.04] tracking-tight text-[var(--ink)]">
            What do you{" "}
            <span className="italic font-normal">own?</span>
          </h1>
          <p className="mt-3 max-w-sm text-[14px] leading-[1.55] text-[var(--ink-soft)]">
            One item per line. Warden checks each against the public regulatory record and
            returns a ranked, cited plan — the state of the record, never a verdict.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"e.g.\nPeloton Tread+ treadmill\nportable space heater"}
            className="mt-4 w-full resize-none rounded-[3px] border bg-white/70 p-3.5 text-[14px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline focus:border-[var(--ink-soft)] focus:outline-none"
            style={{ fontFamily: "var(--font-mono)" }}
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={submit}
              disabled={loading || !text.trim()}
              className="rounded-full bg-[var(--ink)] px-6 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {loading ? "Auditing…" : "Run audit"}
            </button>
            <button
              onClick={() => setText(DEMO_BASKET.join("\n"))}
              disabled={loading}
              className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--ink)] disabled:opacity-40"
            >
              Use demo basket
            </button>
          </div>

          <p className="mt-5 max-w-sm border-t hairline-soft pt-4 text-[12px] leading-[1.55] text-[var(--ink-faint)]">
            Ranked, cited, no health claims. Reports the public record as of today — never a
            “safe / unsafe” verdict.
          </p>
        </section>

        {/* Results — the dossier. */}
        <section className="min-h-[60vh]">
          {!dossier && !loading && !err && (
            <div className="flex h-full items-start pt-10">
              <p className="reveal-fade max-w-md font-display text-[19px] italic leading-[1.5] text-[var(--ink-soft)]">
                Enter what you own, or load the demo basket, then run an audit. Findings appear
                here — ranked by what actually matters, each with its receipt.
              </p>
            </div>
          )}

          {loading && (
            <div className="reveal-fade pt-12">
              <div className="flex items-center gap-3">
                <span className="warden-pulse-dot" aria-hidden />
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                  Checking the public record
                  <span className="warden-ellipsis" aria-hidden />
                </p>
              </div>
              <div className="mt-5 max-w-md space-y-2.5" aria-hidden>
                {["CPSC recalls", "CA Prop 65 notices", "EPA water violations"].map(
                  (s, i) => (
                    <div key={s} className="flex items-center gap-3">
                      <span
                        className="warden-scan-bar"
                        style={{ animationDelay: `${i * 0.45}s` }}
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                        {s}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {err && (
            <div className="reveal rounded-[3px] border bg-white px-5 py-5 hairline">
              <p className="font-display text-[19px] font-medium text-[var(--ink)]">
                Warden can’t reach the record right now.
              </p>
              <p className="mt-2 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
                The audit service didn’t respond. Make sure it’s running, then run the audit
                again — your list is still here.
              </p>
              <button
                onClick={submit}
                disabled={!text.trim()}
                className="mt-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--ink)] underline decoration-[var(--rule)] underline-offset-4 hover:decoration-[var(--ink-soft)] disabled:opacity-40"
              >
                Try again
              </button>
            </div>
          )}

          {hasFindings && (
            <div className="space-y-5">
              {/* Counts ledger + timestamp. */}
              <div className="reveal flex flex-wrap items-baseline gap-x-7 gap-y-3 border-b hairline pb-5">
                {(["ACT", "ADDRESS", "AWARE"] as Tier[]).map((t) => (
                  <CountStat key={t} tier={t} n={dossier!.counts[t]} />
                ))}
                {dossier!.counts.CONTEXT > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-[22px] font-semibold leading-none text-[var(--ink-soft)]">
                      {dossier!.counts.CONTEXT}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                      suppressed
                    </span>
                  </div>
                )}
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  generated{" "}
                  {dossier!.generated_at?.slice(0, 16).replace("T", " ")}
                </span>
              </div>

              {/* Findings — staggered reveal. The top row is the loud lead card. */}
              {findings.map((f, i) => (
                <div
                  key={i}
                  className="reveal"
                  style={{ animationDelay: `${0.06 + i * 0.07}s` }}
                >
                  <FindingCard f={f} lead={i === 0 && f.tier === "ACT"} />
                </div>
              ))}

              {/* Neutral no-action record statements (never an implied all-clear). */}
              {dossier!.record_statements.map((rs, i) => (
                <div
                  key={`rs-${i}`}
                  className="reveal rounded-[3px] border bg-white px-5 py-4 hairline"
                  style={{ animationDelay: `${0.06 + (findings.length + i) * 0.07}s` }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    No action on file
                  </p>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
                    {rs.statement}
                  </p>
                </div>
              ))}

              {findings.length === 0 &&
                dossier!.record_statements.length === 0 && (
                  <p className="reveal text-[14px] text-[var(--ink-soft)]">
                    Nothing actionable on file for these items.
                  </p>
                )}

              {/* Suppressed CONTEXT — labeled, on request, never alarmed. */}
              {dossier!.suppressed.length > 0 && (
                <details className="reveal rounded-[3px] border bg-white/60 px-5 py-3.5 hairline-soft">
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    Show {dossier!.suppressed.length} suppressed — ubiquitous / non-specific
                  </summary>
                  <div className="mt-4 space-y-4">
                    {dossier!.suppressed.map((f, i) => (
                      <FindingCard key={`s-${i}`} f={f} />
                    ))}
                  </div>
                </details>
              )}

              {dossier!.disclaimer && (
                <p className="border-t hairline-soft pt-4 font-mono text-[11px] leading-[1.6] text-[var(--ink-faint)]">
                  {dossier!.disclaimer}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
