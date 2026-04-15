import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
export const DASHBOARD_AUTH_COOKIE_NAME = "gadash.auth";
export const GITHUB_AUTH_COOKIE_NAME = "gadash.github";
const AUTH_SESSION_LIFETIME_SECONDS = 60 * 60 * 24;
let developmentSessionSecret: string | null = null;

type DashboardSessionPayload = {
  email: string;
  exp: number;
  iat: number;
};

type GitHubSessionPayload = {
  accessToken: string;
  scope: string;
  exp: number;
  iat: number;
};

type GoogleTokenInfo = {
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iss?: unknown;
};

type FetchLike = typeof fetch;

export type DashboardSession = {
  email: string;
  expiresAt: number;
  issuedAt: number;
};

export type GitHubSession = {
  accessToken: string;
  scope: string;
  expiresAt: number;
  issuedAt: number;
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret(): string {
  const configuredSecret = process.env.AUTH_SESSION_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    return "";
  }

  // Keep local development and tests usable even if the cookie-signing secret
  // has not been configured yet. Production still requires an explicit secret.
  if (!developmentSessionSecret) {
    developmentSessionSecret = randomBytes(32).toString("base64url");
  }

  return developmentSessionSecret;
}

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

function getSignature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function parseNumericTimestamp(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAllowedGoogleEmails(rawValue: string | undefined): string[] {
  const emails = (rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(emails)];
}

export function getAllowedGoogleEmails(): string[] {
  return parseAllowedGoogleEmails(process.env.ALLOWED_GOOGLE_EMAILS);
}

export function createDashboardSessionValue(
  email: string,
  secret = getSessionSecret(),
  now = Date.now(),
  lifetimeSeconds = AUTH_SESSION_LIFETIME_SECONDS,
): string {
  if (secret.length === 0) {
    throw new Error("Missing AUTH_SESSION_SECRET server configuration.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.length === 0) {
    throw new Error("Dashboard session email is required.");
  }

  const issuedAt = Math.floor(now / 1000);
  const payload: DashboardSessionPayload = {
    email: normalizedEmail,
    iat: issuedAt,
    exp: issuedAt + lifetimeSeconds,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = getSignature(encodedPayload, secret).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function createGitHubSessionValue(
  accessToken: string,
  scope: string,
  secret = getSessionSecret(),
  now = Date.now(),
  lifetimeSeconds = AUTH_SESSION_LIFETIME_SECONDS,
): string {
  if (secret.length === 0) {
    throw new Error("Missing AUTH_SESSION_SECRET server configuration.");
  }

  const normalizedAccessToken = accessToken.trim();

  if (normalizedAccessToken.length === 0) {
    throw new Error("GitHub session access token is required.");
  }

  const issuedAt = Math.floor(now / 1000);
  const payload: GitHubSessionPayload = {
    accessToken: normalizedAccessToken,
    scope: scope.trim(),
    iat: issuedAt,
    exp: issuedAt + lifetimeSeconds,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = getSignature(encodedPayload, secret).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

export function readDashboardSessionValue(
  value: string | null | undefined,
  secret = getSessionSecret(),
  now = Date.now(),
): DashboardSession | null {
  if (!value || secret.length === 0) {
    return null;
  }

  const [encodedPayload, encodedSignature, extraPart] = value.split(".");

  if (!encodedPayload || !encodedSignature || extraPart) {
    return null;
  }

  try {
    const expectedSignature = getSignature(encodedPayload, secret);
    const actualSignature = Buffer.from(encodedSignature, "base64url");

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<DashboardSessionPayload>;
    const exp = parseNumericTimestamp(payload.exp);
    const iat = parseNumericTimestamp(payload.iat);
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

    if (!email || exp === null || iat === null || exp <= Math.floor(now / 1000)) {
      return null;
    }

    return {
      email,
      expiresAt: exp * 1000,
      issuedAt: iat * 1000,
    };
  } catch {
    return null;
  }
}

export function readGitHubSessionValue(
  value: string | null | undefined,
  secret = getSessionSecret(),
  now = Date.now(),
): GitHubSession | null {
  if (!value || secret.length === 0) {
    return null;
  }

  const [encodedPayload, encodedSignature, extraPart] = value.split(".");

  if (!encodedPayload || !encodedSignature || extraPart) {
    return null;
  }

  try {
    const expectedSignature = getSignature(encodedPayload, secret);
    const actualSignature = Buffer.from(encodedSignature, "base64url");

    if (
      expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<GitHubSessionPayload>;
    const exp = parseNumericTimestamp(payload.exp);
    const iat = parseNumericTimestamp(payload.iat);
    const accessToken =
      typeof payload.accessToken === "string" ? payload.accessToken.trim() : "";

    if (!accessToken || exp === null || iat === null || exp <= Math.floor(now / 1000)) {
      return null;
    }

    return {
      accessToken,
      scope: typeof payload.scope === "string" ? payload.scope : "",
      expiresAt: exp * 1000,
      issuedAt: iat * 1000,
    };
  } catch {
    return null;
  }
}

function getCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();

    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1);
    }
  }

  return null;
}

export function readDashboardSessionFromRequest(
  request: Pick<Request, "headers">,
  secret = getSessionSecret(),
  now = Date.now(),
): DashboardSession | null {
  const cookieHeader = request.headers.get("cookie");
  const cookieValue = getCookieValue(cookieHeader, DASHBOARD_AUTH_COOKIE_NAME);

  return readDashboardSessionValue(cookieValue, secret, now);
}

export function readGitHubSessionFromRequest(
  request: Pick<Request, "headers">,
  secret = getSessionSecret(),
  now = Date.now(),
): GitHubSession | null {
  const cookieHeader = request.headers.get("cookie");
  const cookieValue = getCookieValue(cookieHeader, GITHUB_AUTH_COOKIE_NAME);

  return readGitHubSessionValue(cookieValue, secret, now);
}

export function setDashboardSessionCookie(response: NextResponse, email: string): void {
  response.cookies.set(DASHBOARD_AUTH_COOKIE_NAME, createDashboardSessionValue(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: AUTH_SESSION_LIFETIME_SECONDS,
  });
}

export function clearDashboardSessionCookie(response: NextResponse): void {
  response.cookies.set(DASHBOARD_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export function setGitHubSessionCookie(
  response: NextResponse,
  accessToken: string,
  scope: string,
): void {
  response.cookies.set(GITHUB_AUTH_COOKIE_NAME, createGitHubSessionValue(accessToken, scope), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: AUTH_SESSION_LIFETIME_SECONDS,
  });
}

export function clearGitHubSessionCookie(response: NextResponse): void {
  response.cookies.set(GITHUB_AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function verifyGoogleIdentityCredential(
  credential: string,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
): Promise<{ email: string }> {
  const audience = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

  if (audience.length === 0) {
    throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID server configuration.");
  }

  const response = await fetchImpl(`${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(credential)}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as GoogleTokenInfo | null;

  if (!response.ok || !payload) {
    throw new Error("Google identity credential could not be verified.");
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const exp = parseNumericTimestamp(payload.exp);
  const issuer = typeof payload.iss === "string" ? payload.iss : "";

  if (!email || payload.aud !== audience || !parseBoolean(payload.email_verified) || exp === null) {
    throw new Error("Google identity credential is invalid.");
  }

  if (exp <= Math.floor(now / 1000)) {
    throw new Error("Google identity credential has expired.");
  }

  if (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") {
    throw new Error("Google identity credential issuer is invalid.");
  }

  if (!getAllowedGoogleEmails().includes(email)) {
    throw new Error("This Google account is not allowed to access GADash.");
  }

  return { email };
}
