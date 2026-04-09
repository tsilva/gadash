import { cookies } from "next/headers";

import { AuthGate } from "@/components/auth-gate";
import { Dashboard } from "@/components/dashboard";
import { getConfiguredPageSpeedSites } from "@/lib/pagespeed-config";
import { DASHBOARD_AUTH_COOKIE_NAME, readDashboardSessionValue } from "@/lib/server-auth";
import type { PageSpeedMonitoredSite } from "@/lib/types";

type HomePageViewProps = {
  isAuthenticated: boolean;
  configuredPageSpeedSites?: PageSpeedMonitoredSite[];
};

export function HomePageView({
  isAuthenticated,
  configuredPageSpeedSites = [],
}: HomePageViewProps) {
  if (!isAuthenticated) {
    return <AuthGate />;
  }

  return <Dashboard configuredPageSpeedSites={configuredPageSpeedSites} />;
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = readDashboardSessionValue(cookieStore.get(DASHBOARD_AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return <HomePageView isAuthenticated={false} />;
  }

  let configuredPageSpeedSites: PageSpeedMonitoredSite[] = [];

  try {
    configuredPageSpeedSites = getConfiguredPageSpeedSites();
  } catch {
    configuredPageSpeedSites = [];
  }

  return <HomePageView configuredPageSpeedSites={configuredPageSpeedSites} isAuthenticated />;
}
