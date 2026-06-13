import { NextResponse, type NextRequest } from "next/server";
import { authEnabled } from "@/lib/auth";

// Flag-gated middleware. When Clerk keys are present we run clerkMiddleware();
// otherwise this is a pure pass-through that never touches Clerk.
//
// NOTE: clerkMiddleware is loaded lazily (require, inside the enabled branch) so
// that with NO Clerk env vars the Clerk middleware module is never even imported
// or initialized — guaranteeing it can't throw on a missing publishable key.
//
// Routes are deliberately NOT protected: even with keys on, the demo stays fully
// open. Protection (createRouteMatcher + auth.protect()) is opt-in per route, to
// be added when the enrollment feature lands.
function buildMiddleware() {
  if (!authEnabled) {
    return (_req: NextRequest) => NextResponse.next();
  }
  // Lazy require keeps Clerk out of the OFF path entirely.
  const { clerkMiddleware } =
    require("@clerk/nextjs/server") as typeof import("@clerk/nextjs/server");
  return clerkMiddleware();
}

export default buildMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
