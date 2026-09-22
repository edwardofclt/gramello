import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from "jose";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ request: null as NextRequest | null }));
const runtime = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => runtime);
vi.mock("next/headers.js", () => ({
  cookies: async () => context.request!.cookies,
  headers: async () => context.request!.headers,
}));

import { GET as day } from "@/app/api/day/route";
import { POST as add, DELETE as remove } from "@/app/api/entries/route";

const secret = "0123456789abcdef".repeat(4);
const issuer = "https://gramello-tests.us.auth0.com/";
const audience = "https://api.gramello.test";
const mobileClientId = "gramello-native";
const configuration = {
  AUTH0_DOMAIN: "gramello-tests.us.auth0.com",
  AUTH0_CLIENT_ID: "gramello-web",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: secret,
  APP_BASE_URL: "https://gramello.test",
  AUTH0_AUDIENCE: audience,
  AUTH0_MOBILE_CLIENT_ID: mobileClientId,
};

const database = new DatabaseSync(":memory:");
database.exec(readFileSync(new URL("../drizzle/0000_silent_ultragirl.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../drizzle/0001_gray_odin.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../drizzle/0003_food_catalog.sql", import.meta.url), "utf8"));
Object.assign(runtime.env, configuration, {
  DB: {
    prepare(sql: string) {
      return { bind(...args: (string | number | null)[]) {
        const statement = database.prepare(sql);
        return {
          first: async () => statement.get(...args) ?? null,
          all: async () => ({ results: statement.all(...args) }),
          run: async () => statement.run(...args),
        };
      } };
    },
  },
});

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: { keys: JWK[] };
const kid = "mobile-test-key";
const food = { date: "2026-09-19", meal: "Breakfast", name: "Oats", source: "custom", quantity: 1, unit: "serving", grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3 };

beforeAll(async () => {
  ({ privateKey: otherPrivateKey } = await generateKeyPair("RS256"));
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid, use: "sig", alg: "RS256" }] };
});

async function token(overrides: JWTPayload = {}, key = privateKey, protectedHeader: Record<string, string> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: "auth0|alice", azp: mobileClientId, iss: issuer, aud: audience,
    iat: now, exp: now + 3600, ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid, typ: "at+jwt", ...protectedHeader })
    .sign(key);
}

async function cookie(user: string) {
  return generateSessionCookie({
    user: { sub: user, name: "Cookie User", email: "cookie@example.com" },
    tokenSet: { accessToken: "test-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    internal: { sid: "test-session", createdAt: Math.floor(Date.now() / 1000) },
  }, { secret });
}

async function call(handler: (request: Request) => Promise<Response>, path: string, options: {
  method?: string; body?: unknown; bearer?: string; cookieUser?: string; origin?: string;
} = {}) {
  const session = options.cookieUser ? await cookie(options.cookieUser) : undefined;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.origin !== undefined) headers.origin = options.origin;
  if (options.bearer !== undefined) headers.authorization = options.bearer;
  if (session) headers.cookie = `__session=${session}`;
  const request = new NextRequest(`https://gramello.test${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  context.request = request;
  return handler(request);
}

beforeEach(() => {
  database.exec("DELETE FROM entries; DELETE FROM goals;");
  Object.assign(runtime.env, configuration);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === `${issuer}.well-known/jwks.json`) return Response.json(jwks);
    throw new Error(`Unexpected network request: ${url}`);
  }));
});

afterAll(() => {
  database.close();
  vi.unstubAllGlobals();
});

describe("native bearer authentication", () => {
  it("accepts a signed native access token and varies private responses by both credentials", async () => {
    const response = await call(day, "/api/day?date=2026-09-19", { bearer: `Bearer ${await token()}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
    expect(response.headers.get("vary")).toContain("Authorization");
  });

  it("allows native writes without an Origin and uses the verified subject for data isolation", async () => {
    const aliceToken = await token();
    const bobToken = await token({ sub: "auth0|bob" });
    const created = await call(add, "/api/entries", { method: "POST", body: { ...food, userId: "auth0|bob" }, bearer: `Bearer ${aliceToken}` });
    expect(created.status).toBe(201);
    const entry = await created.json() as { id: string };

    const alice = await (await call(day, "/api/day?date=2026-09-19", { bearer: `Bearer ${aliceToken}` })).json() as { entries: unknown[] };
    const bob = await (await call(day, "/api/day?date=2026-09-19", { bearer: `Bearer ${bobToken}` })).json() as { entries: unknown[] };
    expect(alice.entries).toHaveLength(1);
    expect(bob.entries).toEqual([]);

    expect((await call(remove, `/api/entries?id=${entry.id}`, { method: "DELETE", bearer: `Bearer ${bobToken}` })).status).toBe(200);
    expect(database.prepare("SELECT user_id FROM entries").get()).toMatchObject({ user_id: "auth0|alice" });
  });

  it.each([
    ["wrong signature", async () => token({}, otherPrivateKey)],
    ["wrong issuer", async () => token({ iss: "https://evil.test/" })],
    ["wrong audience", async () => token({ aud: "https://other-api.test" })],
    ["expired", async () => token({ exp: Math.floor(Date.now() / 1000) - 1 })],
    ["missing expiry", async () => token({ exp: undefined })],
    ["missing subject", async () => token({ sub: "" })],
    ["unapproved native client", async () => token({ azp: "other-native-client" })],
    ["contradictory client claims", async () => token({ azp: "other-native-client", client_id: mobileClientId })],
    ["M2M subject without grant claim", async () => token({ sub: `${mobileClientId}@clients` })],
    ["machine-to-machine token", async () => token({ gty: "client-credentials" })],
    ["ID token", async () => token({ aud: mobileClientId }, privateKey, { typ: "JWT" })],
  ])("rejects a %s", async (_name, makeToken) => {
    expect((await call(day, "/api/day", { bearer: `Bearer ${await makeToken()}` })).status).toBe(401);
  });

  it.each(["Bearer", "Bearer ", "Basic abc", "Bearer not-a-jwt"]) (
    "does not fall back to a valid cookie for malformed Authorization: %s",
    async (authorization) => {
      expect((await call(day, "/api/day", { bearer: authorization, cookieUser: "auth0|cookie" })).status).toBe(401);
    },
  );

  it("returns 503 for bearer requests only when mobile configuration is missing", async () => {
    delete runtime.env.AUTH0_AUDIENCE;
    expect((await call(day, "/api/day", { bearer: `Bearer ${await token()}` })).status).toBe(503);
    expect((await call(day, "/api/day", { cookieUser: "auth0|cookie" })).status).toBe(200);
  });

  it("returns 503 when the JWKS endpoint is unavailable", async () => {
    runtime.env.AUTH0_DOMAIN = "unavailable.auth0.com";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network unavailable"); }));
    expect((await call(day, "/api/day", { bearer: `Bearer ${await token({ iss: "https://unavailable.auth0.com/" })}` })).status).toBe(503);
  });

  it("does not report a provider HTTP outage as invalid credentials", async () => {
    runtime.env.AUTH0_DOMAIN = "provider-outage.auth0.com";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
    expect((await call(day, "/api/day", { bearer: `Bearer ${await token({ iss: "https://provider-outage.auth0.com/" })}` })).status).toBe(503);
  });
});
