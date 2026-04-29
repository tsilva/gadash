import { cookies, headers } from "next/headers";

import { Dashboard } from "@/components/dashboard";
import { NONCE_HEADER_NAME } from "@/lib/security-headers";
import { DASHBOARD_AUTH_COOKIE_NAME, readDashboardSessionValue } from "@/lib/server-auth";

type HomePageViewProps = {
  hasDashboardSession: boolean;
  nonce?: string;
};

export function HomePageView({
  hasDashboardSession,
  nonce,
}: HomePageViewProps) {
  return (
    <Dashboard
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

  return (
    <HomePageView
      hasDashboardSession={Boolean(session)}
      nonce={nonce}
    />
  );
}
