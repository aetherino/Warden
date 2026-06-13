"use client";

import dynamic from "next/dynamic";
import type { ShieldTier, ShieldPhase } from "@/components/InvisibleShield";

// Client component wrapper — ssr:false is only allowed inside client components in
// the Next.js App Router. While the field loads we render a quiet neutral stipple so
// the center is never blank (coverage is present; the record is simply quiet).
const InvisibleShield = dynamic(() => import("@/components/InvisibleShield"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full"
      aria-hidden
      style={{
        background:
          "radial-gradient(circle at 50% 48%, rgba(110,118,128,0.08) 0%, transparent 60%)",
      }}
    />
  ),
});

export default function ShieldLoader({
  tier = "IDLE",
  phase = "enroll",
}: {
  tier?: ShieldTier;
  phase?: ShieldPhase;
}) {
  return <InvisibleShield tier={tier} phase={phase} />;
}
