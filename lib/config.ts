import type { DashboardProperty } from "@/lib/types";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
const AUTHORIZED_ORIGINS = (process.env.NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isDashboardProperty(value: unknown): value is DashboardProperty {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.label === "string" &&
    candidate.label.trim().length > 0 &&
    (candidate.sortOrder === undefined || typeof candidate.sortOrder === "number")
  );
}

export function parseDashboardProperties(rawValue: string | undefined): DashboardProperty[] {
  if (!rawValue?.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("NEXT_PUBLIC_GA_PROPERTIES_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed) || !parsed.every(isDashboardProperty)) {
    throw new Error(
      "NEXT_PUBLIC_GA_PROPERTIES_JSON must be an array of { id, label, sortOrder? } objects.",
    );
  }

  return [...parsed].sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.label.localeCompare(right.label);
  });
}

export const dashboardProperties = parseDashboardProperties(
  process.env.NEXT_PUBLIC_GA_PROPERTIES_JSON,
);

export function getGoogleClientId(): string {
  return GOOGLE_CLIENT_ID;
}

export function getAuthorizedOrigins(): string[] {
  return AUTHORIZED_ORIGINS;
}

