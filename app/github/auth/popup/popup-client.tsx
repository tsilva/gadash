"use client";

import { useEffect } from "react";

const GITHUB_AUTH_MESSAGE_TYPE = "gadash:github-auth";

export function GitHubAuthPopupClient({
  success,
  error,
}: {
  success: boolean;
  error: string | null;
}) {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        {
          type: GITHUB_AUTH_MESSAGE_TYPE,
          success,
          ...(error ? { error } : {}),
        },
        window.location.origin,
      );
    }

    window.close();
  }, [error, success]);

  return (
    <main className="shell shell--auth">
      <section className="integration integration--auth">
        <div className="integration__header">
          <div>
            <p className="integration__eyebrow">GitHub</p>
            <h2>{success ? "Sign-in complete" : "Sign-in failed"}</h2>
          </div>
        </div>
        <p className="auth-gate__copy">
          {success ? "You can close this window." : error ?? "GitHub sign-in failed."}
        </p>
      </section>
    </main>
  );
}
