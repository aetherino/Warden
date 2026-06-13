"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { authEnabled } from "@/lib/auth";

// Masthead auth affordance — a small Sign-in link / <UserButton/> for the record's
// header. Renders NOTHING unless Clerk keys are present, so the login-free demo
// shows no auth UI at all.
//
// CRITICAL (OFF path): when auth is off there is no <ClerkProvider>, so we must
// NOT call any Clerk hook. The flag gate lives in this outer component (which uses
// no hooks); the inner component — the only thing that calls useUser() — is mounted
// solely when authEnabled. This keeps the hook strictly inside a provider.
//
// The masthead is a client component (app/page.tsx), so the signed-in/out switch
// uses Clerk's client `useUser()` hook (Core 3). For *server-side* gating elsewhere,
// use `await auth()` / `currentUser()` from "@clerk/nextjs/server" (both async).
export default function AuthMasthead() {
  if (!authEnabled) return null;
  return <AuthControls />;
}

// On-theme: mono caps for the link, matching the masthead's existing label voice.
function AuthControls() {
  const { isLoaded, isSignedIn } = useUser();

  // Don't flash UI until Clerk has resolved session state.
  if (!isLoaded) return null;

  return (
    <div className="flex items-center">
      {isSignedIn ? (
        <UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
      ) : (
        <SignInButton mode="modal">
          <button className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-4 transition-colors hover:text-[var(--ink)]">
            Sign in
          </button>
        </SignInButton>
      )}
    </div>
  );
}
