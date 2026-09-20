import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appVersion } from "./version.ts";

describe("appVersion", () => {
  it("is a non-empty semantic version string", () => {
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches package.json's version field, so it can never drift out of sync with a release", () => {
    const packageJsonPath = path.resolve(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      version: string;
    };

    expect(appVersion).toBe(packageJson.version);
  });
});
