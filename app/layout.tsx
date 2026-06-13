import type { Metadata } from "next";
import { Fraunces, Newsreader, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Typography carries the "archival record on white paper" voice.
// Display: Fraunces — an expressive optical serif with real personality.
// Body: Newsreader — a warm humanist text serif/italic, legible at small sizes.
// Mono: IBM Plex Mono — for citations / locators / as_of / "checked as of <date>"
// lines, so provenance reads like a printed receipt (on-thesis).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Warden — The Public Record, Audited",
  description:
    "Consumer hazard-audit agent. Warden reports the state of the public record about the things you own — ranked, conditioned, cited. Never a safe/unsafe verdict.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${newsreader.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
