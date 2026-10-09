import { describe, expect, it, vi } from "vitest";
import { createPreviewFailure } from "./preview-failure.ts";

describe("createPreviewFailure", () => {
  it("is hidden until a failure is shown", () => {
    const failure = createPreviewFailure(vi.fn());
    expect(failure.element.hidden).toBe(true);
    expect(failure.shown).toBe(false);
  });

  it("names what failed and the next step, with a real Retry button", () => {
    const onRetry = vi.fn();
    const failure = createPreviewFailure(onRetry);
    failure.show("bad index", false);
    expect(failure.element.textContent).toContain(
      "Preview unavailable for this sprite",
    );
    expect(failure.element.textContent).toContain(
      "Replace the image or delete the sprite.",
    );
    const retry = failure.element.querySelector<HTMLElement>(
      '[data-action="retry-preview"]',
    );
    expect(retry?.textContent).toBe("Retry");
    retry?.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("marks the preview outdated only when an earlier frame is still shown", () => {
    const failure = createPreviewFailure(vi.fn());
    failure.show("x", true);
    const note = failure.element.querySelector<HTMLElement>(
      ".preview-failure__outdated",
    );
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe("Outdated preview");
    failure.show("x", false);
    expect(note?.hidden).toBe(true);
  });

  it("keeps the raw text behind the details and carries no live attribute", () => {
    const failure = createPreviewFailure(vi.fn());
    failure.show("bad index", false);
    expect(failure.element.querySelector(".problem__detail")?.textContent).toBe(
      "bad index",
    );
    expect(
      failure.element.querySelector("[aria-live], [role=alert], [role=status]"),
    ).toBeNull();
  });

  it("hides again once the preview works", () => {
    const failure = createPreviewFailure(vi.fn());
    failure.show("x", false);
    failure.hide();
    expect(failure.shown).toBe(false);
  });
});
