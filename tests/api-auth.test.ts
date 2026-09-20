import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
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
import { GET as barcode } from "@/app/api/foods/barcode/route";
import { GET as listMeals, POST as createMeal, PUT as updateMeal, DELETE as deleteMeal } from "@/app/api/meals/route";
import type { CustomMeal, Food } from "@/lib/meals";
import { getCurrentUser } from "@/lib/auth";

const secret = "0123456789abcdef".repeat(4);
const database = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) {
  database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
}
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
const mealDraft = { name: "Soup", totalGrams: 1814.36948, servingGrams: 453.59237, ingredients: [
  { food: { id: "beef", name: "Beef", source: "Test", servingGrams: 100, servingLabel: "100 g", calories: 200, protein: 20, carbs: 10, fat: 5 }, quantity: 600, unit: "grams" },
] };
const routes = [
  ["GET", "/api/meals", listMeals, undefined],
  ["POST", "/api/meals", createMeal, mealDraft],
  ["PUT", "/api/meals?id=example", updateMeal, mealDraft],
  ["DELETE", "/api/meals?id=example", deleteMeal, undefined],
  ["GET", "/api/day", day, undefined],
  ["GET", "/api/trends", trends, undefined],
  ["GET", "/api/foods/search?q=a", search, undefined],
  ["GET", "/api/foods/barcode?code=012345678905", barcode, undefined],
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
  database.exec("DELETE FROM entries; DELETE FROM goals; DELETE FROM custom_meals;");
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


describe("saved meals", () => {
  it("persists ingredient snapshots, recalculates nutrition, and isolates every operation by account", async () => {
    const response = await call(createMeal, "/api/meals", { method: "POST", user: "auth0|alice", body: { ...mealDraft, userId: "auth0|bob", calories: 9999 } });
    expect(response.status).toBe(201);
    const { meal, food } = await response.json() as { meal: CustomMeal; food: Food };
    expect(meal.ingredients).toEqual(mealDraft.ingredients);
    expect(food.calories * 453.59237 / 100).toBeCloseTo(300, 8);
    const own = await (await call(listMeals, "/api/meals", { user: "auth0|alice" })).json() as { meals: CustomMeal[] };
    expect(own.meals).toHaveLength(1);
    expect(own.meals[0].id).toBe(meal.id);
    expect(await (await call(listMeals, "/api/meals", { user: "auth0|bob" })).json()).toEqual({ meals: [] });
    expect((await call(updateMeal, `/api/meals?id=${meal.id}`, { method: "PUT", user: "auth0|bob", body: { ...mealDraft, name: "Stolen" } })).status).toBe(404);
    expect((await call(deleteMeal, `/api/meals?id=${meal.id}`, { method: "DELETE", user: "auth0|bob" })).status).toBe(404);
    const updated = await call(updateMeal, `/api/meals?id=${meal.id}`, { method: "PUT", user: "auth0|alice", body: { ...mealDraft, name: "Soup v2", totalGrams: 907.18474 } });
    expect(updated.status).toBe(200);
    expect((await updated.json() as { food: Food }).food.calories * 453.59237 / 100).toBeCloseTo(600, 8);
    expect((await call(deleteMeal, `/api/meals?id=${meal.id}`, { method: "DELETE", user: "auth0|alice" })).status).toBe(200);
    expect((await (await call(listMeals, "/api/meals", { user: "auth0|alice" })).json() as { meals: CustomMeal[] }).meals).toEqual([]);
  });
  it("validates recipes and rejects cross-origin meal writes", async () => {
    expect((await call(createMeal, "/api/meals", { method: "POST", user: "auth0|alice", body: { ...mealDraft, totalGrams: 0 } })).status).toBe(400);
    for (const [method, handler] of [["POST", createMeal], ["PUT", updateMeal], ["DELETE", deleteMeal]] as const) {
      expect((await call(handler, "/api/meals?id=anything", { method, user: "auth0|alice", body: mealDraft, headers: { origin: "https://evil.test" } })).status).toBe(403);
    }
    expect(database.prepare("SELECT * FROM custom_meals").all()).toEqual([]);
  });
});
