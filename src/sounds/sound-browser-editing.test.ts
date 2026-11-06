import { describe, expect, it, vi } from "vitest";
import type { CharacterData, Sound } from "../wasm/types.ts";
import {
  type SoundBrowserEditing,
  type SoundPlayer,
  renderSoundBrowser,
} from "./sound-browser.ts";
import type { PrepareSoundEditResult } from "./sound-editing.ts";
import type { SoundEdit } from "./sound-edits.ts";

function sound(
  group: number,
  sample: number,
  extra: Partial<Sound> = {},
): Sound {
  return {
    group,
    sample,
    sampleRate: 22050,
    channels: 1,
    bitsPerSample: 16,
    pcm: [1, -1],
    ...extra,
  };
}

function character(sounds: CharacterData["sounds"]): CharacterData {
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
    animations: [],
    sprites: [],
    stateDefs: [],
    sounds,
  };
}

const baseSounds = [
  { index: 0, sounds: [sound(0, 0), sound(0, 2)] },
  { index: 5, sounds: [sound(5, 1)] },
];

const quietPlayer: SoundPlayer = { play: vi.fn(), stop: vi.fn() };

/** A fake caller: edits live in an array the way the document store keeps them. */
function fakeEditing(
  overrides: Partial<SoundBrowserEditing> = {},
): SoundBrowserEditing & { edits: () => SoundEdit[]; stored: SoundEdit[] } {
  const stored: SoundEdit[] = [];
  const editing: SoundBrowserEditing = {
    edits: () => stored,
    prepare: vi.fn(async (request): Promise<PrepareSoundEditResult> => {
      if (request.kind === "delete") return { ok: true, edit: request };
      return {
        ok: true,
        edit: {
          ...request,
          sound: sound(request.group, request.sample, { sampleRate: 8000 }),
        },
      };
    }),
    commit: vi.fn((edit) => {
      stored.push(edit);
      return true;
    }),
    references: vi.fn(() => ({ exact: 0, unresolved: 0 })),
    ...overrides,
  };
  return Object.assign(editing, { stored }) as SoundBrowserEditing & {
    edits: () => SoundEdit[];
    stored: SoundEdit[];
  };
}

function mount(
  editing: SoundBrowserEditing | undefined,
  files: { sndIssue?: string } = {},
  sounds = baseSounds,
): HTMLElement {
  const root = document.createElement("div");
  renderSoundBrowser(root, character(sounds), files, {
    createPlayer: () => quietPlayer,
    editing,
  });
  return root;
}

function q<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`no element for ${selector}`);
  return found;
}

function expandAll(root: HTMLElement): void {
  for (const toggle of root.querySelectorAll<HTMLElement>(
    ".sound-browser__group-toggle",
  )) {
    toggle.click();
  }
}

function row(root: HTMLElement, key: string): HTMLElement {
  return q(root, `.sound-browser__sound[data-key="${key}"]`);
}

function chooseFile(input: HTMLInputElement, name = "boom.wav"): void {
  const file = new File([new Uint8Array([1, 2, 3])], name, {
    type: "audio/wav",
  });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
}

function sampleKeys(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(".sound-browser__sound")].map(
    (r) => r.dataset.key ?? "",
  );
}

describe("sound browser without editing", () => {
  it("shows no import or selection controls", () => {
    const root = mount(undefined);
    expandAll(root);
    row(root, "0,0").click();

    expect(root.querySelector(".sound-browser__import")).toBeNull();
    expect(root.querySelector(".sound-browser__selected")).toBeNull();
  });

  it("shows no import controls when the .snd failed to load, even with editing available", () => {
    const root = mount(fakeEditing(), { sndIssue: "kfm.snd: bad signature" });

    expect(root.querySelector(".sound-browser__import")).toBeNull();
    expect(root.querySelector(".sound-browser__error")).not.toBeNull();
  });
});

describe("importing a sound", () => {
  it("defaults the group to the first group and the number to its first free one", () => {
    const root = mount(fakeEditing());

    expect(
      q<HTMLInputElement>(root, ".sound-browser__import-group").value,
    ).toBe("0");
    expect(
      q<HTMLInputElement>(root, ".sound-browser__import-sample").value,
    ).toBe("1");
  });

  it("follows the selected sound's group, and the number follows the chosen group until the user types one", () => {
    const root = mount(fakeEditing());
    expandAll(root);
    row(root, "5,1").click();

    const group = q<HTMLInputElement>(root, ".sound-browser__import-group");
    const sample = q<HTMLInputElement>(root, ".sound-browser__import-sample");
    expect(group.value).toBe("5");
    expect(sample.value).toBe("0");

    group.value = "0";
    group.dispatchEvent(new Event("input"));
    expect(sample.value).toBe("1");

    sample.value = "9";
    sample.dispatchEvent(new Event("input"));
    group.value = "5";
    group.dispatchEvent(new Event("input"));
    expect(sample.value).toBe("9");
  });

  it("sends the chosen file's bytes with the typed key, records the prepared edit and lists the new sound selected", async () => {
    const editing = fakeEditing();
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));

    q(root, ".sound-browser__import-submit").click();

    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());
    expect(editing.prepare).toHaveBeenCalledWith({
      kind: "add",
      group: 0,
      sample: 1,
      wav: new Uint8Array([1, 2, 3]),
    });
    expect(sampleKeys(root)).toContain("0,1");
    expect(q(root, ".sound-browser__selected-label").textContent).toBe(
      "Selected: 0,1",
    );
    expect(q(root, ".sound-browser__import-file")).toHaveProperty("value", "");
  });

  it("asks for a file first, without calling the module", () => {
    const editing = fakeEditing();
    const root = mount(editing);

    q(root, ".sound-browser__import-submit").click();

    expect(q(root, ".sound-browser__import-error").textContent).toBe(
      "Choose a WAV file to import first.",
    );
    expect(editing.prepare).not.toHaveBeenCalled();
  });

  it("refuses a negative or missing group or number with a message, without calling the module", () => {
    const editing = fakeEditing();
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));
    const group = q<HTMLInputElement>(root, ".sound-browser__import-group");
    const sample = q<HTMLInputElement>(root, ".sound-browser__import-sample");

    group.value = "-1";
    q(root, ".sound-browser__import-submit").click();
    expect(q(root, ".sound-browser__import-error").textContent).toContain(
      "group",
    );

    group.value = "2";
    sample.value = "";
    q(root, ".sound-browser__import-submit").click();
    expect(q(root, ".sound-browser__import-error").textContent).toContain(
      "sound number",
    );
    expect(editing.prepare).not.toHaveBeenCalled();
  });

  it("shows the module's refusal as an import error with its detail, and changes nothing", async () => {
    const editing = fakeEditing({
      prepare: vi.fn(async () => ({
        ok: false as const,
        error: "snd: sound (group 0, sample 1) already exists",
      })),
    });
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));

    q(root, ".sound-browser__import-submit").click();

    await vi.waitFor(() =>
      expect(root.querySelector(".inline-error:not([hidden])")).not.toBeNull(),
    );
    expect(root.textContent).toContain("Couldn't import this sound");
    expect(root.querySelector(".inline-error")?.textContent).toContain(
      "already exists",
    );
    expect(editing.commit).not.toHaveBeenCalled();
    expect(sampleKeys(root)).not.toContain("0,1");
  });

  it("reports a file that cannot be read the same way", async () => {
    const editing = fakeEditing({
      prepare: vi.fn(async () => {
        throw new Error("disk on fire");
      }),
    });
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));

    q(root, ".sound-browser__import-submit").click();

    await vi.waitFor(() =>
      expect(
        root.querySelector(".inline-error:not([hidden])")?.textContent,
      ).toContain("disk on fire"),
    );
    expect(editing.commit).not.toHaveBeenCalled();
  });

  it("ignores a second click while an import is running", async () => {
    let finish: (r: PrepareSoundEditResult) => void = () => {};
    const editing = fakeEditing({
      prepare: vi.fn(
        () =>
          new Promise<PrepareSoundEditResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));
    const submit = q(root, ".sound-browser__import-submit");

    submit.click();
    await vi.waitFor(() => expect(editing.prepare).toHaveBeenCalled());
    expect(submit.getAttribute("aria-disabled")).toBe("true");
    submit.click();
    expect(editing.prepare).toHaveBeenCalledTimes(1);

    finish({
      ok: true,
      edit: {
        kind: "add",
        group: 0,
        sample: 1,
        wav: new Uint8Array(),
        sound: sound(0, 1),
      },
    });
    await vi.waitFor(() =>
      expect(submit.hasAttribute("aria-disabled")).toBe(false),
    );
  });
});

describe("replacing a sound", () => {
  it("replaces the selected sound's audio with the chosen file, keeping its key", async () => {
    const editing = fakeEditing();
    const root = mount(editing);
    expandAll(root);
    row(root, "5,1").click();

    chooseFile(q(root, ".sound-browser__replace-file"));

    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());
    expect(editing.prepare).toHaveBeenCalledWith({
      kind: "replace",
      group: 5,
      sample: 1,
      wav: new Uint8Array([1, 2, 3]),
    });
    expect(sampleKeys(root)).toEqual(["0,0", "0,2", "5,1"]);
  });

  it("stops the sound if it was playing, so the old audio does not keep going", async () => {
    const player = { play: vi.fn(), stop: vi.fn() };
    const root = document.createElement("div");
    const editing = fakeEditing();
    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => player, editing },
    );
    expandAll(root);
    row(root, "5,1").click();
    player.stop.mockClear();

    chooseFile(q(root, ".sound-browser__replace-file"));
    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());

    expect(player.stop).toHaveBeenCalled();
  });

  it("shows the module's refusal under the picker and keeps the sound as it was", async () => {
    const editing = fakeEditing({
      prepare: vi.fn(async () => ({
        ok: false as const,
        error: "unsupported WAVE format tag 2",
      })),
    });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();

    chooseFile(q(root, ".sound-browser__replace-file"));

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__replace-error").hidden).toBe(false),
    );
    expect(q(root, ".sound-browser__replace-error").textContent).toContain(
      "format tag 2",
    );
    expect(editing.commit).not.toHaveBeenCalled();
  });

  it("can select a sound that cannot be played, to replace it", () => {
    const broken = [
      { index: 1, sounds: [sound(1, 0, { error: "bad data", pcm: [] })] },
    ];
    const root = mount(fakeEditing(), {}, broken);
    expandAll(root);

    row(root, "1,0").click();

    expect(q(root, ".sound-browser__selected-label").textContent).toBe(
      "Selected: 1,0",
    );
    expect(root.querySelector(".sound-browser__replace-file")).not.toBeNull();
  });
});

describe("deleting a sound", () => {
  function selectAndAskDelete(root: HTMLElement, key: string): void {
    expandAll(root);
    row(root, key).click();
    q(root, ".sound-browser__delete").click();
  }

  it("says no controller uses it, and deletes after a confirm", async () => {
    const editing = fakeEditing();
    const root = mount(editing);

    selectAndAskDelete(root, "0,0");

    expect(q(root, ".sound-browser__delete-warning").textContent).toBe(
      "Not used by any controller.",
    );
    expect(q(root, ".sound-browser__delete-confirm").textContent).toBe(
      "Confirm delete",
    );
    expect(editing.commit).not.toHaveBeenCalled();

    q(root, ".sound-browser__delete-confirm").click();

    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());
    expect(editing.commit).toHaveBeenCalledWith({
      kind: "delete",
      group: 0,
      sample: 0,
    });
    expect(sampleKeys(root)).toEqual(["0,2", "5,1"]);
    expect(root.querySelector(".sound-browser__selected-label")).toBeNull();
  });

  it("warns how many controllers use it, singular and plural, and says so on the confirm button", () => {
    const one = mount(
      fakeEditing({ references: () => ({ exact: 1, unresolved: 0 }) }),
    );
    selectAndAskDelete(one, "0,0");
    expect(q(one, ".sound-browser__delete-warning").textContent).toBe(
      "Used by 1 controller.",
    );
    expect(q(one, ".sound-browser__delete-confirm").textContent).toBe(
      "Confirm delete (used by 1 controller)",
    );

    const many = mount(
      fakeEditing({ references: () => ({ exact: 3, unresolved: 0 }) }),
    );
    selectAndAskDelete(many, "0,0");
    expect(q(many, ".sound-browser__delete-warning").textContent).toBe(
      "Used by 3 controllers.",
    );
    expect(q(many, ".sound-browser__delete-confirm").textContent).toContain(
      "3 controllers",
    );
  });

  it("also tells how many controllers pick their sound with an expression", () => {
    const root = mount(
      fakeEditing({ references: () => ({ exact: 2, unresolved: 2 }) }),
    );
    selectAndAskDelete(root, "0,0");

    expect(q(root, ".sound-browser__delete-warning").textContent).toBe(
      "Used by 2 controllers. 2 other controllers pick their sound with an expression and may play it.",
    );
  });

  it("asks the caller about the selected sound's own key", () => {
    const editing = fakeEditing();
    const root = mount(editing);

    selectAndAskDelete(root, "5,1");

    expect(editing.references).toHaveBeenCalledWith(5, 1);
  });

  it("goes back to the idle actions on Cancel, deleting nothing", () => {
    const editing = fakeEditing();
    const root = mount(editing);
    selectAndAskDelete(root, "0,0");

    q(root, ".sound-browser__delete-cancel").click();

    expect(editing.commit).not.toHaveBeenCalled();
    expect(root.querySelector(".sound-browser__delete-confirm")).toBeNull();
    expect(root.querySelector(".sound-browser__delete")).not.toBeNull();
  });

  it("drops a pending confirm when another sound is selected", () => {
    const root = mount(fakeEditing());
    selectAndAskDelete(root, "0,0");

    row(root, "5,1").click();

    expect(root.querySelector(".sound-browser__delete-confirm")).toBeNull();
    expect(q(root, ".sound-browser__selected-label").textContent).toBe(
      "Selected: 5,1",
    );
  });
});

describe("re-rendering the same root", () => {
  it("keeps the open groups and the selected sound, and shows the edits made meanwhile", () => {
    const root = document.createElement("div");
    const editing = fakeEditing();
    const render = () =>
      renderSoundBrowser(
        root,
        character(baseSounds),
        {},
        { createPlayer: () => quietPlayer, editing },
      );
    render();
    expandAll(root);
    row(root, "5,1").click();

    editing.stored.push({ kind: "delete", group: 0, sample: 0 });
    render();

    expect(sampleKeys(root)).toEqual(["0,2", "5,1"]);
    expect(q(root, ".sound-browser__selected-label").textContent).toBe(
      "Selected: 5,1",
    );
  });

  it("clears the selection when its sound is gone after an undo or a delete", () => {
    const root = document.createElement("div");
    const editing = fakeEditing();
    editing.stored.push({
      kind: "add",
      group: 9,
      sample: 9,
      wav: new Uint8Array(),
      sound: sound(9, 9),
    });
    const render = () =>
      renderSoundBrowser(
        root,
        character(baseSounds),
        {},
        { createPlayer: () => quietPlayer, editing },
      );
    render();
    expandAll(root);
    row(root, "9,9").click();

    editing.stored.length = 0;
    render();

    expect(root.querySelector(".sound-browser__selected-label")).toBeNull();
  });
});

describe("edits that cannot be recorded", () => {
  it("says so when the sounds changed while an import was being checked, and records nothing", async () => {
    const editing = fakeEditing({ commit: vi.fn(() => false) });
    const root = mount(editing);
    chooseFile(q(root, ".sound-browser__import-file"));

    q(root, ".sound-browser__import-submit").click();

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__status").textContent).toContain(
        "changed while this was being checked",
      ),
    );
    expect(sampleKeys(root)).not.toContain("0,1");
    expect(root.querySelector(".inline-error:not([hidden])")).toBeNull();
  });

  it("says so for a replace, and keeps the sound as it was", async () => {
    const editing = fakeEditing({ commit: vi.fn(() => false) });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();

    chooseFile(q(root, ".sound-browser__replace-file"));

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__status").textContent).toContain(
        "changed while this was being checked",
      ),
    );
  });

  it("says so for a delete, and drops the confirm", async () => {
    const editing = fakeEditing({ commit: vi.fn(() => false) });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();
    q(root, ".sound-browser__delete").click();

    q(root, ".sound-browser__delete-confirm").click();

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__status").textContent).toContain(
        "changed while this was being checked",
      ),
    );
    expect(root.querySelector(".sound-browser__delete-confirm")).toBeNull();
    expect(sampleKeys(root)).toContain("0,0");
  });

  it("shows the module's refusal of a delete in the status line instead of deleting", async () => {
    const editing = fakeEditing({
      prepare: vi.fn(async () => ({
        ok: false as const,
        error: "snd: no sound (group 0, sample 0) to remove",
      })),
    });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();
    q(root, ".sound-browser__delete").click();

    q(root, ".sound-browser__delete-confirm").click();

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__status").textContent).toContain(
        "to remove",
      ),
    );
    expect(editing.commit).not.toHaveBeenCalled();
  });

  it("ignores the delete confirm while an import is still being checked", async () => {
    let finish: (r: PrepareSoundEditResult) => void = () => {};
    const editing = fakeEditing({
      prepare: vi.fn(
        () =>
          new Promise<PrepareSoundEditResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();
    q(root, ".sound-browser__delete").click();
    chooseFile(q(root, ".sound-browser__import-file"));
    q(root, ".sound-browser__import-submit").click();
    await vi.waitFor(() => expect(editing.prepare).toHaveBeenCalledTimes(1));

    q(root, ".sound-browser__delete-confirm").click();

    expect(editing.prepare).toHaveBeenCalledTimes(1);
    finish({ ok: false, error: "x" });
  });

  it("does not record or draw anything when the browser was re-rendered while a request was in flight", async () => {
    let finish: (r: PrepareSoundEditResult) => void = () => {};
    const editing = fakeEditing({
      prepare: vi.fn(
        () =>
          new Promise<PrepareSoundEditResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const root = document.createElement("div");
    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => quietPlayer, editing },
    );
    chooseFile(q(root, ".sound-browser__import-file"));
    q(root, ".sound-browser__import-submit").click();
    await vi.waitFor(() => expect(editing.prepare).toHaveBeenCalled());

    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => quietPlayer, editing },
    );
    finish({
      ok: true,
      edit: {
        kind: "add",
        group: 0,
        sample: 1,
        wav: new Uint8Array(),
        sound: sound(0, 1),
      },
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(editing.commit).not.toHaveBeenCalled();
  });

  it("reports a replace whose check throws, like a refusal", async () => {
    const editing = fakeEditing({
      prepare: vi.fn(async () => {
        throw new Error("disk on fire");
      }),
    });
    const root = mount(editing);
    expandAll(root);
    row(root, "0,0").click();

    chooseFile(q(root, ".sound-browser__replace-file"));

    await vi.waitFor(() =>
      expect(q(root, ".sound-browser__replace-error").textContent).toContain(
        "disk on fire",
      ),
    );
    expect(editing.commit).not.toHaveBeenCalled();
  });

  it("reaches the problem sink, so the sidebar counts a refused import", async () => {
    const sink = { report: vi.fn(), clear: vi.fn() };
    const editing = fakeEditing({
      prepare: vi.fn(async () => ({ ok: false as const, error: "nope" })),
    });
    const root = document.createElement("div");
    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => quietPlayer, editing, problems: sink },
    );
    chooseFile(q(root, ".sound-browser__import-file"));

    q(root, ".sound-browser__import-submit").click();

    await vi.waitFor(() =>
      expect(sink.report).toHaveBeenCalledWith(
        "sounds",
        "import",
        expect.objectContaining({ code: "import.sound" }),
      ),
    );
  });
});

describe("playback after an edit", () => {
  it("lets a replaced sound play again after the old one failed to play", () => {
    const failing = {
      play: vi.fn(() => {
        throw new Error("rate not supported");
      }),
      stop: vi.fn(),
    };
    const root = document.createElement("div");
    const editing = fakeEditing();
    const render = () =>
      renderSoundBrowser(
        root,
        character(baseSounds),
        {},
        { createPlayer: () => failing, editing },
      );
    render();
    expandAll(root);
    row(root, "5,1").click();
    expect(row(root, "5,1").textContent).toContain("Can't be played");

    editing.stored.push({
      kind: "replace",
      group: 5,
      sample: 1,
      wav: new Uint8Array(),
      sound: sound(5, 1, { sampleRate: 22050 }),
    });
    render();

    expect(row(root, "5,1").textContent).toContain("Play");
    expect(row(root, "5,1").getAttribute("aria-disabled")).not.toBe("true");
  });

  it("stops a playing sound when it is deleted", async () => {
    const player = { play: vi.fn(), stop: vi.fn() };
    const root = document.createElement("div");
    const editing = fakeEditing();
    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => player, editing },
    );
    expandAll(root);
    row(root, "0,0").click();
    player.stop.mockClear();

    q(root, ".sound-browser__delete").click();
    q(root, ".sound-browser__delete-confirm").click();

    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());
    expect(player.stop).toHaveBeenCalled();
  });

  it("after a replace, plays the newly decoded sound", async () => {
    const player = { play: vi.fn(), stop: vi.fn() };
    const root = document.createElement("div");
    const editing = fakeEditing();
    renderSoundBrowser(
      root,
      character(baseSounds),
      {},
      { createPlayer: () => player, editing },
    );
    expandAll(root);
    row(root, "5,1").click();
    chooseFile(q(root, ".sound-browser__replace-file"));
    await vi.waitFor(() => expect(editing.commit).toHaveBeenCalled());
    player.play.mockClear();

    row(root, "5,1").click();

    expect(player.play).toHaveBeenCalledWith(
      expect.objectContaining({ group: 5, sample: 1, sampleRate: 8000 }),
      expect.any(Function),
    );
  });
});
