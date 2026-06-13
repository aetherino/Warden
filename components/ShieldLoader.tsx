"use client";

import dynamic from "next/dynamic";
import type { ShieldTier } from "@/components/InvisibleShield";

// Client component wrapper — ssr:false is only allowed inside client components in Next.js 15 App Router
const InvisibleShield = dynamic(() => import("@/components/InvisibleShield"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-slate-600 text-sm tracking-widest uppercase">Initializing shield…</div>
    </div>
  ),
});

export default function ShieldLoader({ tier = "IDLE" }: { tier?: ShieldTier }) {
  return <InvisibleShield tier={tier} />;
}
