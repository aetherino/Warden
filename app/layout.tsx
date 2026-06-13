import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warden — Your Home, Audited",
  description:
    "Consumer hazard-audit agent. Know what's actually dangerous in your home.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
