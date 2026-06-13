// Single source of truth for whether Clerk auth is wired up.
//
// Warden is demoed login-free. Clerk is PREPPED here (for a future "save my home
// profile" / enrollment feature) but INERT until keys exist. Every auth code path
// keys off this flag, so with NO Clerk env vars the app builds and runs EXACTLY as
// it does today — no provider, no middleware, no auth UI, no Clerk initialization.
//
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is inlined at build time, so this evaluates
// correctly in both server and client bundles. (The matching CLERK_SECRET_KEY is
// server-only; presence of the publishable key is the canonical on/off switch.)
export const authEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
