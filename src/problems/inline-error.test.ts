import { describe, expect, it, vi } from "vitest";
import { type ProblemSink, createInlineError } from "./inline-error.ts";

const problem = {
  code: "import.image" as const,
  params: {},
  detail: "InvalidStateError",
};

function sink(): ProblemSink {
  return { report: vi.fn(), clear: vi.fn() };
}

describe("createInlineError", () => {
  it("is hidden until shown, and has a stable id for aria-describedby", () => {
    const error = createInlineError({ section: "sprites", key: "import" });
    expect(error.element.hidden).toBe(true);
    expect(error.element.id).not.toBe("");
  });

  it("shows the localized message with the raw text only behind the details, and tells the registry once", () => {
    const registry = sink();
    const error = createInlineError({
      section: "sprites",
      key: "import",
      sink: registry,
    });
    error.show(problem);

    expect(error.element.hidden).toBe(false);
    expect(error.element.textContent).toContain("Couldn't import this sprite");
    expect(error.element.textContent).toContain("Choose a PNG or PCX file.");
    expect(error.element.querySelector(".problem__detail")?.textContent).toBe(
      "InvalidStateError",
    );
    expect(registry.report).toHaveBeenCalledTimes(1);
    expect(registry.report).toHaveBeenCalledWith("sprites", "import", problem);
    expect(error.element.querySelector("[aria-live], [role=alert]")).toBeNull();
  });

  it("Dismiss hides it, removes it from the registry and hands focus back", () => {
    const registry = sink();
    const onDismiss = vi.fn();
    const error = createInlineError({
      section: "palettes",
      key: "upload",
      sink: registry,
      onDismiss,
    });
    error.show(problem);
    error.element
      .querySelector<HTMLElement>('[data-action="dismiss-error"]')
      ?.click();

    expect(error.element.hidden).toBe(true);
    expect(registry.clear).toHaveBeenCalledWith("palettes", "upload");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clears silently when nothing is shown", () => {
    const registry = sink();
    const error = createInlineError({
      section: "sprites",
      key: "import",
      sink: registry,
    });
    error.clear();
    expect(registry.clear).not.toHaveBeenCalled();
  });

  it("replaces the problem when shown again", () => {
    const error = createInlineError({ section: "sprites", key: "import" });
    error.show(problem);
    error.show({ ...problem, detail: "second" });
    expect(error.element.querySelector(".problem__detail")?.textContent).toBe(
      "second",
    );
  });

  it("removes its registry entry when destroyed", () => {
    const registry = sink();
    const error = createInlineError({
      section: "sprites",
      key: "import",
      sink: registry,
    });
    error.show(problem);
    error.destroy();
    expect(registry.clear).toHaveBeenCalledWith("sprites", "import");
  });
});
