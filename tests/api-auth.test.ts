import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
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
import { ghostProduct } from './fixtures/ghost-energy';
import { GET as listMeals, POST as createMeal, PUT as updateMeal, DELETE as deleteMeal } from "@/app/api/meals/route";
import type { CustomMeal } from "@/lib/meals";
import { getCurrentUser } from "@/lib/auth";
import { GET as waterDay, POST as addWater, DELETE as removeWater } from '@/app/api/water/route';
import { PUT as waterGoal } from '@/app/api/water/goals/route';
import type { WaterDay } from '@/lib/water';

const secret = "0123456789abcdef".repeat(4);
const database = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) {
  database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
}
const configuration = {
  AUTH0_DOMAIN: "gramello-tests.us.auth0.com",
  AUTH0_CLIENT_ID: "test-client",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: secret,
  APP_BASE_URL: "https://gramello.test",
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
  ['GET', '/api/water?date=2026-09-19', waterDay, undefined],
  ['POST', '/api/water', addWater, { date: '2026-09-19', amountMl: 250 }],
  ['DELETE', '/api/water?id=example', removeWater, undefined],
  ['PUT', '/api/water/goals', waterGoal, { goalMl: 2500, unit: 'ml' }],
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
  const request = new NextRequest(`https://gramello.test${path}`, {
    method: options.method ?? "GET",
    headers: { origin: "https://gramello.test", "content-type": "application/json", ...(cookie ? { cookie: `__session=${cookie}` } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  context.request = request;
  return handler(request);
}

beforeEach(() => {
  database.exec("DELETE FROM entries; DELETE FROM goals; DELETE FROM foods; DELETE FROM custom_meals; DELETE FROM water_entries; DELETE FROM water_goals;");
  Object.assign(runtime.env, configuration);
});
afterAll(() => database.close());
afterEach(() => vi.unstubAllGlobals());

describe("private API authentication", () => {
  it("reads an anonymous session without relying on identity headers", async () => {
    context.request = new NextRequest("https://gramello.test", { headers: { "oai-authenticated-user-id": "forged" } });
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
  it("caches exact volume servings and logs canonical values across all supported volume units", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ status: 1, product: ghostProduct }));
    const lookup = await call(barcode, "/api/foods/barcode?code=810128528191", { user: "auth0|alice" });
    expect(lookup.status).toBe(200);
    const { food: drink } = await lookup.json() as { food: Food };
    vi.stubGlobal("fetch", async () => { throw new Error("Provider unavailable"); });
    const response = await call(search, "/api/foods/search?q=Energy%20Drink", { user: "auth0|bob" });
    expect((await response.json() as { foods: Food[] }).foods[0]).toMatchObject({ nutritionBasis: '100ml', nutritionUnit: 'ml', servingMl: 473.176, servingGrams: null, verified: true });
    for (const [unit, quantity] of [['serving', 1], ['milliliters', 473.176], ['fluid-ounces', 473.176 / 29.5735295625]] as const) {
      const logged = await call(add, "/api/entries", { method: 'POST', user: 'auth0|bob', body: { ...food, sourceId: drink.id, unit, quantity, calories: 999999 } });
      expect(logged.status).toBe(201);
      const entry = await logged.json() as EntryInput;
      expect(entry.calories).toBeCloseTo(10);
      expect(entry).toMatchObject({ grams: null, verified: true, servingLabel: '16 fl oz' });
    }
    expect((await call(add, "/api/entries", { method: 'POST', user: 'auth0|bob', body: { ...food, sourceId: drink.id, unit: 'grams' } })).status).toBe(400);
  });
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
describe("saved meals", () => {
  it("logs the owner's saved recipe canonically and keeps it unverified", async () => {
    const saved = await call(createMeal, '/api/meals', { method: 'POST', user: 'auth0|alice', body: mealDraft });
    const { food: recipe } = await saved.json() as { food: Food };
    const body = { ...food, sourceId: recipe.id, quantity: 16, unit: 'ounces', calories: 99999, verified: true };
    const logged = await call(add, '/api/entries', { method: 'POST', user: 'auth0|alice', body });
    expect(logged.status).toBe(201);
    expect(await logged.json()).toMatchObject({ name: 'Soup', source: 'My meals', verified: false, calories: 300 });
    expect((await call(add, '/api/entries', { method: 'POST', user: 'auth0|bob', body })).status).toBe(404);
  });
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

describe('water intake', () => {
  const read = async (user = 'auth0|alice', date = '2026-09-19') =>
    (await call(waterDay, `/api/water?date=${date}`, { user })).json() as Promise<WaterDay>;

  it('persists account goals and date-specific entries, prevents cross-account deletion, and leaves nutrition unchanged', async () => {
    expect(await read()).toEqual({ date: '2026-09-19', goal: { goalMl: 2000, unit: 'ml' }, entries: [], totalMl: 0 });
    await call(goals, '/api/goals', { method: 'PUT', body: targets, user: 'auth0|alice' });
    const target = { goalMl: 64 * 29.5735295625, unit: 'fl-oz' };
    expect((await call(waterGoal, '/api/water/goals', { method: 'PUT', body: { ...target, userId: 'auth0|bob' }, user: 'auth0|alice' })).status).toBe(200);
    const response = await call(addWater, '/api/water', { method: 'POST', body: { date: '2026-09-19', amountMl: 16 * 29.5735295625, userId: 'auth0|bob' }, user: 'auth0|alice' });
    expect(response.status).toBe(201);
    const { id } = await response.json() as { id: string };
    await call(addWater, '/api/water', { method: 'POST', body: { date: '2026-09-19', amountMl: 250 }, user: 'auth0|alice' });
    expect(await read()).toMatchObject({ goal: target, totalMl: 723.176473, entries: [{ id }, { amountMl: 250 }] });
    expect(await read('auth0|bob')).toMatchObject({ goal: { goalMl: 2000, unit: 'ml' }, entries: [], totalMl: 0 });
    expect(await read('auth0|alice', '2026-09-18')).toMatchObject({ goal: target, entries: [], totalMl: 0 });
    await call(removeWater, `/api/water?id=${id}`, { method: 'DELETE', user: 'auth0|bob' });
    expect((await read()).entries).toHaveLength(2);
    await call(removeWater, `/api/water?id=${id}`, { method: 'DELETE', user: 'auth0|alice' });
    expect(await read()).toMatchObject({ entries: [{ amountMl: 250 }], totalMl: 250 });
    // Old mobile clients still save nutrition goals without resetting hydration.
    await call(goals, '/api/goals', { method: 'PUT', body: targets, user: 'auth0|alice' });
    expect((await read()).goal).toEqual(target);
    expect(await (await call(day, '/api/day?date=2026-09-19', { user: 'auth0|alice' })).json()).toEqual({ goals: targets, entries: [] });
  });

  it.each([
    { date: '2026-02-30', amountMl: 250 }, { date: 'bad', amountMl: 250 },
    { date: '2026-09-19', amountMl: 0 }, { date: '2026-09-19', amountMl: -10 },
    { date: '2026-09-19', amountMl: 10001 }, { date: '2026-09-19', amountMl: '250' },
    { date: '2026-09-19', amountMl: null }, { amountMl: 250 },
  ])('rejects invalid entries without writing: %j', async body => {
    expect((await call(addWater, '/api/water', { method: 'POST', body, user: 'auth0|alice' })).status).toBe(400);
    expect((await read()).totalMl).toBe(0);
  });

  it('rejects invalid goals, missing dates and malformed bodies', async () => {
    for (const body of [{ goalMl: 0, unit: 'ml' }, { goalMl: 2000, unit: 'oz' }, { goalMl: 10001, unit: 'ml' }, { goalMl: null, unit: 'ml' }]) {
      expect((await call(waterGoal, '/api/water/goals', { method: 'PUT', body, user: 'auth0|alice' })).status).toBe(400);
    }
    expect((await call(waterDay, '/api/water', { user: 'auth0|alice' })).status).toBe(400);
    expect((await call(waterDay, '/api/water?date=2026-02-30', { user: 'auth0|alice' })).status).toBe(400);
    expect((await call(removeWater, '/api/water', { method: 'DELETE', user: 'auth0|alice' })).status).toBe(400);
    expect((await call(addWater, '/api/water', { method: 'POST', user: 'auth0|alice' })).status).toBe(400);
    expect((await read()).goal.goalMl).toBe(2000);
  });

  it('protects all water mutations against cross-origin cookie requests', async () => {
    for (const [method, path, handler, body] of routes.filter(([method, path]) => method !== 'GET' && path.startsWith('/api/water'))) {
      expect((await call(handler, path, { method, body, user: 'auth0|alice', headers: { origin: 'https://evil.test' } })).status).toBe(403);
    }
    expect((await read()).entries).toEqual([]);
  });
});
