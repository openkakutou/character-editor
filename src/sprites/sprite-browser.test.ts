import { afterEach, describe, expect, it, vi } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
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

  describe("localization (backlog item 012)", () => {
    afterEach(async () => {
      await getI18n()?.changeLanguage("en");
      window.localStorage.clear();
    });

    it("retranslates the heading and group toggle without collapsing an already-expanded group", async () => {
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, []);
      expandFirstGroup(root);

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      expect(root.querySelector("h3")?.textContent).toBe("Sprites (2)");
      expect(
        root
          .querySelector(".sprite-browser__group-toggle")
          ?.getAttribute("aria-expanded"),
      ).toBe("true");
      expect(root.querySelectorAll(".sprite-browser__sprite")).toHaveLength(2);
      expect(
        root.querySelector(".sprite-browser__import-submit")?.textContent,
      ).toBe("Importer un sprite");
    });

    it("re-opens the previously selected preview after a locale change", async () => {
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

      await initAppI18n();
      await getI18n()?.changeLanguage("fr");

      await vi.waitFor(() => {
        expect(
          root
            .querySelectorAll<HTMLButtonElement>(".sprite-browser__sprite")[0]
            ?.getAttribute("aria-current"),
        ).toBe("true");
      });
    });
  });

  describe("robust previews and imports (UX flow 002)", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    function failurePlaceholder(root: HTMLElement): HTMLElement {
      return root.querySelector(".preview-failure") as HTMLElement;
    }

    it("shows a placeholder with its own Retry when the preview cannot be decoded, and recovers on Retry", async () => {
      const resolveSpritePixels = vi
        .fn()
        .mockResolvedValueOnce([{ ok: false, error: "bad palette index" }])
        .mockResolvedValueOnce([okPixelResult(2, 2)]);
      const drawPixels = vi.fn();
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
        resolveSpritePixels,
        drawPixels,
      });
      expandFirstGroup(root);
      selectSprite(root, 0);

      await vi.waitFor(() =>
        expect(failurePlaceholder(root).hidden).toBe(false),
      );
      expect(failurePlaceholder(root).textContent).toContain(
        "Preview unavailable for this sprite",
      );
      expect(
        root.querySelector(".sprite-browser__preview-status")?.textContent,
      ).toBe("");

      failurePlaceholder(root)
        .querySelector<HTMLElement>('[data-action="retry-preview"]')
        ?.click();
      await vi.waitFor(() => expect(drawPixels).toHaveBeenCalledTimes(1));
      expect(failurePlaceholder(root).hidden).toBe(true);
    });

    it("reports a rejected preview as an engine failure without an unhandled rejection", async () => {
      const onEngineFailure = vi.fn();
      const error = new Error("wasm gone");
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
        resolveSpritePixels: vi.fn().mockRejectedValue(error),
        onEngineFailure,
      });
      expandFirstGroup(root);
      selectSprite(root, 0);

      await vi.waitFor(() =>
        expect(onEngineFailure).toHaveBeenCalledWith(error),
      );
      expect(failurePlaceholder(root).hidden).toBe(false);
      expect(root.querySelector(".problem__detail")?.textContent).toBe(
        "wasm gone",
      );
    });

    it("never paints a stale answer over the sprite selected since", async () => {
      const first = deferred<SpritePixelResult[]>();
      const second = deferred<SpritePixelResult[]>();
      const resolveSpritePixels = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const drawPixels = vi.fn();
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
        resolveSpritePixels,
        drawPixels,
      });
      expandFirstGroup(root);
      selectSprite(root, 0);
      selectSprite(root, 1);

      second.resolve([okPixelResult(8, 8)]);
      await vi.waitFor(() => expect(drawPixels).toHaveBeenCalledTimes(1));
      first.resolve([okPixelResult(10, 20)]);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(drawPixels).toHaveBeenCalledTimes(1);
      expect(drawPixels.mock.calls[0][2]).toBe(8);
    });

    it("explains a failed import under the control, keeps the raw text behind details and reports it to the registry", async () => {
      const problems = { report: vi.fn(), clear: vi.fn() };
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
        problems,
        decodeImageFile: vi.fn().mockResolvedValue({
          ok: false,
          error: "InvalidStateError: source image is broken",
        }),
      });
      const fileInput = root.querySelector<HTMLInputElement>(
        ".sprite-browser__import-file",
      ) as HTMLInputElement;
      Object.defineProperty(fileInput, "files", { value: [fakeFile()] });
      fileInput.dispatchEvent(new Event("change"));
      root
        .querySelector<HTMLElement>(".sprite-browser__import-submit")
        ?.click();

      const failure = await vi.waitFor(() => {
        const found = root.querySelector<HTMLElement>(
          ".inline-error:not([hidden])",
        );
        if (!found) throw new Error("no inline error yet");
        return found;
      });
      expect(failure.textContent).toContain("Couldn't import this sprite");
      expect(failure.textContent).toContain("Choose a PNG or PCX file.");
      expect(failure.querySelector(".problem__detail")?.textContent).toBe(
        "InvalidStateError: source image is broken",
      );
      expect(fileInput.getAttribute("aria-describedby")).toBe(failure.id);
      expect(problems.report).toHaveBeenCalledTimes(1);
      expect(problems.report.mock.calls[0].slice(0, 2)).toEqual([
        "sprites",
        "import",
      ]);

      failure
        .querySelector<HTMLElement>('[data-action="dismiss-error"]')
        ?.click();
      expect(failure.hidden).toBe(true);
      expect(problems.clear).toHaveBeenCalledWith("sprites", "import");
    });

    it("shows a failed replace under its own control too", async () => {
      const root = document.createElement("div");
      renderSpriteBrowser(root, characterWithSprites(), sffBytes, [], {
        resolveSpritePixels: vi.fn().mockResolvedValue([okPixelResult(2, 2)]),
        drawPixels: vi.fn(),
        decodeImageFile: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "broken" }),
      });
      expandFirstGroup(root);
      selectSprite(root, 0);
      const fileInput = root.querySelector<HTMLInputElement>(
        ".sprite-browser__replace-file",
      ) as HTMLInputElement;
      Object.defineProperty(fileInput, "files", { value: [fakeFile()] });
      fileInput.dispatchEvent(new Event("change"));

      await vi.waitFor(() =>
        expect(
          root.querySelector(".sprite-browser__replace-error:not([hidden])"),
        ).not.toBeNull(),
      );
      expect(
        root.querySelector(".sprite-browser__replace-error")?.textContent,
      ).toContain("Couldn't import this sprite");
    });
  });
});
