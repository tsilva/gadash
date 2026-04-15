import { NextResponse, type NextRequest } from "next/server";

import { getSecurityHeaders, NONCE_HEADER_NAME } from "@/lib/security-headers";

function createNonce(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(NONCE_HEADER_NAME, nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  for (const header of getSecurityHeaders(nonce, process.env.NODE_ENV === "production")) {
    response.headers.set(header.key, header.value);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
