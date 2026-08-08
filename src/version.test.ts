import { describe, expect, it } from "vitest";
import { appVersion } from "./version.ts";

describe("appVersion", () => {
  it("is a non-empty semantic version string", () => {
    expect(appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
