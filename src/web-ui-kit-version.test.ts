import { describe, expect, it } from "vitest";
import {
  MIN_SUPPORTED_WEB_UI_KIT_VERSION,
  isWebUiKitVersionSupported,
} from "./web-ui-kit-version.ts";

describe("isWebUiKitVersionSupported", () => {
  it("accepts a version newer than the minimum", () => {
    expect(isWebUiKitVersionSupported("0.5.0")).toBe(true);
  });

  it("accepts a version exactly equal to the minimum", () => {
    expect(isWebUiKitVersionSupported(MIN_SUPPORTED_WEB_UI_KIT_VERSION)).toBe(
      true,
    );
  });

  it("accepts a future major version", () => {
    expect(isWebUiKitVersionSupported("1.0.0")).toBe(true);
  });

  it("rejects a version older than the minimum", () => {
    expect(isWebUiKitVersionSupported("0.3.0")).toBe(false);
  });

  it("rejects a patch-level version below the minimum", () => {
    // Minimum is 0.4.0 — 0.3.9 is close but still below it.
    expect(isWebUiKitVersionSupported("0.3.9")).toBe(false);
  });

  it("rejects a malformed version string instead of throwing", () => {
    expect(isWebUiKitVersionSupported("not-a-version")).toBe(false);
  });

  it("rejects an empty version string", () => {
    expect(isWebUiKitVersionSupported("")).toBe(false);
  });
});
