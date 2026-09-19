import { getAuth0, getAuthConfiguration } from "./auth0";
import {
  authenticateMobileBearer,
  InvalidMobileTokenError,
  MobileAuthConfigurationError,
  MobileAuthUnavailableError,
} from "./mobile-auth";

export type AuthUser = { userId: string; displayName: string; email: string | null };

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getAuth0().getSession();
  if (!session || typeof session.user.sub !== "string" || !session.user.sub) return null;
  const email = typeof session.user.email === "string" ? session.user.email : null;
  const name = typeof session.user.name === "string" && session.user.name ? session.user.name : null;
  return { userId: session.user.sub, displayName: name ?? email ?? "Your account", email };
}

export function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie, Authorization");
  return response;
}

export async function withAuthenticatedUser(
  request: Request,
  handler: (user: AuthUser) => Promise<Response>,
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    try {
      const user = await authenticateMobileBearer(authorization);
      return privateResponse(await handler(user));
    } catch (error) {
      if (error instanceof MobileAuthConfigurationError || error instanceof MobileAuthUnavailableError) {
        return privateResponse(Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }));
      }
      if (error instanceof InvalidMobileTokenError) {
        return privateResponse(Response.json({ error: "Please sign in to continue." }, { status: 401 }));
      }
      return privateResponse(Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }));
    }
  }
  let user: AuthUser | null;
  try {
    user = await getCurrentUser();
  } catch {
    return privateResponse(Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }));
  }
  if (!user) {
    return privateResponse(Response.json({ error: "Please sign in to continue." }, { status: 401 }));
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (request.headers.get("origin") !== getAuthConfiguration().appBaseUrl ||
        request.headers.get("sec-fetch-site") === "cross-site") {
      return privateResponse(Response.json({ error: "This request is not allowed." }, { status: 403 }));
    }
  }
  return privateResponse(await handler(user));
}
