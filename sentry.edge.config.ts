import * as Sentry from "@sentry/nextjs";

import { getServerSentryOptions } from "./lib/sentry";

Sentry.init({
  ...getServerSentryOptions(),
});
