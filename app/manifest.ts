import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GADash - Real-time GA4 Dashboard",
    short_name: "GADash",
    description:
      "A client-side Next.js application that auto-discovers and displays real-time GA4 analytics properties using Google OAuth and Data APIs.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/android-chrome-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
