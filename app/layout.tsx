import type { Metadata } from "next";
import { IBM_Plex_Mono, Roboto, Space_Grotesk } from "next/font/google";

import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const googleSans = Roboto({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-google",
});

export const metadata: Metadata = {
  title: "GADash",
  description: "Viewer-scoped GA4 realtime dashboard built with Next.js.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${googleSans.variable}`}>{children}</body>
    </html>
  );
}
