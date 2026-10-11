import { describe, expect, it } from "vitest";
import { createHelpHint } from "./help-hint.ts";

describe("createHelpHint", () => {
  it("builds a kit help hint with its label and text", () => {
    const hint = createHelpHint("Help: Duration", "1 tick = 1/60 s");
    expect(hint.localName).toBe("wuik-help-hint");
    expect(hint.getAttribute("label")).toBe("Help: Duration");
    expect(hint.textContent).toBe("1 tick = 1/60 s");
  });
});
