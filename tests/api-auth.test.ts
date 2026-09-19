import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ request: null as NextRequest | null }));
const runtime = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => runtime);
vi.mock("next/headers.js", () => ({
  cookies: async () => context.request!.cookies,
  headers: async () => context.request!.headers,
}));

import { GET as day } from "@/app/api/day/route";
import { PUT as goals } from "@/app/api/goals/route";
import { POST as add, DELETE as remove } from "@/app/api/entries/route";
import { GET as trends } from "@/app/api/trends/route";
import { GET as search } from "@/app/api/foods/search/route";
import { getCurrentUser } from "@/lib/auth";

const secret = "0123456789abcdef".repeat(4);
const database = new DatabaseSync(":memory:");
database.exec(readFileSync(new URL("../drizzle/0000_silent_ultragirl.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../drizzle/0001_gray_odin.sql", import.meta.url), "utf8"));
const configuration = {
  AUTH0_DOMAIN: "nourish-tests.us.auth0.com",
  AUTH0_CLIENT_ID: "test-client",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: secret,
  APP_BASE_URL: "https://nourish.test",
};
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

const food = { date: "2026-09-19", meal: "Breakfast", name: "Oats", source: "custom", quantity: 1, unit: "serving", grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3 };
const targets = { calories: 2000, protein: 150, carbs: 200, fat: 67 };
const routes = [
  ["GET", "/api/day", day, undefined],
  ["GET", "/api/trends", trends, undefined],
  ["GET", "/api/foods/search?q=a", search, undefined],
  ["PUT", "/api/goals", goals, targets],
  ["POST", "/api/entries", add, food],
  ["DELETE", "/api/entries?id=example", remove, undefined],
] as const;

async function call(handler: (request: Request) => Promise<Response>, path: string, options: {
  method?: string; body?: unknown; user?: string; headers?: Record<string, string>; expired?: boolean;
} = {}) {
  if (options.expired) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() - 2 * 60 * 60 * 1000);
  }
  const cookie = options.user ? await generateSessionCookie({
    user: { sub: options.user, name: "Test User", email: "test@example.com" },
    tokenSet: { accessToken: "test-token", expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    internal: { sid: "test-session", createdAt: Math.floor(Date.now() / 1000) },
  }, { secret }) : undefined;
  if (options.expired) vi.useRealTimers();
  const request = new NextRequest(`https://nourish.test${path}`, {
    method: options.method ?? "GET",
    headers: { origin: "https://nourish.test", "content-type": "application/json", ...(cookie ? { cookie: `__session=${cookie}` } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  context.request = request;
  return handler(request);
}

beforeEach(() => {
  database.exec("DELETE FROM entries; DELETE FROM goals;");
  Object.assign(runtime.env, configuration);
});
afterAll(() => database.close());

describe("private API authentication", () => {
  it("reads an anonymous session without relying on identity headers", async () => {
    context.request = new NextRequest("https://nourish.test", { headers: { "oai-authenticated-user-id": "forged" } });
    expect(await getCurrentUser()).toBeNull();
  });
  for (const [method, path, handler, body] of routes) {
    it(`${method} ${path} rejects anonymous and forged identity headers`, async () => {
      const response = await call(handler, path, { method, body, headers: { "oai-authenticated-user-id": "victim" } });
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toHaveProperty("error");
    });
  }

  it("rejects invalid and expired session cookies", async () => {
    expect((await call(day, "/api/day", { headers: { cookie: "__session=forged" } })).status).toBe(401);
    expect((await call(day, "/api/day", { user: "auth0|alice", expired: true })).status).toBe(401);
  });

  it("fails closed when configuration is missing", async () => {
    delete runtime.env.AUTH0_CLIENT_SECRET;
    const response = await call(day, "/api/day");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses the verified subject for writes and keeps users and legacy data separate", async () => {
    database.prepare("INSERT INTO goals (user_id, calories, protein, carbs, fat, updated_at) VALUES (?, 9999, 1, 1, 1, 'today')").run("site-owner");
    const response = await call(add, "/api/entries", { method: "POST", body: { ...food, userId: "auth0|bob" }, user: "auth0|alice", headers: { "oai-authenticated-user-id": "auth0|bob" } });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const entry = await response.json() as { id: string };
    expect((await call(goals, "/api/goals", { method: "PUT", body: targets, user: "auth0|alice" })).status).toBe(200);

    const alice = await (await call(day, "/api/day?date=2026-09-19", { user: "auth0|alice" })).json() as { goals: typeof targets; entries: { name: string }[] };
    expect(alice.goals).toEqual(targets);
    expect(alice.entries).toHaveLength(1);
    expect(alice.entries[0].name).toBe("Oats");
    const bob = await (await call(day, "/api/day?date=2026-09-19", { user: "auth0|bob" })).json() as { goals: typeof targets; entries: { name: string }[] };
    expect(bob.entries).toEqual([]);
    expect(bob.goals.calories).toBe(2400);
    expect(await (await call(trends, "/api/trends", { user: "auth0|bob" })).json()).toEqual({ days: [] });

    await call(remove, `/api/entries?id=${entry.id}`, { method: "DELETE", user: "auth0|bob" });
    expect(database.prepare("SELECT user_id FROM entries").get()).toMatchObject({ user_id: "auth0|alice" });
    await call(remove, `/api/entries?id=${entry.id}`, { method: "DELETE", user: "auth0|alice" });
    expect(database.prepare("SELECT * FROM entries").all()).toEqual([]);
  });

  it.each(["https://evil.test", "null", ""]) ("rejects writes with an untrusted origin %s", async (origin) => {
    const response = await call(add, "/api/entries", { method: "POST", body: food, user: "auth0|alice", headers: { origin } });
    expect(response.status).toBe(403);
    expect(database.prepare("SELECT * FROM entries").all()).toEqual([]);
  });
});
