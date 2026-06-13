// ShieldLoader is a client component that handles the ssr:false dynamic import
// (Next.js 15 App Router requires ssr:false inside client components)
import ShieldLoader from "@/components/ShieldLoader";

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Ambient radial gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 52%, rgba(79,195,247,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Shield canvas — fills center stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[min(90vw,90vh)] h-[min(90vw,90vh)]">
          <ShieldLoader />
        </div>
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-6 z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tracking-tight text-white">
            Warden
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-sky-500/30 text-sky-400 tracking-wider uppercase">
            Beta
          </span>
        </div>
        <nav className="text-sm text-slate-500 tracking-wide">
          Hazard Audit
        </nav>
      </header>

      {/* Hero copy — bottom-anchored */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-16 z-10 pointer-events-none">
        <h1 className="text-4xl sm:text-5xl font-semibold text-white text-center tracking-tight max-w-xl leading-tight">
          Know what's actually{" "}
          <span className="text-sky-400">dangerous</span> in your home.
        </h1>
        <p className="mt-4 text-slate-400 text-center max-w-md text-base sm:text-lg leading-relaxed">
          Warden audits your possessions against recalls, violations, and
          litigation — then tells you what to do about it.
        </p>
        <button
          className="mt-8 px-7 py-3 rounded-full bg-sky-500 hover:bg-sky-400 transition-colors text-white font-medium text-sm tracking-wide pointer-events-auto"
          disabled
        >
          Audit My Home →
        </button>
        <p className="mt-3 text-xs text-slate-600">
          Ranked, cited, no health claims.
        </p>
      </div>
    </main>
  );
}
