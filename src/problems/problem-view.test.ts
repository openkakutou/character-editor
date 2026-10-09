import { afterEach, describe, expect, it, vi } from "vitest";
import { createProblemView } from "./problem-view.ts";

const problem = {
  code: "load.failed" as const,
  params: { cause: "This folder is empty." },
  detail: "ENOENT: no such file",
};

function click(host: Element, action: string): void {
  (host.querySelector(`[data-action="${action}"]`) as HTMLElement).click();
}

describe("createProblemView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the Error label, title, cause and next step in plain text", () => {
    const view = createProblemView(problem);
    expect(view.element.textContent).toContain("Error");
    expect(view.element.querySelector(".problem__title")?.textContent).toBe(
      "Couldn't open this folder",
    );
    expect(view.element.querySelector(".problem__cause")?.textContent).toBe(
      "This folder is empty.",
    );
    expect(view.element.querySelector(".problem__action")?.textContent).toBe(
      "Choose another folder.",
    );
  });

  it("carries no live attribute: announcing is the caller's job", () => {
    const view = createProblemView(problem);
    expect(view.element.querySelector("[aria-live], [role=alert]")).toBeNull();
  });

  it("keeps the raw text out of the message and behind a disclosure", () => {
    const view = createProblemView(problem);
    const detail = view.element.querySelector<HTMLElement>(".problem__detail");
    expect(
      view.element.textContent?.replace(detail?.textContent ?? "", ""),
    ).not.toContain("ENOENT");
    expect(detail?.hidden).toBe(true);
    click(view.element, "toggle-details");
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toBe("ENOENT: no such file");
    expect(
      view.element
        .querySelector('[data-action="toggle-details"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    click(view.element, "toggle-details");
    expect(detail?.hidden).toBe(true);
  });

  it("has no details tools when the problem has no raw detail", () => {
    const view = createProblemView({ code: "unknown", params: {} });
    expect(
      view.element.querySelector<HTMLElement>(".problem__tools")?.hidden,
    ).toBe(true);
  });

  it("copies the details and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const view = createProblemView(problem);
    click(view.element, "copy-details");
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("ENOENT: no such file");
    expect(
      view.element.querySelector('[data-action="copy-details"]')?.textContent,
    ).toBe("Copied");
  });

  it("reveals the details instead when the clipboard is refused", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const view = createProblemView(problem);
    click(view.element, "copy-details");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      view.element.querySelector<HTMLElement>(".problem__detail")?.hidden,
    ).toBe(false);
  });

  it("keeps the disclosure open when another problem is set", () => {
    const view = createProblemView(problem);
    click(view.element, "toggle-details");
    view.setProblem({ ...problem, detail: "EACCES" });
    expect(view.element.querySelector(".problem__detail")?.textContent).toBe(
      "EACCES",
    );
    expect(
      view.element.querySelector<HTMLElement>(".problem__detail")?.hidden,
    ).toBe(false);
  });
});
