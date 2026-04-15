const DEFAULT_SRC = ["'self'"];
const SCRIPT_SRC = ["'self'", "https://accounts.google.com"];
const FRAME_SRC = ["'self'", "https://accounts.google.com"];
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
const DEVELOPMENT_SCRIPT_SRC = ["'unsafe-eval'"];
const DEVELOPMENT_CONNECT_SRC = ["ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*"];

export const NONCE_HEADER_NAME = "x-nonce";

export type SecurityHeader = {
  key: string;
  value: string;
};

export function buildContentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const scriptSrc = [...SCRIPT_SRC, `'nonce-${nonce}'`];
  const connectSrc = [...CONNECT_SRC];

  if (!isProduction) {
    scriptSrc.push(...DEVELOPMENT_SCRIPT_SRC);
    connectSrc.push(...DEVELOPMENT_CONNECT_SRC);
  }

  const directives = [
    `default-src ${DEFAULT_SRC.join(" ")}`,
    `script-src ${scriptSrc.join(" ")}`,
    `frame-src ${FRAME_SRC.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
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

export function getSecurityHeaders(nonce: string, isProduction: boolean): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(nonce, isProduction),
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
