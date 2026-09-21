import { env } from "cloudflare:workers";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

export class AuthConfigurationError extends Error {
  constructor() {
    super("Authentication is not configured. Check the server's Auth0 settings.");
    this.name = "AuthConfigurationError";
  }
}

export function getAuthConfiguration() {
  const { AUTH0_DOMAIN: domain, AUTH0_CLIENT_ID: clientId,
    AUTH0_CLIENT_SECRET: clientSecret, AUTH0_SECRET: secret,
    APP_BASE_URL: appBaseUrl } = env;
  if (!domain || !clientId || !clientSecret || !secret || !appBaseUrl ||
      !/^[a-f\d]{64}$/i.test(secret)) {
    throw new AuthConfigurationError();
  }
  let base: URL;
  try { base = new URL(appBaseUrl); } catch { throw new AuthConfigurationError(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
      base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new AuthConfigurationError();
  }
  return { domain, clientId, clientSecret, secret, appBaseUrl: base.origin };
}

let client: Auth0Client | undefined;

export function getAuth0() {
  // Read runtime bindings lazily: images build without tenant secrets.
  const configuration = getAuthConfiguration();
  client ??= new Auth0Client({
    ...configuration,
    authorizationParameters: { scope: "openid profile email" },
    enableAccessTokenEndpoint: false,
    enableConnectAccountEndpoint: false,
    session: {
      rolling: true,
      absoluteDuration: 7 * 24 * 60 * 60,
      inactivityDuration: 24 * 60 * 60,
      cookie: { secure: configuration.appBaseUrl.startsWith("https:"), sameSite: "lax" },
    },
    async onCallback(error) {
      // Gramello has one page. Never reflect provider errors or return URLs.
      return NextResponse.redirect(new URL(error ? "/?auth_error=1" : "/", configuration.appBaseUrl));
    },
  });
  return client;
}
