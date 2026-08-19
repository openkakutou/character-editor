import { describe, expect, it, vi } from "vitest";
import type { SpritePixelResult } from "../wasm/bridge.ts";
import type { Animation, CharacterData } from "../wasm/types.ts";
import type { DecodedImage, ImageDecodeResult } from "./image-decode.ts";
import { renderSpriteBrowser } from "./sprite-browser.ts";
import type { SpriteEdit } from "./sprite-edits.ts";

function characterWithSprites(animations: Animation[] = []): CharacterData {
  return {
    name: "Test",
    author: "",
    spriteFile: "",
    animationFile: "",
    soundFile: "",
    commandFile: "",
    constantsFile: "",
    stateFiles: [],
    palettes: [],
    animations,
    sprites: [
      {
        index: 0,
        sprites: [
          {
            group: 0,
            image: 0,
            width: 10,
            height: 20,
            axisX: 5,
            axisY: 19,
            palette: 0,
          },
          {
            group: 0,
            image: 1,
            width: 8,
            height: 8,
            axisX: 4,
            axisY: 7,
            palette: 0,
          },
        ],
      },
    ],
    stateDefs: [],
  };
}

const sffBytes = new Uint8Array([1, 2, 3]);

function expandFirstGroup(root: HTMLElement): void {
  root
    .querySelector<HTMLButtonElement>(".sprite-browser__group-toggle")
    ?.click();
}

function selectSprite(root: HTMLElement, index = 0): void {
  root
    .querySelectorAll<HTMLButtonElement>(".sprite-browser__sprite")
    [index]?.click();
}

function okPixelResult(width: number, height: number): SpritePixelResult {
  return {
    ok: true,
    pixels: new Uint8Array(width * height * 4),
    width,
    height,
  };
}

function fakeFile(name = "sprite.png"): File {
  return new File([new Uint8Array([1])], name, { type: "image/png" });
}

describe("renderSpriteBrowser", () => {
  it("renders nothing when no character is loaded", () => {
    const root = document.createElement("div");
    renderSpriteBrowser(root, null, null, []);
    expect(root.children).toHaveLength(0);
  });

  it("shows an explicit empty state for a character with no sprites and no pending imports", () => {
    const root = document.createElement("div");
    const character: CharacterData = { ...characterWithSprites(), sprites: [] };
    renderSpriteBrowser(root, character, sffBytes, []);
    expect(root.textContent).toContain("No sprites");
  });

  it("shows the total sprite count in the heading", () => {
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, []);
    expect(root.querySelector("h3")?.textContent).toContain("2");
  });

  it("lazily mounts a group's sprite rows only once expanded", () => {
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, []);

    expect(root.querySelectorAll(".sprite-browser__sprite")).toHaveLength(0);
    expandFirstGroup(root);
    expect(root.querySelectorAll(".sprite-browser__sprite")).toHaveLength(2);
  });

  it("resolves and draws a selected sprite's pixels via the WASM bridge", async () => {
    const resolveSpritePixels = vi
      .fn()
      .mockResolvedValue([okPixelResult(10, 20)]);
    const drawPixels = vi.fn();
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      resolveSpritePixels,
      drawPixels,
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    await vi.waitFor(() => expect(drawPixels).toHaveBeenCalled());

    expect(resolveSpritePixels).toHaveBeenCalledWith(
      sffBytes,
      [[0, 0]],
      null,
      undefined,
    );
    expect(drawPixels.mock.calls[0][2]).toBe(10);
    expect(drawPixels.mock.calls[0][3]).toBe(20);
  });

  it("shows an error status instead of a crash when pixel resolution fails", async () => {
    const resolveSpritePixels = vi
      .fn()
      .mockResolvedValue([{ ok: false, error: "sprite not found" }]);
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      resolveSpritePixels,
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    await vi.waitFor(() =>
      expect(root.textContent).toContain("sprite not found"),
    );
  });

  it("draws a sprite with a pending add/replace edit from the edit itself, without calling the WASM bridge", async () => {
    const resolveSpritePixels = vi.fn();
    const drawPixels = vi.fn();
    const pendingPixels = new Uint8Array(4 * 4 * 4);
    const edit: SpriteEdit = {
      kind: "replace",
      group: 0,
      image: 0,
      pixels: pendingPixels,
      width: 4,
      height: 4,
    };
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [edit], {
      resolveSpritePixels,
      drawPixels,
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    await vi.waitFor(() => expect(drawPixels).toHaveBeenCalled());

    expect(resolveSpritePixels).not.toHaveBeenCalled();
    expect(drawPixels).toHaveBeenCalledWith(
      expect.anything(),
      pendingPixels,
      4,
      4,
    );
  });

  it("imports a new sprite into a chosen group number after a successful decode", async () => {
    const onSpriteEdit = vi.fn();
    const decodedImage: DecodedImage = {
      width: 6,
      height: 6,
      pixels: new Uint8Array(6 * 6 * 4),
    };
    const decodeImageFile = vi.fn().mockResolvedValue({
      ok: true,
      image: decodedImage,
    } satisfies ImageDecodeResult);
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      onSpriteEdit,
      decodeImageFile,
    });

    const groupInput = root.querySelector<HTMLInputElement>(
      ".sprite-browser__import-group",
    );
    const fileInput = root.querySelector<HTMLInputElement>(
      ".sprite-browser__import-file",
    );
    expect(groupInput?.value).toBe("1"); // next available group index
    Object.defineProperty(fileInput, "files", { value: [fakeFile()] });
    fileInput?.dispatchEvent(new Event("change"));

    root
      .querySelector<HTMLButtonElement>(".sprite-browser__import-submit")
      ?.click();

    await vi.waitFor(() => expect(onSpriteEdit).toHaveBeenCalled());
    expect(onSpriteEdit).toHaveBeenCalledWith({
      kind: "add",
      group: 1,
      image: 0,
      pixels: decodedImage.pixels,
      width: 6,
      height: 6,
    });
  });

  it("shows a clear inline error and does not call onSpriteEdit when an imported file fails to decode", async () => {
    const onSpriteEdit = vi.fn();
    const decodeImageFile = vi.fn().mockResolvedValue({
      ok: false,
      error: "This image could not be decoded.",
    });
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      onSpriteEdit,
      decodeImageFile,
    });

    const fileInput = root.querySelector<HTMLInputElement>(
      ".sprite-browser__import-file",
    );
    Object.defineProperty(fileInput, "files", { value: [fakeFile()] });
    fileInput?.dispatchEvent(new Event("change"));
    root
      .querySelector<HTMLButtonElement>(".sprite-browser__import-submit")
      ?.click();

    await vi.waitFor(() =>
      expect(root.textContent).toContain("could not be decoded"),
    );
    expect(onSpriteEdit).not.toHaveBeenCalled();
  });

  it("replaces a selected sprite's pixels after a successful decode", async () => {
    const onSpriteEdit = vi.fn();
    const decodedImage: DecodedImage = {
      width: 3,
      height: 3,
      pixels: new Uint8Array(3 * 3 * 4),
    };
    const decodeImageFile = vi.fn().mockResolvedValue({
      ok: true,
      image: decodedImage,
    } satisfies ImageDecodeResult);
    const resolveSpritePixels = vi
      .fn()
      .mockResolvedValue([okPixelResult(10, 20)]);
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      onSpriteEdit,
      decodeImageFile,
      resolveSpritePixels,
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    await vi.waitFor(() => expect(resolveSpritePixels).toHaveBeenCalled());

    const replaceFileInput = root.querySelector<HTMLInputElement>(
      ".sprite-browser__replace-file",
    );
    Object.defineProperty(replaceFileInput, "files", { value: [fakeFile()] });
    replaceFileInput?.dispatchEvent(new Event("change"));

    await vi.waitFor(() => expect(onSpriteEdit).toHaveBeenCalled());
    expect(onSpriteEdit).toHaveBeenCalledWith({
      kind: "replace",
      group: 0,
      image: 0,
      pixels: decodedImage.pixels,
      width: 3,
      height: 3,
    });
  });

  it("requires a confirm step before deleting a sprite referenced by animation frames", async () => {
    const onSpriteEdit = vi.fn();
    const animations: Animation[] = [
      {
        number: 0,
        loopStart: 0,
        frames: [
          {
            group: 0,
            image: 0,
            x: 0,
            y: 0,
            time: 1,
            flip: "",
            blend: "",
            clsn1: [],
            clsn2: [],
          },
        ],
      },
    ];
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(animations), sffBytes, [], {
      onSpriteEdit,
      resolveSpritePixels: vi.fn().mockResolvedValue([okPixelResult(10, 20)]),
      drawPixels: vi.fn(),
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    root.querySelector<HTMLButtonElement>(".sprite-browser__delete")?.click();

    expect(root.textContent).toContain("1");
    expect(onSpriteEdit).not.toHaveBeenCalled();

    root
      .querySelector<HTMLButtonElement>(".sprite-browser__delete-confirm")
      ?.click();

    expect(onSpriteEdit).toHaveBeenCalledWith({
      kind: "delete",
      group: 0,
      image: 0,
    });
    expect(
      root.querySelector(".sprite-browser__deleted")?.textContent,
    ).toContain("referenced by 1 frame");
  });

  it("cancelling a pending delete leaves the sprite untouched", async () => {
    const onSpriteEdit = vi.fn();
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      onSpriteEdit,
      resolveSpritePixels: vi.fn().mockResolvedValue([okPixelResult(10, 20)]),
      drawPixels: vi.fn(),
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    root.querySelector<HTMLButtonElement>(".sprite-browser__delete")?.click();
    root
      .querySelector<HTMLButtonElement>(".sprite-browser__delete-cancel")
      ?.click();

    expect(onSpriteEdit).not.toHaveBeenCalled();
    expect(root.querySelector(".sprite-browser__delete")).not.toBeNull();
  });

  it("still requires a confirm step even for a sprite referenced by no animation frame", () => {
    const onSpriteEdit = vi.fn();
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
      onSpriteEdit,
      resolveSpritePixels: vi.fn().mockResolvedValue([okPixelResult(10, 20)]),
      drawPixels: vi.fn(),
    });

    expandFirstGroup(root);
    selectSprite(root, 0);
    root.querySelector<HTMLButtonElement>(".sprite-browser__delete")?.click();

    expect(onSpriteEdit).not.toHaveBeenCalled();
    expect(
      root.querySelector(".sprite-browser__delete-confirm"),
    ).not.toBeNull();
  });

  it("shows a pending-changes indicator once there is at least one edit", () => {
    const edit: SpriteEdit = { kind: "delete", group: 0, image: 1 };
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, [edit]);

    expect(root.querySelector(".sprite-browser__unsaved")).not.toBeNull();
  });

  it("shows no pending-changes indicator when there are no edits", () => {
    const root = document.createElement("div");
    renderSpriteBrowser(root, characterWithSprites(), sffBytes, []);

    expect(root.querySelector(".sprite-browser__unsaved")).toBeNull();
  });
});
