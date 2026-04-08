import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Outfit, Roboto } from "next/font/google";

import "./globals.css";

const APP_CHROME_COLOR = "#09090b";
const DEFAULT_SITE_URL = "http://localhost:3000";

function getMetadataBase(): URL {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : "") ||
    DEFAULT_SITE_URL;

  return new URL(configuredUrl);
}

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
  metadataBase: getMetadataBase(),
  title: "GADash - Real-time GA4 Dashboard for Next.js",
  description:
    "A client-side Next.js application that auto-discovers and displays real-time GA4 analytics properties using Google OAuth and Data APIs.",
  keywords: [
    "ga4",
    "google-analytics-4",
    "nextjs",
    "real-time-dashboard",
    "google-oauth",
    "data-api",
    "client-side",
    "analytics-dashboard",
    "react",
  ],
  openGraph: {
    title: "GADash: Client-Side Google Analytics 4 Real-time Dashboard",
    description:
      "Securely visualize GA4 data with automatic property discovery. Built with Next.js, Google OAuth, and the GA4 Data API for real-time insights.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GADash: Client-Side Google Analytics 4 Real-time Dashboard",
    description:
      "Securely visualize GA4 data with automatic property discovery. Built with Next.js, Google OAuth, and the GA4 Data API for real-time insights.",
  },
  other: {
    "theme-color": APP_CHROME_COLOR,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: APP_CHROME_COLOR,
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
