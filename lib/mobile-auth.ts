import { env } from "cloudflare:workers";
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type RemoteJWKSet,
} from "jose";

export class MobileAuthConfigurationError extends Error {
  constructor() {
    super("Native authentication is not configured.");
    this.name = "MobileAuthConfigurationError";
  }
}

export class MobileAuthUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Native authentication is temporarily unavailable.", { cause });
    this.name = "MobileAuthUnavailableError";
  }
}

export class InvalidMobileTokenError extends Error {
  constructor(cause?: unknown) {
    super("The bearer token is invalid.", { cause });
    this.name = "InvalidMobileTokenError";
  }
}

const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function configuration() {
  const { AUTH0_DOMAIN: domain, AUTH0_AUDIENCE: audience,
    AUTH0_MOBILE_CLIENT_ID: mobileClientId } = env;
  if (!domain || !audience || !mobileClientId ||
      domain.includes("://") || domain.includes("/") || /\s/.test(domain)) {
    throw new MobileAuthConfigurationError();
  }
  return { issuer: `https://${domain}/`, audience, mobileClientId };
}

function isTokenError(error: unknown) {
  return error instanceof joseErrors.JOSEError;
}

export async function authenticateMobileBearer(authorization: string) {
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization);
  if (!match) throw new InvalidMobileTokenError();

  const { issuer, audience, mobileClientId } = configuration();
  const jwksUrl = new URL(".well-known/jwks.json", issuer).href;
  let keySet = remoteKeySets.get(jwksUrl);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(jwksUrl));
    remoteKeySets.set(jwksUrl, keySet);
  }

  try {
    const { payload } = await jwtVerify(match[1], keySet as RemoteJWKSet, {
      algorithms: ["RS256"],
      issuer,
      audience,
      requiredClaims: ["exp"],
    });
    if (typeof payload.sub !== "string" || !payload.sub.trim() ||
        payload.sub.endsWith("@clients") ||
        (payload.azp === undefined && payload.client_id === undefined) ||
        (payload.azp !== undefined && payload.azp !== mobileClientId) ||
        (payload.client_id !== undefined && payload.client_id !== mobileClientId) ||
        payload.gty === "client-credentials") {
      throw new InvalidMobileTokenError();
    }
    return { userId: payload.sub, displayName: payload.sub, email: null };
  } catch (error) {
    if (error instanceof InvalidMobileTokenError) throw error;
    if (error instanceof joseErrors.JWKSTimeout || error instanceof joseErrors.JWKSInvalid ||
        (error instanceof joseErrors.JOSEError && error.code === "ERR_JOSE_GENERIC")) {
      throw new MobileAuthUnavailableError(error);
    }
    if (isTokenError(error)) throw new InvalidMobileTokenError(error);
    throw new MobileAuthUnavailableError(error);
  }
}
