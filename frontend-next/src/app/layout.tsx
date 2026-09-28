import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted font files (see src/app/fonts/, both OFL-licensed) instead of
// next/font/google: this app never fetches anything from Google Fonts, at
// build time or runtime, which keeps the whole project buildable and usable
// fully offline (see docs/09_DEPLOYMENT.md).
const display = localFont({
  src: "./fonts/SpaceGrotesk-Variable.ttf",
  variable: "--font-display",
  weight: "300 700",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ANTARDRISHTI — Network-Blockchain Investigation Platform",
  description: "Offline investigation dashboard for Bitcoin network-blockchain correlation, SIH26146.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
