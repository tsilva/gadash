const PLACEHOLDER_ENV_VALUES = new Set([
  "your-github-oauth-client-id",
  "your-github-oauth-client-secret",
]);

export function normalizeEnvValue(value: string | undefined): string {
  const normalized = value?.trim() ?? "";

  return PLACEHOLDER_ENV_VALUES.has(normalized) ? "" : normalized;
}
