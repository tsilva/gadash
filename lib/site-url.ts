export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://gadash.tsilva.eu");
}
