import { describe, expect, it, vi } from "vitest";
import { createListRow, focusKitControl } from "./list-row.ts";

describe("createListRow", () => {
  it("builds a kit list row with its class and text", () => {
    const row = createListRow({ className: "x", text: "Group 1 (2)" });
    expect(row.localName).toBe("wuik-list-row");
    expect(row.className).toBe("x");
    expect(row.textContent).toBe("Group 1 (2)");
    expect(row.hasAttribute("expandable")).toBe(false);
  });

  it("marks a disclosure row expandable and expanded", () => {
    const row = createListRow({ text: "A", expandable: true, expanded: true });
    expect(row.hasAttribute("expandable")).toBe(true);
    expect(row.hasAttribute("expanded")).toBe(true);
  });

  it("marks a selected row and an unavailable row that stays focusable", () => {
    const row = createListRow({ text: "A", selected: true, unavailable: true });
    expect(row.hasAttribute("selected")).toBe(true);
    expect(row.hasAttribute("disabled")).toBe(false);
    expect(row.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("focusKitControl", () => {
  it("focuses the native control inside the shadow root when there is one", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);
    const spy = vi.spyOn(inner, "focus");
    focusKitControl(host);
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to focusing the element itself", () => {
    const el = document.createElement("button");
    const spy = vi.spyOn(el, "focus");
    focusKitControl(el);
    expect(spy).toHaveBeenCalled();
  });
});
