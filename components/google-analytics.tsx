"use client";

import Script from "next/script";
import { useState } from "react";

import { ANALYTICS_CONSENT_COOKIE, getGoogleAnalyticsBootstrap } from "@/lib/google-analytics";

export function GoogleAnalyticsTag({
  measurementId,
  nonce,
  consent,
}: {
  measurementId?: string;
  nonce?: string;
  consent?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const id = measurementId?.trim();
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return null;

  const bootstrap = getGoogleAnalyticsBootstrap(id, consent);

  function chooseConsent(choice: "granted" | "denied") {
    // Stop collection immediately on withdrawal; reloading unloads the tag too.
    if (choice === "denied") {
      Object.assign(window, { [`ga-disable-${id}`]: true });
    }
    try {
      document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${choice}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      if (!document.cookie.split("; ").includes(`${ANALYTICS_CONSENT_COOKIE}=${choice}`)) {
        throw new Error("Consent preference could not be saved.");
      }
      window.location.reload();
    } catch {
      setError("Your preference could not be saved. Please allow preference cookies and try again.");
    }
  }

  return (
    <>
      <section className="analytics-consent" aria-label="Google Analytics preferences">
        <p>
          {consent === "granted"
            ? "You've allowed Google Analytics cookies for visits to GADash."
            : "Allow Google Analytics cookies to help measure visits to GADash?"}
          {" "}This choice is separate from Google sign-in and access to your dashboard data.
        </p>
        <div className="analytics-consent__actions">
          <button className="button" type="button" onClick={() => chooseConsent("granted")} disabled={consent === "granted"}>
            Allow Google Analytics
          </button>
          <button className="button" type="button" onClick={() => chooseConsent("denied")} disabled={consent === "denied"}>
            {consent === "granted" ? "Disable Google Analytics" : "Decline"}
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </section>
      {bootstrap && nonce ? (
        <>
          <Script id="google-analytics" nonce={nonce} strategy="afterInteractive">
            {bootstrap}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
            nonce={nonce}
            strategy="afterInteractive"
          />
        </>
      ) : null}
    </>
  );
}
