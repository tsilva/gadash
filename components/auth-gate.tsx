"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { GoogleMark } from "@/components/google-mark";
import { getGoogleAuthorizedOrigins, getGoogleClientId } from "@/lib/config";

function isAuthorizedOrigin(allowedOrigins: string[]): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(window.location.origin);
}

function getGateConfigError(): string | null {
  if (getGoogleClientId().length === 0) {
    return "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID before using the dashboard.";
  }

  if (!isAuthorizedOrigin(getGoogleAuthorizedOrigins())) {
    return `This origin is not allowed for Google sign-in: ${window.location.origin}`;
  }

  return null;
}

export function LockedDashboardScreen({
  buttonRef,
  error,
  isSigningIn,
  showFallbackButton,
}: {
  buttonRef: (node: HTMLDivElement | null) => void;
  error: string | null;
  isSigningIn: boolean;
  showFallbackButton: boolean;
}) {
  return (
    <main className="shell shell--auth">
      <header className="hero hero--auth">
        <div className="hero__copy">
          <h1>GADash</h1>
          <p className="hero__lede">Private dashboard for realtime GA4, GitHub trends, and PageSpeed checks</p>
        </div>
      </header>

      <section className="integration integration--auth">
        <div className="integration__header">
          <div>
            <p className="integration__eyebrow">Private Access</p>
            <h2>Sign in to open the dashboard</h2>
          </div>
        </div>

        <p className="auth-gate__copy">
          Access is limited to the allowed Google account. After this identity check, the GA4 section still asks
          for Analytics consent separately.
        </p>

        <div className="auth-gate__button-row">
          {showFallbackButton ? (
            <button className="button button--google" disabled type="button">
              <span className="google-signin">
                <span className="google-signin__badge">
                  <GoogleMark />
                </span>
                <span className="google-signin__label">
                  {isSigningIn ? "Signing in..." : "Loading Google sign-in..."}
                </span>
              </span>
            </button>
          ) : null}
          <div className="auth-gate__google-button" ref={buttonRef} />
        </div>

        {error ? (
          <section className="alert alert--warning">
            <h2>Sign-in issue</h2>
            <p>{error}</p>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export function AuthGate() {
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [buttonRendered, setButtonRendered] = useState(false);
  const buttonElementRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const configError = getGateConfigError();

    if (configError) {
      setError(configError);
      return;
    }

    if (!scriptReady || initializedRef.current || !buttonElementRef.current || !window.google?.accounts.id) {
      return;
    }

    initializedRef.current = true;
    buttonElementRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: getGoogleClientId(),
      callback: async (response) => {
        if (!response.credential) {
          setError("Google sign-in did not return a usable credential.");
          return;
        }

        setIsSigningIn(true);
        setError(null);

        try {
          const sessionResponse = await fetch("/api/auth/google/session", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ credential: response.credential }),
            cache: "no-store",
          });
          const payload = (await sessionResponse.json().catch(() => null)) as { error?: string } | null;

          if (!sessionResponse.ok) {
            throw new Error(payload?.error ?? `Google sign-in failed with status ${sessionResponse.status}.`);
          }

          window.location.reload();
        } catch (sessionError) {
          setError(sessionError instanceof Error ? sessionError.message : "Google sign-in failed.");
          setIsSigningIn(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: "signin",
    });

    window.google.accounts.id.renderButton(buttonElementRef.current, {
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "signin_with",
      logo_alignment: "left",
      width: 260,
    });
    setButtonRendered(true);
  }, [scriptReady]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptReady(true);

          if (!window.google?.accounts.id) {
            setError("Google Identity Services failed to load.");
          }
        }}
      />
      <LockedDashboardScreen
        buttonRef={(node) => {
          buttonElementRef.current = node;
        }}
        error={error}
        isSigningIn={isSigningIn}
        showFallbackButton={!buttonRendered}
      />
    </>
  );
}
