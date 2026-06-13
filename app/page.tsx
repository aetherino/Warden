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

const TIER_UI: Record<Tier, { label: string; chip: string; bar: string; ring: string }> = {
  ACT: { label: "ACT", chip: "bg-red-500/15 text-red-300 border-red-500/40", bar: "bg-red-500", ring: "border-red-500/30" },
  ADDRESS: { label: "ADDRESS", chip: "bg-amber-500/15 text-amber-300 border-amber-500/40", bar: "bg-amber-500", ring: "border-amber-500/30" },
  AWARE: { label: "AWARE", chip: "bg-sky-500/15 text-sky-300 border-sky-500/40", bar: "bg-sky-500", ring: "border-sky-500/30" },
  CONTEXT: { label: "CONTEXT", chip: "bg-slate-500/15 text-slate-300 border-slate-500/40", bar: "bg-slate-500", ring: "border-slate-500/30" },
};

function FindingCard({ f }: { f: Finding }) {
  const ui = TIER_UI[f.tier];
  return (
    <div className={`rounded-xl border ${ui.ring} bg-white/[0.03] p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold tracking-widest px-2 py-0.5 rounded-full border ${ui.chip}`}>{ui.label}</span>
        {f.confidence && <span className="text-[10px] text-slate-500 tracking-wide">{f.confidence} confidence</span>}
      </div>
      <h3 className="mt-2 text-sm font-medium text-white leading-snug">{f.hazard_type}</h3>
      <p className="text-xs text-slate-500 mt-0.5">on “{f.item}”</p>
      <p className="mt-2 text-[13px] text-slate-300 leading-relaxed">{f.severity_basis}</p>
      {f.condition && (
        <p className="mt-2 text-[12px] text-amber-300/90"><span className="text-slate-500">Condition:</span> {f.condition}</p>
      )}
      <div className="mt-3 rounded-lg bg-black/30 border border-white/5 p-2.5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Action (per the recall)</p>
        <p className="text-[13px] text-slate-200 leading-relaxed">{f.action}</p>
      </div>
      <a href={f.source.url} target="_blank" rel="noreferrer"
         className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300">
        ↳ {f.source.name} — {f.source.locator}
      </a>
      {f.as_of && <span className="ml-2 text-[10px] text-slate-600">as of {f.as_of.slice(0, 10)}</span>}
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shieldTier: ShieldTier = loading ? "IDLE" : dossier ? (dossier.top_tier as ShieldTier) : "IDLE";

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
      const data = (await r.json()) as Dossier;
      if (data.error) setErr(data.error + (data.disclaimer ? "" : ""));
      setDossier(data);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  const submit = () => {
    const items = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (items.length) audit(items);
  };

  return (
    <main className="relative w-screen min-h-screen overflow-x-hidden bg-[#0a0a0f]">
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 55% at 50% 45%, rgba(79,195,247,0.07) 0%, transparent 70%)" }} />

      {/* Shield backdrop */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[min(85vw,85vh)] h-[min(85vw,85vh)] opacity-90">
          <ShieldLoader tier={shieldTier} />
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tracking-tight text-white">Warden</span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-sky-500/30 text-sky-400 tracking-wider uppercase">v1</span>
        </div>
        <nav className="text-sm text-slate-500 tracking-wide">Hazard Audit</nav>
      </header>

      <div className="relative z-10 grid lg:grid-cols-[380px_1fr] gap-6 px-6 pb-20 max-w-6xl mx-auto">
        {/* Control panel */}
        <section className="lg:sticky lg:top-6 self-start rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5">
          <h1 className="text-lg font-semibold text-white">What do you own?</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">One item per line. Warden checks each against CPSC recalls and returns a ranked, cited plan — not a verdict.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"e.g.\nPeloton Tread+ treadmill\nportable space heater"}
            className="mt-3 w-full rounded-lg bg-white/[0.04] border border-white/10 p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 resize-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={submit} disabled={loading || !text.trim()}
              className="px-5 py-2 rounded-full bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white font-medium text-sm">
              {loading ? "Auditing…" : "Audit →"}
            </button>
            <button onClick={() => { setText(DEMO_BASKET.join("\n")); }} disabled={loading}
              className="px-4 py-2 rounded-full border border-white/15 hover:border-white/30 text-slate-300 text-sm transition-colors">
              Use demo basket
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-600 leading-relaxed">Ranked, cited, no health claims. Reports the public record as of today — never a “safe/unsafe” verdict.</p>
        </section>

        {/* Results */}
        <section className="min-h-[60vh]">
          {!dossier && !loading && (
            <div className="h-full flex items-center justify-center text-center pt-20">
              <p className="text-slate-500 max-w-sm leading-relaxed text-sm">Enter what you own, or load the demo basket, then run an audit. Findings appear here, ranked by what actually matters.</p>
            </div>
          )}
          {loading && (
            <div className="pt-24 text-center text-slate-400 text-sm animate-pulse">Checking the public record…</div>
          )}
          {err && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
              <p className="font-medium">Backend unreachable.</p>
              <p className="mt-1 text-xs text-red-300/80">Start the Python brain: <code className="text-red-200">cd harness &amp;&amp; ./.venv/bin/uvicorn warden.app:app --port 8787</code></p>
            </div>
          )}
          {dossier && !dossier.error && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {(["ACT", "ADDRESS", "AWARE"] as Tier[]).map((t) => (
                  <span key={t} className={`px-2.5 py-1 rounded-full border ${TIER_UI[t].chip}`}>{dossier.counts[t]} {t}</span>
                ))}
                {dossier.counts.CONTEXT > 0 && (
                  <span className={`px-2.5 py-1 rounded-full border ${TIER_UI.CONTEXT.chip}`}>{dossier.counts.CONTEXT} suppressed</span>
                )}
                <span className="text-slate-600 ml-auto">generated {dossier.generated_at?.slice(0, 16).replace("T", " ")}</span>
              </div>

              {dossier.findings.map((f, i) => <FindingCard key={i} f={f} />)}

              {dossier.record_statements.map((rs, i) => (
                <div key={`rs-${i}`} className="rounded-xl border border-slate-600/30 bg-white/[0.02] p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">No action on file</p>
                  <p className="text-[13px] text-slate-300 leading-relaxed">{rs.statement}</p>
                </div>
              ))}

              {dossier.findings.length === 0 && dossier.record_statements.length === 0 && (
                <p className="text-slate-500 text-sm">No findings.</p>
              )}

              {dossier.suppressed.length > 0 && (
                <details className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <summary className="text-xs text-slate-500 cursor-pointer">Show {dossier.suppressed.length} suppressed (ubiquitous / non-specific)</summary>
                  <div className="mt-3 space-y-3">{dossier.suppressed.map((f, i) => <FindingCard key={`s-${i}`} f={f} />)}</div>
                </details>
              )}

              <p className="text-[11px] text-slate-600 leading-relaxed pt-2 border-t border-white/5">{dossier.disclaimer}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
