import { ShortcutManager } from "@openkakutou/web-ui-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installGlobalShortcutListener,
  normalizeShortcutEvent,
  shouldIgnoreGlobalShortcut,
} from "./global-shortcut-listener.ts";

describe("normalizeShortcutEvent", () => {
  it("builds a combo string in Ctrl, Meta, Alt, Shift order", () => {
    expect(
      normalizeShortcutEvent({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe("Ctrl+S");

    expect(
      normalizeShortcutEvent({
        key: "a",
        ctrlKey: true,
        metaKey: true,
        altKey: true,
        shiftKey: true,
      }),
    ).toBe("Ctrl+Meta+Alt+Shift+A");
  });

  it("returns undefined for a modifier key pressed on its own (edge case: no usable shortcut yet)", () => {
    expect(
      normalizeShortcutEvent({
        key: "Control",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBeUndefined();
  });

  it("keeps a non-single-character key name as-is (edge case: function/arrow keys)", () => {
    expect(
      normalizeShortcutEvent({
        key: "F5",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe("F5");
  });
});

describe("shouldIgnoreGlobalShortcut", () => {
  it("is false for a plain element", () => {
    expect(shouldIgnoreGlobalShortcut(document.createElement("div"))).toBe(
      false,
    );
  });

  it("is true for a text-editable control (edge case: don't hijack typing)", () => {
    expect(shouldIgnoreGlobalShortcut(document.createElement("input"))).toBe(
      true,
    );
    expect(shouldIgnoreGlobalShortcut(document.createElement("textarea"))).toBe(
      true,
    );
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(shouldIgnoreGlobalShortcut(editable)).toBe(true);
  });

  it("is true for the shared shortcuts panel itself (edge case: don't fight its own rebind capture)", () => {
    const panel = document.createElement("div");
    Object.defineProperty(panel, "tagName", { value: "WUIK-SHORTCUTS-PANEL" });
    expect(shouldIgnoreGlobalShortcut(panel)).toBe(true);
  });

  it("is false for null (error path: no target on the event)", () => {
    expect(shouldIgnoreGlobalShortcut(null)).toBe(false);
  });
});

describe("installGlobalShortcutListener", () => {
  let manager: ShortcutManager;
  let button: HTMLButtonElement;
  let uninstall: () => void;

  beforeEach(() => {
    manager = new ShortcutManager({
      storageKey: "test-global-shortcut-listener",
    });
    manager.register({ id: "undo", label: "Undo", defaultKey: "Ctrl+Z" });
    button = document.createElement("button");
    button.dataset.action = "undo";
    document.body.appendChild(button);
  });

  afterEach(() => {
    uninstall?.();
    button.remove();
  });

  function dispatch(init: KeyboardEventInit, target: EventTarget = window) {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  it("clicks the matching data-action button and prevents the default action", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    uninstall = installGlobalShortcutListener({ manager });

    const event = dispatch({ key: "z", ctrlKey: true });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing when the combo isn't registered (edge case)", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    uninstall = installGlobalShortcutListener({ manager });

    const event = dispatch({ key: "x", ctrlKey: true });

    expect(onClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while the event target is a text-editable control (edge case)", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    uninstall = installGlobalShortcutListener({ manager });

    const input = document.createElement("input");
    document.body.appendChild(input);
    dispatch({ key: "z", ctrlKey: true }, input);

    expect(onClick).not.toHaveBeenCalled();
    input.remove();
  });

  it("does nothing when no element carries the matching data-action (error path: stale/missing button)", () => {
    button.remove();
    uninstall = installGlobalShortcutListener({ manager });

    expect(() => dispatch({ key: "z", ctrlKey: true })).not.toThrow();
  });

  it("stops reacting once uninstalled", () => {
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    uninstall = installGlobalShortcutListener({ manager });
    uninstall();

    dispatch({ key: "z", ctrlKey: true });

    expect(onClick).not.toHaveBeenCalled();
  });
});
