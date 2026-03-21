import type { MetadataRoute } from "next";

const APP_CHROME_COLOR = "#09090b";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GADash - Real-time GA4 Dashboard",
    short_name: "GADash",
    description:
      "A client-side Next.js application that auto-discovers and displays real-time GA4 analytics properties using Google OAuth and Data APIs.",
    start_url: "/",
    display: "standalone",
    background_color: APP_CHROME_COLOR,
    theme_color: APP_CHROME_COLOR,
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
