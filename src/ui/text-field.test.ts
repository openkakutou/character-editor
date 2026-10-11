import { describe, expect, it, vi } from "vitest";
import { createTextField } from "./text-field.ts";

function type(field: HTMLElement, value: string): void {
  field.dispatchEvent(new CustomEvent("wuik-input", { detail: { value } }));
}

describe("createTextField", () => {
  it("builds a kit text input with its label and value", () => {
    const field = createTextField({
      label: "Type",
      value: "VelSet",
      onCommit: vi.fn(),
    });
    expect(field.localName).toBe("wuik-text-input");
    expect(field.getAttribute("label")).toBe("Type");
    expect(field.getAttribute("value")).toBe("VelSet");
  });

  it("commits the latest typed value when focus leaves", () => {
    const onCommit = vi.fn();
    const field = createTextField({ label: "L", value: "a", onCommit });
    type(field, "ab");
    type(field, "abc");
    expect(onCommit).not.toHaveBeenCalled();
    field.dispatchEvent(new Event("focusout", { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith("abc");
  });

  it("commits the initial value when the field is left untouched", () => {
    const onCommit = vi.fn();
    const field = createTextField({ label: "L", value: "keep", onCommit });
    field.dispatchEvent(new Event("focusout", { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith("keep");
  });
});
