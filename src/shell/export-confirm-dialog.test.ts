import { afterEach, describe, expect, it } from "vitest";
import { createExportConfirmDialog } from "./export-confirm-dialog.ts";

function setup() {
  const dialog = createExportConfirmDialog();
  // Unregistered in jsdom: the kit's methods are stubbed like the leave dialog's tests do.
  const element = dialog.element as HTMLElement & {
    showModal: () => void;
    close: () => void;
  };
  element.showModal = () => element.toggleAttribute("open", true);
  element.close = () => element.toggleAttribute("open", false);
  document.body.appendChild(element);
  return { dialog, element };
}

function press(element: HTMLElement, action: string): void {
  (element.querySelector(`[data-action="${action}"]`) as HTMLElement).click();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("export confirm dialog", () => {
  it("names the files that will be left out, in the plural", async () => {
    const { dialog, element } = setup();
    void dialog.confirm(["kfm.sff", "kfm.snd"]);
    expect(element.textContent).toContain(
      "These files could not be read and will be left out: kfm.sff, kfm.snd.",
    );
    expect(element.hasAttribute("open")).toBe(true);
  });

  it("uses the singular for one file", () => {
    const { dialog, element } = setup();
    void dialog.confirm(["kfm.sff"]);
    expect(element.textContent).toContain(
      "This file could not be read and will be left out: kfm.sff.",
    );
  });

  it("resolves true on Export anyway and false on Cancel, closing each time", async () => {
    const { dialog, element } = setup();
    const proceed = dialog.confirm(["kfm.sff"]);
    press(element, "export-confirm-proceed");
    expect(await proceed).toBe(true);
    expect(element.hasAttribute("open")).toBe(false);

    const cancel = dialog.confirm(["kfm.sff"]);
    press(element, "export-confirm-cancel");
    expect(await cancel).toBe(false);
  });

  it("resolves false when closed with Escape", async () => {
    const { dialog, element } = setup();
    const choice = dialog.confirm(["kfm.sff"]);
    element.dispatchEvent(new Event("wuik-close"));
    expect(await choice).toBe(false);
  });

  it("puts Cancel before Export anyway in the tab order", () => {
    const { element } = setup();
    const actions = [...element.querySelectorAll("[data-action]")].map(
      (el) => (el as HTMLElement).dataset.action,
    );
    expect(actions).toEqual([
      "export-confirm-cancel",
      "export-confirm-proceed",
    ]);
  });
});
