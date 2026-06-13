import { SignUp } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";

// Sign-up is part of the PREPPED (not-yet-live) enrollment flow. It only renders
// the Clerk <SignUp/> widget when auth is configured; with no Clerk keys it must
// NOT mount any Clerk component (those require <ClerkProvider>, which we don't
// mount when off — doing so would throw). So when off we show a minimal on-theme
// notice instead, keeping the route truly inert. Kept on-theme (paper/archival).
//
// Render dynamically: with no Clerk keys, static page-data collection of this
// catch-all route otherwise fails the production build (the route is inert anyway).
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-[var(--paper)] px-6 py-16">
      <div className="relative z-10 w-full max-w-md">
        <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          Warden · know what&rsquo;s around you
        </p>
        {authEnabled ? (
          <div className="flex justify-center">
            <SignUp />
          </div>
        ) : (
          <p className="text-center font-display text-[18px] italic leading-[1.5] text-[var(--ink-soft)]">
            Sign-up is not enabled in this build.
          </p>
        )}
      </div>
    </main>
  );
}
