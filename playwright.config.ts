import { createVisualProjectConfig } from "@openkakutou/web-ui-kit/testing/visual-preset";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

// Served via the plain Vite dev server (`npm run dev`), not a build +
// `vite preview` -- `public/wasm/` (the downloaded character WASM build the
// sprite browser, palette editor, and animation editor all decode sprites
// through) is served identically either way, and skipping the build removes
// an ordering hazard for no loss of fidelity. Same reasoning and port-choice
// shape as `lifebar-editor`'s own identical config; see
// .vibe/decisions/017-visual-regression-fixture-via-wizard-not-folder-upload.md
// for why these tests don't need a folder-based fixture upload at all.
const DEV_SERVER_PORT = 5199;

export default defineConfig({
  ...createVisualProjectConfig({
    testDir: "./tests/visual",
    outputDir: "./test-results",
    use: { baseURL: `http://localhost:${DEV_SERVER_PORT}` },
  }),
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${DEV_SERVER_PORT} --strictPort`,
    url: `http://localhost:${DEV_SERVER_PORT}`,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
