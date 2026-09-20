import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { generateSessionCookie } from "@auth0/nextjs-auth0/testing";

const directory = await mkdtemp(join(tmpdir(), "nourish-auth-smoke-"));
const secret = randomBytes(32).toString("hex");
const port = process.env.SMOKE_PORT ?? "5197";
const base = `http://localhost:${port}`;
const envFile = join(directory, ".env.test");
const state = join(directory, "data");
const cli = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js"];
let server;
let log = "";

try {
  await writeFile(envFile, [
    "AUTH0_DOMAIN=smoke-test.invalid",
    "AUTH0_CLIENT_ID=smoke-test",
    "AUTH0_CLIENT_SECRET=smoke-test-secret",
    `AUTH0_SECRET=${secret}`,
    `APP_BASE_URL=${base}`,
    "AUTH0_AUDIENCE=https://nourish-api",
    "AUTH0_MOBILE_CLIENT_ID=smoke-native-client",
  ].join("\n"), { mode: 0o600 });
  for (const migration of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    const result = spawnSync(process.execPath, [...cli, "d1", "execute", "DB", "--local",
      "--config", "dist/server/wrangler.json", "--persist-to", state,
      "--file", `drizzle/${migration}`], { encoding: "utf8" });
    assert.equal(result.status, 0, `Migration failed: ${result.stderr}`);
  }
  server = spawn(process.execPath, [...cli, "dev", "--config", "dist/server/wrangler.json",
    "--local", "--persist-to", state, "--env-file", envFile,
    "--ip", "127.0.0.1", "--port", port, "--inspector-port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { log += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Worker exited during startup");
    try {
      const response = await fetch(`${base}/api/day`);
      assert.equal(response.status, 401);
      ready = true;
      break;
    } catch { await delay(500); }
  }
  assert.ok(ready, "Worker did not become ready with authentication enabled");
  const cookie = async (sub) => `__session=${await generateSessionCookie({
    user: { sub, name: sub === "auth0|alice" ? "Alice Smoke" : "Bob Smoke" },
    tokenSet: { accessToken: "unused", expiresAt: Math.floor(Date.now() / 1000) + 3600 },
  }, { secret })}`;
  const alice = await cookie("auth0|alice");
  const bob = await cookie("auth0|bob");
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options, redirect: "manual", headers: { "Content-Type": "application/json", Origin: base, ...options.headers },
  });

  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Sign in to Nourish/);
  const signedIn = await request("/", { headers: { Cookie: alice } });
  assert.equal(signedIn.status, 200);
  assert.match(await signedIn.text(), /Alice Smoke/);
  assert.match(signedIn.headers.get("cache-control"), /no-store/);
  assert.match(signedIn.headers.get("set-cookie"), /HttpOnly/i);
  for (const [method, path] of [["POST", "/api/foods/custom"], ["GET", "/api/day"], ["GET", "/api/trends"], ["GET", "/api/foods/search?q=a"], ["GET", "/api/foods/barcode?code=3017620422003"], ["POST", "/api/entries"], ["PUT", "/api/goals"], ["DELETE", "/api/entries?id=unknown"]]) {
    const response = await request(path, { method, headers: { "oai-authenticated-user-id": "auth0|alice" } });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  assert.equal((await request("/api/day", { headers: { Cookie: "__session=invalid" } })).status, 401);
  assert.equal((await request("/api/foods/barcode?code=invalid", { headers: { Cookie: alice } })).status, 400);
  // Also verifies the compiled Worker loads the native configuration bindings.
  // Missing native configuration would yield 503 instead of invalid-token 401.
  assert.equal((await request("/api/day", { headers: { Authorization: "Bearer invalid-token", Cookie: alice } })).status, 401);
  const callback = await request("/auth/callback?error=access_denied&error_description=PRIVATE_ERROR");
  assert.equal(callback.status, 307);
  assert.equal(new URL(callback.headers.get("location"), base).href, `${base}/?auth_error=1`);
  assert.ok(!(await callback.text()).includes("PRIVATE_ERROR"));
  assert.equal((await request("/auth/access-token", { headers: { Cookie: alice } })).status, 404);

  const date = new Date().toISOString().slice(0, 10);
  const food = { date, meal: "Breakfast", name: "Smoke oats", source: "custom", quantity: 1, unit: "serving", grams: 50, calories: 190, protein: 7, carbs: 33, fat: 3, userId: "auth0|bob" };
  const added = await request("/api/entries", { method: "POST", headers: { Cookie: alice, "oai-authenticated-user-id": "auth0|bob" }, body: JSON.stringify(food) });
  assert.equal(added.status, 201);
  const { id } = await added.json();
  const readDay = async (session) => (await request(`/api/day?date=${date}`, { headers: { Cookie: session } })).json();
  assert.equal((await readDay(alice)).entries.length, 1);
  assert.equal((await readDay(bob)).entries.length, 0);
  const goals = { calories: 2100, protein: 160, carbs: 200, fat: 70 };
  assert.equal((await request("/api/goals", { method: "PUT", headers: { Cookie: alice }, body: JSON.stringify(goals) })).status, 200);
  assert.deepEqual((await readDay(alice)).goals, goals);
  assert.equal((await readDay(bob)).goals.calories, 2400);
  const trend = await (await request("/api/trends", { headers: { Cookie: alice } })).json();
  assert.equal(trend.days[0].calories, 190);
  assert.equal((await request("/api/entries", { method: "POST", headers: { Cookie: alice, Origin: "https://evil.test" }, body: JSON.stringify(food) })).status, 403);
  await request(`/api/entries?id=${id}`, { method: "DELETE", headers: { Cookie: bob } });
  assert.equal((await readDay(alice)).entries.length, 1);
  await request(`/api/entries?id=${id}`, { method: "DELETE", headers: { Cookie: alice } });
  assert.equal((await readDay(alice)).entries.length, 0);
  const customResponse = await request("/api/foods/custom", { method: "POST", headers: { Cookie: alice }, body: JSON.stringify({
    name: "Smoke custom bowl", servingLabel: "1 bowl", calories: 605, protein: 30, carbs: 65, fat: 25, verified: true, source: "USDA",
  }) });
  assert.equal(customResponse.status, 201);
  const { food: custom } = await customResponse.json();
  assert.equal(custom.verified, false);
  assert.equal(custom.servingGrams, null);
  const customEntry = await request("/api/entries", { method: "POST", headers: { Cookie: bob }, body: JSON.stringify({ date, meal: "Dinner", sourceId: custom.id, quantity: .5, unit: "serving" }) });
  assert.equal(customEntry.status, 201);
  assert.deepEqual(Object.fromEntries(Object.entries(await customEntry.json()).filter(([key]) => ["calories","protein","carbs","fat","grams","verified"].includes(key))), { grams: null, calories: 302.5, protein: 15, carbs: 32.5, fat: 12.5, verified: false });
  const vivaSearch = await request("/api/foods/search?q=Viva%20Chicken", { headers: { Cookie: alice } });
  assert.equal(vivaSearch.status, 200);
  const viva = (await vivaSearch.json()).foods.find(item => item.brand === "Viva Chicken");
  assert.ok(viva, "Imported Viva Chicken menu must be searchable in the compiled Worker");
  assert.equal(viva.verified, true);
  const vivaResponse = await request("/api/entries", { method: "POST", headers: { Cookie: alice }, body: JSON.stringify({ date, meal: "Dinner", sourceId: viva.id, quantity: .5, unit: "serving", calories: 999999, verified: false }) });
  assert.equal(vivaResponse.status, 201);
  const vivaEntry = await vivaResponse.json();
  assert.equal(vivaEntry.calories, viva.calories / 2);
  assert.equal(vivaEntry.verified, true);
  assert.equal((await readDay(alice)).entries.at(-1).verified, true);

  if (process.env.SMOKE_BROWSER === "1") {
    await mkdir("work/food-catalog", { recursive: true });
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "__session", value: alice.slice("__session=".length), url: base }]);
      const page = await context.newPage();
      await page.goto(base);
      await page.getByRole("button", { name: "Add food", exact: true }).click();
      await page.getByRole("button", { name: "Add custom food", exact: true }).click();
      await page.getByRole("textbox", { name: "Food name", exact: true }).fill("Browser custom dinner");
      await page.getByRole("textbox", { name: "Serving description", exact: true }).fill("1 plate");
      for (const [label, value] of [["Calories (kcal)","605"],["Protein (g)","30"],["Carbs (g)","65"],["Fat (g)","25"]]) await page.getByRole("spinbutton", { name: label, exact: true }).fill(value);
      await page.getByRole("button", { name: "Save custom food", exact: true }).click();
      await page.getByRole("heading", { name: "Choose amount" }).waitFor();
      await page.screenshot({ path: "work/food-catalog/web-custom-selected.png", fullPage: true });
      await page.getByRole("button", { name: "Add to Breakfast", exact: true }).click();
      await page.getByText("Browser custom dinner", { exact: true }).waitFor();
      await page.reload();
      await page.getByText("Browser custom dinner", { exact: true }).waitFor();
      await page.screenshot({ path: "work/food-catalog/web-custom-diary.png", fullPage: true });
      await page.getByRole("button", { name: "Add food", exact: true }).click();
      await page.getByRole("textbox", { name: "Search foods", exact: true }).fill("Viva Chicken");
      await page.locator(".result-row").first().waitFor();
      assert.ok(await page.locator(".result-row .verified").count() > 0);
      await page.screenshot({ path: "work/food-catalog/web-viva-search.png", fullPage: true });
    } finally { await browser.close(); }
  }
  console.log("PASS: compiled Worker sign-in page, private API guards, encrypted sessions, callback failures, account isolation, goals, trends, CSRF, deletion ownership, shared custom foods, verified restaurant imports, and server-side portion calculations.");
} catch (error) {
  // Wrangler logs binding names, but redact the fixture key defensively.
  console.error(log.replaceAll(secret, "[redacted]").split("\n").slice(-35).join("\n"));
  throw error;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  await rm(directory, { recursive: true, force: true });
}
