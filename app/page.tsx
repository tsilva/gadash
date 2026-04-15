import { cookies, headers } from "next/headers";

import { AuthGate } from "@/components/auth-gate";
import { Dashboard } from "@/components/dashboard";
import { getConfiguredPageSpeedSites } from "@/lib/pagespeed-config";
import { NONCE_HEADER_NAME } from "@/lib/security-headers";
import { DASHBOARD_AUTH_COOKIE_NAME, readDashboardSessionValue } from "@/lib/server-auth";
import type { PageSpeedMonitoredSite } from "@/lib/types";

type HomePageViewProps = {
  isAuthenticated: boolean;
  configuredPageSpeedSites?: PageSpeedMonitoredSite[];
  nonce?: string;
};

export function HomePageView({
  isAuthenticated,
  configuredPageSpeedSites = [],
  nonce,
}: HomePageViewProps) {
  if (!isAuthenticated) {
    return <AuthGate nonce={nonce} />;
  }

  return <Dashboard configuredPageSpeedSites={configuredPageSpeedSites} nonce={nonce} />;
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const nonce = headerStore.get(NONCE_HEADER_NAME) ?? undefined;
  const session = readDashboardSessionValue(cookieStore.get(DASHBOARD_AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return <HomePageView isAuthenticated={false} nonce={nonce} />;
  }

  let configuredPageSpeedSites: PageSpeedMonitoredSite[] = [];

  try {
    configuredPageSpeedSites = getConfiguredPageSpeedSites();
  } catch {
    configuredPageSpeedSites = [];
  }

  return (
    <HomePageView
      configuredPageSpeedSites={configuredPageSpeedSites}
      isAuthenticated
      nonce={nonce}
    />
  );
}
