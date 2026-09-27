import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const mobileRoot = fileURLToPath(new URL("./mobile", import.meta.url));
const mobileReactAliases = ["react", "react-dom"].map(name => ({
  find: new RegExp(`^${name}(?=/|$)`),
  replacement: dirname(require.resolve(`${name}/package.json`, { paths: [mobileRoot] })),
}));

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    projects: [
      { test: { name: "web", include: ["tests/**/*.test.ts"] } },
      {
        // Match Metro: shared hooks must use the mobile renderer's React,
        // including jsx-runtime imports from files outside the mobile directory.
        resolve: { alias: mobileReactAliases },
        test: { name: "mobile", include: ["mobile/tests/**/*.test.ts"] },
      },
    ],
  },
});
