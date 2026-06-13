"use client";

// ACT 1 — ENROLLMENT (UX_REWORK §3 + MOBILE_UX §3). A short three-question interview,
// one question per screen, parsed live, that emits {items, context}. Mobile-first: the
// progress rail is a top tick-strip, the primary action lives in a sticky thumb bar
// (CSS handles the L-breakpoint dissolve), every panel is SOLID white so no copy ever
// floats on the particle field. #042 client heuristics: stream-of-thought parsing,
// predicted-basket chips, local typeahead, and a Web Speech voice affordance.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_BASKET,
  PROXIMITY_OPTIONS,
  buildContext,
  parseStreamOfThought,
  predictBasket,
  splitTrailing,
  typeahead,
  type Profile,
} from "@/lib/enroll";

export interface EnrollResult {
  items: string[];
  context: Record<string, unknown>;
  zip: string;
  tapWater: boolean;
  proximity: string[];
}

type Step = 0 | 1 | 2 | 3; // 0=where, 1=nearby, 2=own, 3=confirm

const STEP_LABELS = ["where", "nearby", "what you own"] as const;

// ── Minimal Web Speech API typings (not in all lib.dom versions) ──────────────
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
  resultIndex: number;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
      {children}
    </p>
  );
}

export default function EnrollFlow({
  onRun,
  busy,
}: {
  onRun: (r: EnrollResult) => void;
  busy: boolean;
}) {
  const [step, setStep] = useState<Step>(0);

  // Q1 — where
  const [zip, setZip] = useState("");
  const [region, setRegion] = useState("");
  const [tapWater, setTapWater] = useState(false);

  // Q2 — nearby (proximity multi-select + free text)
  const [proximity, setProximity] = useState<string[]>([]);
  const [proximityOther, setProximityOther] = useState("");

  // Q3 — what you own (stream-of-thought textarea -> chips + typeahead + predicted)
  const [text, setText] = useState("");
  const [extraItems, setExtraItems] = useState<string[]>([]); // from typeahead/voice taps
  const [typeaheadQ, setTypeaheadQ] = useState("");
  const [profile] = useState<Profile>({}); // lightweight; predicted basket is curated stand-in

  // The committed item list = stream-of-thought parse of the textarea + tapped extras.
  const parsedFromText = useMemo(() => parseStreamOfThought(text), [text]);
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of [...parsedFromText, ...extraItems]) {
      const k = i.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(i);
      }
    }
    return out;
  }, [parsedFromText, extraItems]);

  const predicted = useMemo(
    () =>
      predictBasket({
        ...profile,
        zip: zip || undefined,
        tapWater,
        // crude proxies from proximity for the demo heuristic
        oldHome: proximity.includes("older home (pre-1978)"),
      }),
    [profile, zip, tapWater, proximity]
  );
  // Predicted chips render PRE-KEPT (tap to drop) — the thumb-friendly default.
  const [droppedPredicted, setDroppedPredicted] = useState<string[]>([]);
  const keptPredicted = predicted
    .map((p) => p.label)
    .filter((l) => !droppedPredicted.includes(l) && !items.includes(l));

  const typeaheadResults = useMemo(() => typeahead(typeaheadQ), [typeaheadQ]);

  const resolvedProximity = useMemo(() => {
    const all = [...proximity];
    if (proximityOther.trim()) all.push(proximityOther.trim());
    return all;
  }, [proximity, proximityOther]);

  function toggleProximity(opt: string) {
    setProximity((prev) =>
      prev.includes(opt) ? prev.filter((p) => p !== opt) : [...prev, opt]
    );
  }

  function addItem(label: string) {
    setExtraItems((prev) => (prev.some((i) => i.toLowerCase() === label.toLowerCase()) ? prev : [...prev, label]));
  }
  function removeItem(label: string) {
    // Remove from extras; if it came from the textarea, strip the matching fragment.
    setExtraItems((prev) => prev.filter((i) => i.toLowerCase() !== label.toLowerCase()));
    setText((prev) =>
      parseStreamOfThought(prev)
        .filter((i) => i.toLowerCase() !== label.toLowerCase())
        .join(", ")
    );
  }

  function keepPredicted(label: string) {
    addItem(label);
    setDroppedPredicted((prev) => prev.filter((l) => l !== label));
  }
  function dropPredicted(label: string) {
    setDroppedPredicted((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }

  function loadDemo() {
    setText(DEMO_BASKET.join(", "));
    setExtraItems([]);
    setDroppedPredicted([]);
    setZip("48503");
    setTapWater(true);
  }

  function run() {
    const finalItems = items.length ? items : parseStreamOfThought(text);
    const context = buildContext({ zip, region, tapWater, proximity: resolvedProximity });
    onRun({ items: finalItems, context, zip, tapWater, proximity: resolvedProximity });
  }

  // Demo path: fill + jump to confirm in one tap.
  function runDemoStraight() {
    const context = buildContext({ zip: "48503", tapWater: true });
    onRun({ items: DEMO_BASKET, context, zip: "48503", tapWater: true, proximity: [] });
  }

  // ── Voice input (Web Speech API; graceful no-op/hide if unsupported) ─────────
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = useMemo(() => getSpeechRecognition() != null, []);
  useEffect(() => () => recogRef.current?.stop(), []);

  function toggleVoice() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (recording) {
      recogRef.current?.stop();
      return;
    }
    const recog = new Ctor();
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.continuous = true;
    recog.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
      }
      if (transcript.trim()) {
        // Fold spoken text through the same stream-of-thought parser.
        setText((prev) => (prev ? `${prev}, ${transcript.trim()}` : transcript.trim()));
      }
    };
    recog.onend = () => setRecording(false);
    recog.onerror = () => setRecording(false);
    recogRef.current = recog;
    setRecording(true);
    recog.start();
  }

  // ── Render helpers ───────────────────────────────────────────────────────────
  const zipDigits = zip.replace(/\D/g, "");
  const zipEcho = zipDigits.length === 5 ? `ZIP ${zipDigits}` : null;

  // The sticky primary action label per step.
  const primaryLabel = step === 3 ? (busy ? "Auditing…" : "Run audit →") : "Next →";
  const canPrimary = step === 3 ? !busy : true;

  return (
    <div data-testid="enroll-flow" className="relative">
      {/* Progress tick-strip (top, mobile rail; persists on desktop as a slim header). */}
      {step < 3 && (
        <div className="mb-4 flex items-center gap-3 rounded-[3px] solid-panel-soft px-4 py-2.5">
          {STEP_LABELS.map((lbl, i) => (
            <button
              key={lbl}
              type="button"
              onClick={() => i <= step && setStep(i as Step)}
              className="flex items-center gap-1.5"
              aria-label={`Go to ${lbl}`}
            >
              <span
                className={`tick ${i < step ? "tick--done" : i === step ? "tick--current" : ""}`}
                aria-hidden
              />
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  i === step ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"
                }`}
              >
                {lbl}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Q1 — WHERE ──────────────────────────────────────────────────────── */}
      {step === 0 && (
        <section className="reveal-fade solid-panel px-5 py-6 sm:px-6">
          <Eyebrow>Where</Eyebrow>
          <h2 className="font-display mt-2 text-[clamp(24px,6vw,30px)] font-semibold leading-[1.1] text-[var(--ink)]">
            Where do you live?
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              maxLength={5}
              placeholder="48503"
              aria-label="ZIP code"
              className="h-[44px] w-[120px] rounded-[3px] border bg-white px-3 font-mono text-[15px] tracking-[0.08em] text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline focus:border-[var(--ink-soft)] focus:outline-none"
            />
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Flint, MI (optional)"
              aria-label="Region"
              autoCapitalize="words"
              className="h-[44px] min-w-[160px] flex-1 rounded-[3px] border bg-white px-3 font-mono text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline focus:border-[var(--ink-soft)] focus:outline-none"
            />
          </div>
          {zipEcho && (
            <p className="mt-2.5 font-mono text-[12px] tracking-[0.04em] text-[var(--ink-soft)]">
              ✓ {zipEcho}
              {region.trim() ? ` · ${region.trim()}` : ""}
            </p>
          )}

          {/* Tap-water HARD TOGGLE — a full-width ≥44px tappable row (#037). */}
          <button
            type="button"
            onClick={() => setTapWater((v) => !v)}
            aria-pressed={tapWater}
            className="mt-4 flex w-full items-center gap-3 rounded-[3px] border bg-white px-3.5 py-3 text-left hairline-soft"
            style={{ minHeight: 48 }}
          >
            <span
              aria-hidden
              className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[3px] border ${
                tapWater ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-white"
              } hairline`}
            >
              {tapWater ? "✓" : ""}
            </span>
            <span className="font-mono text-[13px] tracking-wide text-[var(--ink-soft)]">
              I drink unfiltered tap water
            </span>
          </button>

          <p className="mt-3 text-[14px] leading-[1.5] text-[var(--ink-soft)]">
            So Warden can check your water and what&rsquo;s nearby. Never shared.
          </p>
        </section>
      )}

      {/* ── Q2 — NEARBY ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <section className="reveal-fade solid-panel px-5 py-6 sm:px-6">
          <Eyebrow>Nearby</Eyebrow>
          <h2 className="font-display mt-2 text-[clamp(24px,6vw,30px)] font-semibold leading-[1.1] text-[var(--ink)]">
            Anything nearby?
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {PROXIMITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleProximity(opt)}
                aria-pressed={proximity.includes(opt)}
                className={`chip ${proximity.includes(opt) ? "chip--on" : ""}`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <input
              value={proximityOther}
              onChange={(e) => setProximityOther(e.target.value)}
              placeholder="something else…"
              aria-label="Something else nearby"
              className="h-[44px] w-full rounded-[3px] border bg-white px-3 font-mono text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline-soft focus:border-[var(--ink-soft)] focus:outline-none"
            />
          </div>

          <p className="mt-3 text-[14px] leading-[1.5] text-[var(--ink-soft)]">
            Lets Warden check things you&rsquo;d never think to look up — like what&rsquo;s
            in the water near an airport.
          </p>
        </section>
      )}

      {/* ── Q3 — WHAT YOU OWN ───────────────────────────────────────────────── */}
      {step === 2 && (
        <section className="reveal-fade solid-panel px-5 py-6 sm:px-6">
          <Eyebrow>What you own</Eyebrow>
          <h2 className="font-display mt-2 text-[clamp(24px,6vw,30px)] font-semibold leading-[1.1] text-[var(--ink)]">
            What do you own?
          </h2>

          {/* Predicted-basket chips (#042a) — tap-to-keep (pre-kept), neutral slate. */}
          {keptPredicted.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[11px] leading-[1.5] text-[var(--ink-faint)]">
                Based on your answers — keep what&rsquo;s yours, drop the rest:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {keptPredicted.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => keepPredicted(label)}
                    className="chip chip--on"
                    title="Tap to keep"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stream-of-thought textarea (#042d) — SOLID white, natural language, no
              "one per line" rule. Chips below materialize as the user types. */}
          <div className="mt-4">
            <div className="flex items-start gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="a peloton, a couple space heaters, my kid's inclined sleeper, the usual extension cords…"
                autoCapitalize="off"
                autoCorrect="off"
                className="min-h-[44px] w-full resize-none rounded-[3px] border bg-white p-3.5 text-[14px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline focus:border-[var(--ink-soft)] focus:outline-none"
                style={{ fontFamily: "var(--font-mono)" }}
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={recording ? "Stop voice input" : "Speak your items"}
                  aria-pressed={recording}
                  className={`voice-btn shrink-0 ${recording ? "voice-btn--rec" : ""}`}
                  title={recording ? "Listening… tap to stop" : "Just say what you've got"}
                >
                  {recording ? "■" : "🎙"}
                </button>
              )}
            </div>

            {/* parsed N items feedback */}
            <p className="mt-2 font-mono text-[11px] tracking-wide text-[var(--ink-faint)]">
              {items.length > 0 ? (
                <>parsed {items.length} item{items.length === 1 ? "" : "s"}</>
              ) : (
                "type or say what you own — commas and “and” split it up"
              )}
            </p>
          </div>

          {/* Typeahead (#042b) — instant local dict, drops directly under the input. */}
          <div className="mt-3">
            <input
              value={typeaheadQ}
              onChange={(e) => setTypeaheadQ(e.target.value)}
              placeholder="+ add one (type a brand or category)"
              aria-label="Add an item by name"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-[44px] w-full rounded-[3px] border bg-white px-3 font-mono text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] hairline-soft focus:border-[var(--ink-soft)] focus:outline-none"
            />
            {typeaheadResults.length > 0 && (
              <div className="mt-1.5 overflow-hidden rounded-[3px] border bg-white hairline">
                {typeaheadResults.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      addItem(r);
                      setTypeaheadQ("");
                    }}
                    className="flex min-h-[44px] w-full items-center px-3 text-left font-mono text-[13px] text-[var(--ink)] hover:bg-[rgba(28,27,24,0.04)]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Parsed item pills — removable, wrap, ≥44px. */}
          {items.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {items.map((it) => (
                <span key={it} className="item-pill reveal-fade">
                  {it}
                  <button
                    type="button"
                    onClick={() => removeItem(it)}
                    aria-label={`Remove ${it}`}
                    className="chip-x"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={loadDemo}
            className="link-action mt-4"
          >
            Use demo basket
          </button>
        </section>
      )}

      {/* ── CONFIRM SLIP ────────────────────────────────────────────────────── */}
      {step === 3 && (
        <section
          data-testid="request-slip"
          className="reveal-fade solid-panel px-5 py-6 sm:px-6"
        >
          <div className="flex items-center justify-between">
            <Eyebrow>The request</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
              № 001
            </span>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  Where
                </span>
                <button type="button" onClick={() => setStep(0)} className="-my-2 inline-flex min-h-[44px] items-center px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]">
                  edit
                </button>
              </div>
              <p className="mt-1 font-mono text-[13px] text-[var(--ink)]">
                {zipEcho ? `${zipEcho}${region.trim() ? ` · ${region.trim()}` : ""}` : region.trim() || "— not provided —"}
                {tapWater ? " · unfiltered tap" : ""}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  Nearby
                </span>
                <button type="button" onClick={() => setStep(1)} className="-my-2 inline-flex min-h-[44px] items-center px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]">
                  edit
                </button>
              </div>
              <p className="mt-1 font-mono text-[13px] text-[var(--ink-soft)]">
                {resolvedProximity.length ? resolvedProximity.join(" · ") : "— not provided —"}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  What you own
                </span>
                <button type="button" onClick={() => setStep(2)} className="-my-2 inline-flex min-h-[44px] items-center px-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)]">
                  edit
                </button>
              </div>
              {items.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {items.map((it) => (
                    <span key={it} className="item-pill">
                      {it}
                      <button type="button" onClick={() => removeItem(it)} aria-label={`Remove ${it}`} className="chip-x">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 font-mono text-[13px] text-[var(--ink-faint)]">— not provided —</p>
              )}
            </div>
          </div>

          <p className="mt-5 border-t hairline-soft pt-4 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
            Warden will check each of these for recalls, warnings, and water and
            environmental issues near you — and show you what&rsquo;s worth knowing, as of
            today.
          </p>
        </section>
      )}

      {/* ── STICKY THUMB ACTION (dissolves to inline on L via CSS) ───────────── */}
      <div className="sticky-action mt-4 flex items-center justify-between gap-4 px-1 py-3 lg:px-0">
        {step < 3 ? (
          <>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(2, s + 1) as Step)}
              className="link-action order-2"
            >
              {step === 0 || step === 1 ? "Skip" : "Use demo basket"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (step < 2) setStep((s) => (s + 1) as Step);
                else setStep(3);
              }}
              className="pill-primary order-1"
            >
              {primaryLabel}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={runDemoStraight} disabled={busy} className="link-action order-2">
              use demo basket
            </button>
            <button
              type="button"
              data-testid="run-audit"
              onClick={run}
              disabled={!canPrimary}
              className="pill-primary order-1"
            >
              {primaryLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
