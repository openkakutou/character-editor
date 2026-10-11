import { describe, expect, it } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { createFilePicker } from "./file-picker.ts";

function make() {
  return createFilePicker({
    accept: ".act",
    inputClassName: "x",
    buttonKey: "palettes.chooseActFile",
    buttonDefault: "Choose a palette file",
    typeKey: "palettes.actType",
    typeDefault: "An .act palette file",
  });
}

function pick(input: HTMLInputElement, name: string | null): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: name === null ? [] : [new File(["a"], name)],
  });
  input.dispatchEvent(new Event("change"));
}

describe("file picker", () => {
  it("hides the native input and shows localized text", () => {
    const picker = make();
    expect(picker.input.hidden).toBe(true);
    expect(picker.input.className).toBe("x");
    expect(picker.element.textContent).toContain("Choose a palette file");
    expect(picker.element.textContent).toContain("No file chosen");
    expect(picker.element.textContent).toContain("An .act palette file");
  });

  it("opens the native input from the button", () => {
    const picker = make();
    let clicked = false;
    picker.input.addEventListener("click", () => {
      clicked = true;
    });
    picker.button.click();
    expect(clicked).toBe(true);
  });

  it("shows the file name once chosen, and resets on refresh", () => {
    const picker = make();
    pick(picker.input, "a.act");
    expect(
      picker.element.querySelector(".file-picker__status")?.textContent,
    ).toBe("a.act");
    pick(picker.input, null);
    expect(
      picker.element.querySelector(".file-picker__status")?.textContent,
    ).toBe("No file chosen");
  });

  it("follows the language", async () => {
    await initAppI18n();
    const picker = make();
    await getI18n()?.changeLanguage("fr");
    expect(
      picker.element.querySelector(".file-picker__status")?.textContent,
    ).toBe("Aucun fichier choisi");
    await getI18n()?.changeLanguage("en");
    picker.destroy();
    window.localStorage.clear();
  });

  it("describes the button by its status and type lines", () => {
    const picker = make();
    const ids = (picker.button.getAttribute("aria-describedby") ?? "").split(
      " ",
    );
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(picker.element.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("focuses the inner button of the kit control", () => {
    const picker = make();
    document.body.appendChild(picker.element);
    const shadow = picker.button.shadowRoot as ShadowRoot;
    const inner = shadow.querySelector("button") as HTMLElement;
    picker.focus();
    expect(shadow.activeElement).toBe(inner);
    picker.element.remove();
  });
});
