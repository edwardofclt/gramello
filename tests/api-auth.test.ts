import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { POST as customFood } from "@/app/api/foods/custom/route";
import { GET as barcode } from "@/app/api/foods/barcode/route";
import type { Food } from "@/lib/food";
import type { EntryInput } from "@/db/store";
import { getCurrentUser } from "@/lib/auth";

const secret = "0123456789abcdef".repeat(4);
const database = new DatabaseSync(":memory:");
database.exec(readFileSync(new URL("../drizzle/0000_silent_ultragirl.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../drizzle/0001_gray_odin.sql", import.meta.url), "utf8"));
database.exec(readFileSync(new URL("../drizzle/0002_food_catalog.sql", import.meta.url), "utf8"));
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
  ["GET", "/api/foods/barcode?code=012345678905", barcode, undefined],
  ["PUT", "/api/goals", goals, targets],
  ["POST", "/api/entries", add, food],
  ["POST", "/api/foods/custom", customFood, food],
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
  database.exec("DELETE FROM entries; DELETE FROM goals; DELETE FROM foods;");
  Object.assign(runtime.env, configuration);
});
afterAll(() => database.close());
afterEach(() => vi.unstubAllGlobals());

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


describe("shared food catalog", () => {
  const custom = { name: "Test bowl", servingLabel: "1 bowl", calories: 605, protein: 30, carbs: 65, fat: 25 };
  it("shares custom foods while discarding forged source and verification fields", async () => {
    const response = await call(customFood, "/api/foods/custom", { method: "POST", user: "auth0|alice", body: { ...custom, verified: true, source: "USDA", sourceKind: "database", userId: "auth0|bob" } });
    expect(response.status).toBe(201);
    const { food: created } = await response.json() as { food: Food };
    expect(created).toMatchObject({ ...custom, verified: false, source: "Community submitted", sourceKind: "custom", nutritionBasis: "serving", servingGrams: null });
    expect(created).not.toHaveProperty("createdBy");
    expect(database.prepare("SELECT created_by, verified FROM foods").get()).toMatchObject({ created_by: "auth0|alice", verified: 0 });
    vi.stubGlobal("fetch", async () => Response.json({ foods: [], products: [] }));
    const results = await (await call(search, "/api/foods/search?q=Test%20bowl", { user: "auth0|bob" })).json() as { foods: Food[] };
    expect(results.foods).toContainEqual(created);
    const added = await call(add, "/api/entries", { method: "POST", user: "auth0|bob", body: { date: food.date, meal: "Dinner", sourceId: created.id, quantity: .5, unit: "serving", verified: true } });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ calories: 302.5, protein: 15, carbs: 32.5, fat: 12.5, grams: null, verified: false });
    const bob = await (await call(day, `/api/day?date=${food.date}`, { user: "auth0|bob" })).json() as { entries: EntryInput[] };
    expect(bob.entries[0]).toMatchObject({ verified: false, servingLabel: "1 bowl", grams: null });
    const alice = await (await call(day, `/api/day?date=${food.date}`, { user: "auth0|alice" })).json() as { entries: EntryInput[] };
    expect(alice.entries).toHaveLength(0);
  });
  it.each([null, {}, { ...custom, calories: "" }, { ...custom, fat: -1 }, { ...custom, protein: null }])("rejects incomplete nutrition without creating a food", async body => {
    const response = await call(customFood, "/api/foods/custom", { method: "POST", user: "auth0|alice", body });
    expect(response.status).toBe(400);
    expect(database.prepare("SELECT * FROM foods").all()).toHaveLength(0);
  });
  it("ignores forged nutrition for a verified catalog food", async () => {
    database.exec("INSERT INTO foods (id,name,brand,source,source_kind,source_url,verified,nutrition_basis,serving_label,calories,protein,carbs,fat,created_at) VALUES ('restaurant-test-bowl','Bowl','Test chain','Official restaurant nutrition','restaurant','https://example.com/nutrition',1,'serving','1 bowl',600,30,65,25,'today')");
    const response = await call(add, "/api/entries", { method: "POST", user: "auth0|alice", body: { ...food, sourceId: "restaurant-test-bowl", name: "Forged", calories: 1, protein: 1, quantity: .5 } });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: "Bowl", calories: 300, protein: 15, grams: null, verified: true, sourceUrl: "https://example.com/nutrition" });
    const responseDay = await (await call(day, `/api/day?date=${food.date}`, { user: "auth0|alice" })).json() as { entries: EntryInput[] };
    expect(responseDay.entries[0].verified).toBe(true);
  });
  it("never trusts a verification claim on a legacy arbitrary entry", async () => {
    const response = await call(add, "/api/entries", { method: "POST", user: "auth0|alice", body: { ...food, source: "USDA FoodData Central", sourceId: "usda-fake", verified: true } });
    expect(response.status).toBe(201);
    expect(await response.json()).toHaveProperty("verified", false);
  });
  it("reports provider outages while preserving local matches", async () => {
    await call(customFood, "/api/foods/custom", { method: "POST", user: "auth0|alice", body: custom });
    vi.stubGlobal("fetch", async () => { throw new Error("Provider unavailable"); });
    const response = await call(search, "/api/foods/search?q=Test%20bowl", { user: "auth0|alice" });
    expect(response.status).toBe(200);
    const result = await response.json() as { partial: boolean; foods: Food[] };
    expect(result.partial).toBe(true);
    expect(result.foods).toHaveLength(1);
  });
});

it("prioritizes an exact restaurant brand over unrelated branded products", async () => {
  database.exec("INSERT INTO foods (id,name,brand,source,source_kind,verified,nutrition_basis,serving_label,calories,protein,carbs,fat,created_at) VALUES ('restaurant-viva-test','Chicken meal','Viva Chicken','Official restaurant nutrition','restaurant',1,'serving','1 meal',600,30,65,25,'today'),('off-unrelated','Chicken chips','Viva','Open Food Facts','database',1,'serving','1 bag',400,5,40,24,'today')");
  vi.stubGlobal("fetch", async () => Response.json({ foods: [], products: [] }));
  const response = await call(search, "/api/foods/search?q=Viva%20Chicken", { user: "auth0|alice" });
  const result = await response.json() as { foods: Food[] };
  expect(result.foods.map(item => item.id)).toEqual(['restaurant-viva-test', 'off-unrelated']);
});
