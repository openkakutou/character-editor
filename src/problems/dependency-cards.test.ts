import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECTION_IDS, type SectionId } from "../shell/sections.ts";
import {
  type DependencyCards,
  createDependencyCards,
} from "./dependency-cards.ts";

const sff = { kind: "sff" as const, fileName: "kfm.sff", detail: "denied" };
const snd = { kind: "snd" as const, fileName: "kfm.snd", detail: "denied" };
const zss = { kind: "zss" as const, fileName: "kfm.zss", detail: "denied" };

let containers: Record<SectionId, HTMLElement>;
let cards: DependencyCards;
const onReplace = vi.fn();
const onRetryEngine = vi.fn();

beforeEach(() => {
  containers = Object.fromEntries(
    SECTION_IDS.map((id) => {
      const el = document.createElement("div");
      el.innerHTML = '<div class="editor">editor</div>';
      document.body.appendChild(el);
      return [id, el];
    }),
  ) as unknown as Record<SectionId, HTMLElement>;
  cards = createDependencyCards(containers, { onReplace, onRetryEngine });
});

afterEach(() => {
  cards.destroy();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function card(section: SectionId): HTMLElement | null {
  return containers[section].querySelector(".dependency-card");
}

describe("dependency cards", () => {
  it("replaces the editor with a card in the section that needs the unreadable file", () => {
    cards.update({ files: [{ file: sff, busy: false }] });
    expect(card("sprites")?.querySelector("h3")?.textContent).toBe(
      "Sprites can't be shown",
    );
    expect(card("sprites")?.textContent).toContain("Couldn't read kfm.sff");
    expect(containers.sprites.getAttribute("data-blocked")).toBe("true");
    expect(card("sounds")).toBeNull();
    expect(containers.sounds.hasAttribute("data-blocked")).toBe(false);
  });

  it("is a labelled region with the same Replace action as the banner", () => {
    cards.update({ files: [{ file: snd, busy: false }] });
    const element = card("sounds") as HTMLElement;
    expect(element.getAttribute("aria-labelledby")).toBe(
      element.querySelector("h3")?.id,
    );
    element.querySelector<HTMLElement>('[data-action="replace-file"]')?.click();
    expect(onReplace).toHaveBeenCalledWith(snd);
  });

  it("shows a busy Replace as Replacing…, focusable and ignoring clicks", () => {
    cards.update({ files: [{ file: sff, busy: true }] });
    const button = card("sprites")?.querySelector<HTMLElement>(
      '[data-action="replace-file"]',
    ) as HTMLElement;
    expect(button.textContent).toBe("Replacing…");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    button.click();
    expect(onReplace).not.toHaveBeenCalled();
  });

  it("puts a card on States for an unreadable script file, and only there", () => {
    cards.update({ files: [{ file: zss, busy: false }] });
    expect(card("states")).not.toBeNull();
    for (const id of SECTION_IDS.filter((section) => section !== "states")) {
      expect(card(id)).toBeNull();
    }
  });

  it("also blocks palettes and animations while the sprite sheet is unreadable, since they would read its blank stand-in", () => {
    cards.update({ files: [{ file: sff, busy: false }] });
    for (const id of ["sprites", "palettes", "animations"] as const) {
      expect(card(id)?.textContent).toContain("Couldn't read kfm.sff");
    }
    expect(card("sounds")).toBeNull();
  });

  it("removes the card and unblocks the section once the file is replaced", () => {
    cards.update({ files: [{ file: sff, busy: false }] });
    cards.update({ files: [] });
    expect(card("sprites")).toBeNull();
    expect(containers.sprites.hasAttribute("data-blocked")).toBe(false);
    expect(containers.sprites.querySelector(".editor")).not.toBeNull();
  });

  it("shows an engine card with Retry in every section that needs the engine, and none elsewhere", () => {
    cards.update({
      files: [],
      engine: {
        problem: { code: "engine.loadFailed", params: {}, detail: "x" },
        busy: false,
      },
    });
    for (const id of ["sprites", "palettes", "animations"] as const) {
      expect(card(id)?.textContent).toContain("The editor engine didn't load");
      card(id)
        ?.querySelector<HTMLElement>('[data-action="retry-engine"]')
        ?.click();
    }
    expect(onRetryEngine).toHaveBeenCalledTimes(3);
    expect(card("identity")).toBeNull();
    expect(card("states")).toBeNull();
  });

  it("makes Retry idempotent while busy and labels it Retrying…", () => {
    cards.update({
      files: [],
      engine: {
        problem: { code: "engine.loadFailed", params: {} },
        busy: true,
      },
    });
    const retry = card("palettes")?.querySelector<HTMLElement>(
      '[data-action="retry-engine"]',
    ) as HTMLElement;
    expect(retry.textContent).toBe("Retrying…");
    retry.click();
    expect(onRetryEngine).not.toHaveBeenCalled();
  });

  it("stacks a file problem and the engine problem in the same section", () => {
    cards.update({
      files: [{ file: sff, busy: false }],
      engine: {
        problem: { code: "engine.loadFailed", params: {} },
        busy: false,
      },
    });
    const element = card("sprites") as HTMLElement;
    expect(
      element.querySelector('[data-action="replace-file"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-action="retry-engine"]'),
    ).not.toBeNull();
  });

  it("carries no live attribute", () => {
    cards.update({ files: [{ file: sff, busy: false }] });
    expect(
      card("sprites")?.querySelector(
        "[aria-live], [role=alert], [role=status]",
      ),
    ).toBeNull();
  });
});
