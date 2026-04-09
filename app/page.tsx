import { Dashboard } from "@/components/dashboard";
import { getConfiguredPageSpeedSites } from "@/lib/pagespeed-config";
import type { PageSpeedMonitoredSite } from "@/lib/types";

export default function HomePage() {
  let configuredPageSpeedSites: PageSpeedMonitoredSite[] = [];

  try {
    configuredPageSpeedSites = getConfiguredPageSpeedSites();
  } catch {
    configuredPageSpeedSites = [];
  }

  return <Dashboard configuredPageSpeedSites={configuredPageSpeedSites} />;
}
