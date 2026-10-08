import { describe, expect, it, vi } from "vitest";
import type { ValidationIssue } from "./character-validation.ts";
import { ValidationStore } from "./validation-store.ts";

function issue(
  id: string,
  section: ValidationIssue["section"],
  severity: ValidationIssue["severity"],
): ValidationIssue {
  return { id, section, severity, message: id };
}

describe("ValidationStore", () => {
  it("has not run before the first report, and reports no counts", () => {
    const store = new ValidationStore();
    expect(store.hasRun).toBe(false);
    expect(store.countsFor("commands")).toEqual({ errors: 0, warnings: 0 });
  });

  it("counts errors and warnings per section across sources", () => {
    const store = new ValidationStore();
    store.setIssues("document", [
      issue("a", "commands", "error"),
      issue("b", "commands", "warning"),
      issue("c", "states", "error"),
    ]);
    store.setIssues("export", [issue("d", "commands", "error")]);
    expect(store.hasRun).toBe(true);
    expect(store.countsFor("commands")).toEqual({ errors: 2, warnings: 1 });
    expect(store.countsFor("states")).toEqual({ errors: 1, warnings: 0 });
    expect(store.totals()).toEqual({ errors: 3, warnings: 1 });
  });

  it("replaces only the reporting source's issues, and clears it with an empty list", () => {
    const store = new ValidationStore();
    store.setIssues("document", [issue("a", "commands", "error")]);
    store.setIssues("export", [issue("b", "output", "error")]);
    store.setIssues("document", []);
    expect(store.issues.map((i) => i.id)).toEqual(["b"]);
    expect(store.hasRun).toBe(true);
  });

  it("notifies subscribers on each change until they unsubscribe", () => {
    const store = new ValidationStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setIssues("document", []);
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.setIssues("document", []);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns to never-validated after reset", () => {
    const store = new ValidationStore();
    store.setIssues("document", [issue("a", "commands", "error")]);
    store.reset();
    expect(store.hasRun).toBe(false);
    expect(store.issues).toEqual([]);
  });
});
