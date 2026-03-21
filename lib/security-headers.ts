const DEFAULT_SRC = ["'self'"];
const SCRIPT_SRC = ["'self'", "'unsafe-inline'", "https://accounts.google.com"];
const CONNECT_SRC = [
  "'self'",
  "https://analyticsadmin.googleapis.com",
  "https://analyticsdata.googleapis.com",
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  "https://api.github.com",
];
const IMG_SRC = ["'self'", "data:"];
const STYLE_SRC = ["'self'", "'unsafe-inline'"];
const FONT_SRC = ["'self'", "data:"];

export type SecurityHeader = {
  key: string;
  value: string;
};

export function buildContentSecurityPolicy(isProduction: boolean): string {
  const directives = [
    `default-src ${DEFAULT_SRC.join(" ")}`,
    `script-src ${SCRIPT_SRC.join(" ")}`,
    `connect-src ${CONNECT_SRC.join(" ")}`,
    `img-src ${IMG_SRC.join(" ")}`,
    `style-src ${STYLE_SRC.join(" ")}`,
    `font-src ${FONT_SRC.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];

  if (isProduction) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function getSecurityHeaders(isProduction: boolean): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isProduction),
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
  ];
}
