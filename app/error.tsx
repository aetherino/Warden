"use client";

// Client error boundary — keeps the record from crashing to a blank page.
// Stays on-theme (paper white, warm ink) and on-message (reporter, not advisor).
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-6">
      <div className="max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          Warden
        </p>
        <h1 className="font-display mt-3 text-[30px] font-semibold leading-[1.1] tracking-tight text-[var(--ink)]">
          Something interrupted the record.
        </h1>
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--ink-soft)]">
          The page hit an unexpected error before it could finish. Nothing was
          submitted anywhere — you can reload and run your audit again.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-full bg-[var(--ink)] px-6 py-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-90"
        >
          Reload
        </button>
      </div>
    </main>
  );
}
