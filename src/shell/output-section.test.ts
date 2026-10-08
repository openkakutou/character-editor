import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportController } from "../save/export-controller.ts";
import type { ValidationIssue } from "../validation/character-validation.ts";
import { ValidationStore } from "../validation/validation-store.ts";
import { renderOutputSection } from "./output-section.ts";

function fakeController(files: ExportController["files"]): ExportController {
  const listeners = new Set<() => void>();
  return {
    state: { phase: "idle" },
    files,
    preview: async () => {},
    run: async () => {},
    reset: () => {},
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    download: vi.fn(),
  };
}

const issue: ValidationIssue = {
  id: "commands:empty-input:0",
  section: "commands",
  severity: "error",
  message: "Command 1 has no input sequence.",
  target: { selector: "[data-command-row]", index: 0 },
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderOutputSection", () => {
  it("says there is no problem once a validation ran clean", () => {
    const validation = new ValidationStore();
    validation.setIssues("document", []);
    const root = document.createElement("div");
    renderOutputSection(root, {
      validation,
      controller: fakeController([]),
      onGoToIssue: vi.fn(),
    });
    expect(root.textContent).toContain("No problem found.");
  });

  it("lists each problem with its section, severity and a Show button that reports the issue", () => {
    const validation = new ValidationStore();
    validation.setIssues("document", [issue]);
    const onGoToIssue = vi.fn();
    const root = document.createElement("div");
    renderOutputSection(root, {
      validation,
      controller: fakeController([]),
      onGoToIssue,
    });

    const item = root.querySelector('[data-issue="commands:empty-input:0"]');
    expect(item?.textContent).toContain("Commands — Command 1 has no input");
    expect(item?.querySelector("wuik-badge")?.getAttribute("label")).toBe(
      "Error",
    );
    expect(root.querySelector(".output-section__summary")?.textContent).toBe(
      "1 error, 0 warnings",
    );
    root.querySelector<HTMLElement>('[data-action="go-to-issue"]')?.click();
    expect(onGoToIssue).toHaveBeenCalledWith(issue);
  });

  it("re-renders when the validation store changes", () => {
    const validation = new ValidationStore();
    const root = document.createElement("div");
    renderOutputSection(root, {
      validation,
      controller: fakeController([]),
      onGoToIssue: vi.fn(),
    });
    expect(root.querySelectorAll("[data-issue]")).toHaveLength(0);
    validation.setIssues("document", [issue]);
    expect(root.querySelectorAll("[data-issue]")).toHaveLength(1);
  });

  it("offers a download per file and flags unchanged ones", () => {
    const controller = fakeController([
      {
        kind: "def",
        fileName: "a.def",
        bytes: new Uint8Array(),
        unchanged: true,
      },
      {
        kind: "air",
        fileName: "a.air",
        bytes: new Uint8Array(),
        unchanged: false,
      },
    ]);
    const root = document.createElement("div");
    renderOutputSection(root, {
      validation: new ValidationStore(),
      controller,
      onGoToIssue: vi.fn(),
    });
    const items = root.querySelectorAll(".output-section__file");
    expect(items[0].textContent).toContain("a.def (unchanged)");
    expect(items[1].textContent).toContain("a.air (modified)");
    items[1].querySelector<HTMLElement>("wuik-button")?.click();
    expect(controller.download).toHaveBeenCalledOnce();
  });

  it("explains that files cannot be prepared when the export is blocked", () => {
    const root = document.createElement("div");
    renderOutputSection(root, {
      validation: new ValidationStore(),
      controller: fakeController(null),
      onGoToIssue: vi.fn(),
    });
    expect(root.querySelector(".output-section__note")?.textContent).toContain(
      "cannot be prepared",
    );
    expect(root.querySelectorAll(".output-section__file")).toHaveLength(0);
  });

  it("stops updating once the returned stop function is called", () => {
    const validation = new ValidationStore();
    const root = document.createElement("div");
    const stop = renderOutputSection(root, {
      validation,
      controller: fakeController([]),
      onGoToIssue: vi.fn(),
    });
    stop();
    validation.setIssues("document", [issue]);
    expect(root.querySelectorAll("[data-issue]")).toHaveLength(0);
  });
});
