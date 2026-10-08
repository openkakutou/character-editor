import { afterEach, describe, expect, it, vi } from "vitest";
import { installShellShortcuts } from "./shell-shortcuts.ts";

function setup(
  overrides: Partial<Parameters<typeof installShellShortcuts>[0]> = {},
) {
  const goTo = vi.fn();
  const openHelp = vi.fn();
  const remove = installShellShortcuts({
    isShellVisible: () => true,
    isModalOpen: () => false,
    goTo,
    openHelp,
    ...overrides,
  });
  return { goTo, openHelp, remove };
}

function press(
  init: KeyboardEventInit,
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

let remove: (() => void) | undefined;
afterEach(() => {
  remove?.();
  remove = undefined;
  document.body.innerHTML = "";
});

describe("installShellShortcuts", () => {
  it("goes to the section of Alt+digit, read from the key code (AZERTY-safe)", () => {
    const s = setup();
    remove = s.remove;
    press({ altKey: true, code: "Digit5", key: "%" });
    expect(s.goTo).toHaveBeenCalledWith("states");
  });

  it("ignores Alt+digit with another modifier, outside 1-8, or on the home screen", () => {
    const s = setup({ isShellVisible: () => false });
    remove = s.remove;
    press({ altKey: true, code: "Digit2" });
    expect(s.goTo).not.toHaveBeenCalled();
    s.remove();
    const t = setup();
    remove = t.remove;
    press({ altKey: true, ctrlKey: true, code: "Digit2" });
    press({ altKey: true, code: "Digit9" });
    expect(t.goTo).not.toHaveBeenCalled();
  });

  it("does nothing while a modal is open", () => {
    const s = setup({ isModalOpen: () => true });
    remove = s.remove;
    press({ altKey: true, code: "Digit1" });
    press({ key: "?" });
    expect(s.goTo).not.toHaveBeenCalled();
    expect(s.openHelp).not.toHaveBeenCalled();
  });

  it("opens help on ? outside a text field", () => {
    const s = setup();
    remove = s.remove;
    const event = press({ key: "?" });
    expect(s.openHelp).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores ? typed in an input, textarea, select or editable element", () => {
    const s = setup();
    remove = s.remove;
    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      press({ key: "?" }, el);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    press({ key: "?" }, editable);
    expect(s.openHelp).not.toHaveBeenCalled();
  });

  it("ignores ? typed inside a kit text field (event retargeted to its host)", () => {
    const s = setup();
    remove = s.remove;
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.appendChild(input);
    document.body.appendChild(host);
    press({ key: "?" }, input);
    expect(s.openHelp).not.toHaveBeenCalled();
  });

  it("stops listening once removed", () => {
    const s = setup();
    s.remove();
    press({ key: "?" });
    expect(s.openHelp).not.toHaveBeenCalled();
  });
});
