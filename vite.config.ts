import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

export default defineConfig({
  base: "./",
  test: {
    environment: "jsdom",
    // tests/visual/**/*.visual.spec.ts are Playwright specs (npm run
    // test:visual), not Vitest ones -- excluded here so `npm test` doesn't
    // try to run them under jsdom, where their `@playwright/test` `page`
    // fixture doesn't exist. Mirrors `web-ui-kit`'s and every sibling app's
    // own identical exclusion.
    exclude: [...configDefaults.exclude, "tests/visual/**"],
  },
});
