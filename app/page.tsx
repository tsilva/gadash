import { cookies, headers } from "next/headers";

import { Dashboard } from "@/components/dashboard";
import { getConfiguredPageSpeedSites } from "@/lib/pagespeed-config";
import { NONCE_HEADER_NAME } from "@/lib/security-headers";
import { DASHBOARD_AUTH_COOKIE_NAME, readDashboardSessionValue } from "@/lib/server-auth";
import type { PageSpeedMonitoredSite } from "@/lib/types";

type HomePageViewProps = {
  hasDashboardSession: boolean;
  configuredPageSpeedSites?: PageSpeedMonitoredSite[];
  nonce?: string;
};

export function HomePageView({
  hasDashboardSession,
  configuredPageSpeedSites = [],
  nonce,
}: HomePageViewProps) {
  return (
    <Dashboard
      configuredPageSpeedSites={configuredPageSpeedSites}
      hasDashboardSession={hasDashboardSession}
      nonce={nonce}
    />
  );
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const nonce = headerStore.get(NONCE_HEADER_NAME) ?? undefined;
  const session = readDashboardSessionValue(cookieStore.get(DASHBOARD_AUTH_COOKIE_NAME)?.value);

  let configuredPageSpeedSites: PageSpeedMonitoredSite[] = [];

  try {
    configuredPageSpeedSites = getConfiguredPageSpeedSites();
  } catch {
    configuredPageSpeedSites = [];
  }

  return (
    <HomePageView
      configuredPageSpeedSites={configuredPageSpeedSites}
      hasDashboardSession={Boolean(session)}
      nonce={nonce}
    />
  );
}
