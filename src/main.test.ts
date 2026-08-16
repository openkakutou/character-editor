import { beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./main.ts";
import { MIN_SUPPORTED_WEB_UI_KIT_VERSION } from "./web-ui-kit-version.ts";

describe("renderApp", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("mounts a wuik-app-shell root frame with a toolbar showing the title and version, plus a theme toggle button", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.5.0");

    const shell = root.querySelector("wuik-app-shell");
    expect(shell).not.toBeNull();

    const toolbar = shell?.querySelector('[slot="toolbar"]');
    expect(toolbar?.tagName.toLowerCase()).toBe("wuik-toolbar");
    expect(toolbar?.textContent).toContain("Character Editor — v0.1.0");

    const toggle = toolbar?.querySelector("wuik-button");
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe("Switch to dark mode");
  });

  it("toggles the page theme to dark, then back to light, when the theme button is activated", () => {
    const root = document.createElement("div");
    renderApp(root, "0.1.0", "0.5.0");

    const toggle = root.querySelector<HTMLElement>("wuik-button");
    if (!toggle) throw new Error("theme toggle not found");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(toggle.textContent).toBe("Switch to light mode");

    toggle.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle.textContent).toBe("Switch to dark mode");
  });

  it("replaces previous content instead of appending on repeated renders", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.5.0");
    renderApp(root, "0.2.0", "0.5.0");

    expect(root.querySelectorAll("wuik-app-shell")).toHaveLength(1);
    expect(root.querySelector('[slot="toolbar"]')?.textContent).toContain(
      "Character Editor — v0.2.0",
    );
  });

  it("shows a clear, announced error instead of an unstyled shell when web-ui-kit is too old", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");

    expect(root.querySelector("wuik-app-shell")).toBeNull();
    const alert = root.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("aria-live")).toBe("assertive");
    expect(alert?.textContent).toContain(MIN_SUPPORTED_WEB_UI_KIT_VERSION);
    expect(alert?.textContent).toContain("0.3.0");
  });

  it("replaces a previously rendered error state once a supported version is given", () => {
    const root = document.createElement("div");

    renderApp(root, "0.1.0", "0.3.0");
    renderApp(root, "0.1.0", "0.5.0");

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector("wuik-app-shell")).not.toBeNull();
  });
});
