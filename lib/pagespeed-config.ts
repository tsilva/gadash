import type { PageSpeedMonitoredSite } from "@/lib/types";

const HTTPS_PROTOCOL = "https:";

export function parsePageSpeedMonitoredSites(rawValue: string | undefined): PageSpeedMonitoredSite[] {
  if (!rawValue?.trim()) {
    throw new Error(
      "PAGESPEED_MONITORED_URLS must contain at least one absolute https:// URL separated by commas or new lines.",
    );
  }

  const invalidEntries: string[] = [];
  const deduped = new Map<string, PageSpeedMonitoredSite>();

  for (const segment of rawValue.split(/[\n,]/)) {
    const candidate = segment.trim();

    if (candidate.length === 0) {
      continue;
    }

    try {
      const parsed = new URL(candidate);

      if (parsed.protocol !== HTTPS_PROTOCOL) {
        throw new Error("Only https:// URLs are allowed.");
      }

      parsed.hash = "";

      const normalizedUrl = parsed.toString();

      if (!deduped.has(normalizedUrl)) {
        deduped.set(normalizedUrl, {
          url: normalizedUrl,
          label: parsed.hostname,
        });
      }
    } catch {
      invalidEntries.push(candidate);
    }
  }

  if (invalidEntries.length > 0) {
    throw new Error(
      `PAGESPEED_MONITORED_URLS contains invalid site URL${invalidEntries.length === 1 ? "" : "s"}: ${invalidEntries.join(", ")}.`,
    );
  }

  if (deduped.size === 0) {
    throw new Error(
      "PAGESPEED_MONITORED_URLS must contain at least one absolute https:// URL separated by commas or new lines.",
    );
  }

  return [...deduped.values()];
}

export function getPageSpeedApiKey(): string {
  return process.env.PAGESPEED_API_KEY?.trim() ?? "";
}

export function getConfiguredPageSpeedSites(): PageSpeedMonitoredSite[] {
  return parsePageSpeedMonitoredSites(process.env.PAGESPEED_MONITORED_URLS);
}
