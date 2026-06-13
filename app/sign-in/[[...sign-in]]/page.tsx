import { SignIn } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";

// Sign-in is part of the PREPPED (not-yet-live) enrollment flow. It only renders
// the Clerk <SignIn/> widget when auth is configured; with no Clerk keys it must
// NOT mount any Clerk component (those require <ClerkProvider>, which we don't
// mount when off — doing so would throw). So when off we show a minimal on-theme
// notice instead, keeping the route truly inert. Kept on-theme (paper/archival).
export default function Page() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-6 py-16">
      <div className="relative z-10 w-full max-w-md">
        <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          Warden · the public record, audited
        </p>
        {authEnabled ? (
          <div className="flex justify-center">
            <SignIn />
          </div>
        ) : (
          <p className="text-center font-display text-[18px] italic leading-[1.5] text-[var(--ink-soft)]">
            Sign-in is not enabled in this build.
          </p>
        )}
      </div>
    </main>
  );
}
