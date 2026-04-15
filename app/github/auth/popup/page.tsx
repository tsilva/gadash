import { GitHubAuthPopupClient } from "./popup-client";

type PopupPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function GitHubAuthPopupPage({ searchParams }: PopupPageProps) {
  const params = await searchParams;

  return (
    <GitHubAuthPopupClient
      error={typeof params.error === "string" ? params.error : null}
      success={params.success === "1"}
    />
  );
}
