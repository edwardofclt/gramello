import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ env: {
  AUTH0_DOMAIN: "nourish-tests.us.auth0.com",
  AUTH0_CLIENT_ID: "test-client",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: "0123456789abcdef".repeat(4),
  APP_BASE_URL: "https://nourish.test",
} }));
vi.mock("cloudflare:workers", () => runtime);

const issuer = "https://nourish-tests.us.auth0.com/";
const base = "https://nourish.test";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
let authorization: URL;
let invalidNonce = false;
let tokenRequests = 0;

beforeEach(() => {
  vi.resetModules();
  invalidNonce = false;
  tokenRequests = 0;
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${issuer}.well-known/openid-configuration`) {
      return Response.json({
        issuer, authorization_endpoint: `${issuer}authorize`, token_endpoint: `${issuer}oauth/token`,
        jwks_uri: `${issuer}.well-known/jwks.json`, end_session_endpoint: `${issuer}oidc/logout`,
        response_types_supported: ["code"], subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"], token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }
    if (url === `${issuer}.well-known/jwks.json`) {
      return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] });
    }
    if (url === `${issuer}oauth/token`) {
      tokenRequests++;
      const body = new URLSearchParams(init?.body as URLSearchParams);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("test-code");
      expect(body.get("redirect_uri")).toBe(`${base}/auth/callback`);
      expect(body.get("client_secret")).toBe("test-client-secret");
      expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(authorization.searchParams.get("code_challenge"));
      const now = Math.floor(Date.now() / 1000);
      const payload = { iss: issuer, sub: "auth0|alice", aud: "test-client", iat: now, exp: now + 3600,
        nonce: invalidNonce ? "wrong-nonce" : authorization.searchParams.get("nonce"), name: "Alice", email: "alice@example.com" };
      const signingInput = [JSON.stringify({ alg: "RS256", kid: "test-key" }), JSON.stringify(payload)]
        .map((part) => Buffer.from(part).toString("base64url")).join(".");
      const idToken = `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
      return Response.json({ access_token: "unused", token_type: "Bearer", expires_in: 3600, id_token: idToken });
    }
    throw new Error(`Unexpected network request: ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

async function startLogin() {
  const { proxy } = await import("@/proxy");
  const response = await proxy(new NextRequest(`${base}/auth/login?returnTo=https://evil.test`));
  expect(response.status).toBe(307);
  authorization = new URL(response.headers.get("location")!);
  expect(authorization.origin).toBe("https://nourish-tests.us.auth0.com");
  expect(authorization.searchParams.get("client_id")).toBe("test-client");
  expect(authorization.searchParams.get("redirect_uri")).toBe(`${base}/auth/callback`);
  expect(authorization.searchParams.get("response_type")).toBe("code");
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorization.searchParams.get("scope")).toBe("openid profile email");
  expect(response.headers.get("set-cookie")).toMatch(/httponly/i);
  expect(response.headers.get("set-cookie")).toMatch(/secure/i);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { proxy, cookie, state: authorization.searchParams.get("state")! };
}

it("completes authorization code + PKCE login, restricts redirects, and clears the session on logout", async () => {
  const { proxy, cookie, state } = await startLogin();
  const response = await proxy(new NextRequest(`${base}/auth/callback?code=test-code&state=${state}`, { headers: { cookie } }));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(`${base}/`);
  expect(tokenRequests).toBe(1);
  const sessionCookie = response.headers.getSetCookie().find((value) => value.startsWith("__session="))!;
  expect(sessionCookie).toMatch(/httponly/i);
  expect(sessionCookie).toMatch(/secure/i);
  const sessionRequest = new NextRequest(base, { headers: { cookie: sessionCookie.split(";")[0] } });
  const { getAuth0 } = await import("@/lib/auth0");
  expect((await getAuth0().getSession(sessionRequest))?.user.sub).toBe("auth0|alice");
  const logout = await proxy(new NextRequest(`${base}/auth/logout`, { headers: sessionRequest.headers }));
  expect(logout.status).toBe(307);
  expect(new URL(logout.headers.get("location")!).origin).toBe("https://nourish-tests.us.auth0.com");
  expect(logout.headers.getSetCookie().some((value) => value.startsWith("__session=;") && /max-age=0/i.test(value))).toBe(true);
});

it("rejects a callback with an invalid state without requesting tokens", async () => {
  const { proxy, cookie } = await startLogin();
  const response = await proxy(new NextRequest(`${base}/auth/callback?code=test-code&state=forged`, { headers: { cookie } }));
  expect(response.headers.get("location")).toBe(`${base}/?auth_error=1`);
  expect(tokenRequests).toBe(0);
  expect(response.headers.getSetCookie().some((value) => value.startsWith("__session="))).toBe(false);
});

it("does not create a session when the ID token nonce is invalid", async () => {
  const { proxy, cookie, state } = await startLogin();
  invalidNonce = true;
  const response = await proxy(new NextRequest(`${base}/auth/callback?code=test-code&state=${state}`, { headers: { cookie } }));
  expect(response.headers.get("location")).toBe(`${base}/?auth_error=1`);
  expect(tokenRequests).toBe(1);
  expect(response.headers.getSetCookie().some((value) => value.startsWith("__session="))).toBe(false);
});
