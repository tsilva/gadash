const DEFAULT_DEVELOPMENT_TRACES_SAMPLE_RATE = 1;
const DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE = 0.1;

function getDefaultTracesSampleRate(): number {
  return process.env.NODE_ENV === "development"
    ? DEFAULT_DEVELOPMENT_TRACES_SAMPLE_RATE
    : DEFAULT_PRODUCTION_TRACES_SAMPLE_RATE;
}

function parseTracesSampleRate(value: string | undefined): number {
  if (!value) {
    return getDefaultTracesSampleRate();
  }

  const parsedValue = Number(value);

  if (Number.isFinite(parsedValue) && parsedValue >= 0 && parsedValue <= 1) {
    return parsedValue;
  }

  return getDefaultTracesSampleRate();
}

function getSentryEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_ENV?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "development"
  );
}

function getSentryRelease(): string | undefined {
  return process.env.SENTRY_RELEASE?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined;
}

export function getClientSentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";

  return {
    dsn,
    enabled: dsn.length > 0 && process.env.NODE_ENV !== "test",
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    tracesSampleRate: parseTracesSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?.trim()),
  };
}

export function getServerSentryOptions() {
  const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";

  return {
    dsn,
    enabled: dsn.length > 0 && process.env.NODE_ENV !== "test",
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    tracesSampleRate: parseTracesSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE?.trim() ||
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?.trim(),
    ),
  };
}
