import { describe, expect, it, vi } from "vitest";
import type { LoadCmdResult } from "../wasm/bridge.ts";
import type { CharacterData, CommandFile, StateDef } from "../wasm/types.ts";
import { renderCommandEditor } from "./command-editor.ts";

function fixtureCharacter(
  overrides: Partial<CharacterData> = {},
): CharacterData {
  return {
    name: "Kung Fu Man",
    author: "Elecbyte",
    spriteFile: "kfm.sff",
    animationFile: "kfm.air",
    soundFile: "kfm.snd",
    commandFile: "kfm.cmd",
    constantsFile: "kfm.cns",
    stateFiles: [],
    palettes: [],
    animations: [],
    sprites: [],
    stateDefs: [stateDef({ number: 0 }), stateDef({ number: 1000 })],
    ...overrides,
  };
}

function stateDef(overrides: Partial<StateDef> = {}): StateDef {
  return {
    number: 0,
    type: "S",
    moveType: "I",
    physics: "S",
    anim: 0,
    ctrl: true,
    powerAdd: 0,
    juggle: 0,
    faceP2: false,
    hitDefPersist: false,
    moveHitPersist: false,
    hitCountPersist: false,
    sprPriority: 0,
    controllers: [],
    ...overrides,
  };
}

function loadedCommandFile(overrides: Partial<CommandFile> = {}): CommandFile {
  return {
    remap: {},
    defaults: { time: 15, bufferTime: 1 },
    commands: [
      { name: "QCF_a", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ],
    states: [
      stateDef({
        number: -1,
        controllers: [
          {
            type: "ChangeState",
            triggers: ['command = "QCF_a"'],
            parameters: { value: "1000" },
          },
        ],
      }),
    ],
    ...overrides,
  };
}

function stubLoadCmd(
  result: LoadCmdResult,
): (cmdBytes: Uint8Array) => Promise<LoadCmdResult> {
  return async () => result;
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".command-editor__row"));
}

function field(row: HTMLElement, name: string): HTMLInputElement {
  const el = row.querySelector<HTMLInputElement>(`input[data-field="${name}"]`);
  if (!el) throw new Error(`field ${name} not found`);
  return el;
}

function fieldError(row: HTMLElement, name: string): HTMLElement {
  const el = row.querySelector<HTMLElement>(`[data-field-error="${name}"]`);
  if (!el) throw new Error(`error slot ${name} not found`);
  return el;
}

function addButton(root: HTMLElement): HTMLElement {
  return root.querySelector('[data-action="add-command"]') as HTMLElement;
}

function removeButton(row: HTMLElement): HTMLElement {
  return row.querySelector('[data-action="remove-command"]') as HTMLElement;
}

describe("renderCommandEditor", () => {
  it("starts empty and lets the user create a new command with no .cmd file supplied", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();

    renderCommandEditor(root, fixtureCharacter(), null, { onChange });

    expect(root.querySelector(".command-editor__empty")).not.toBeNull();
    expect(rows(root)).toHaveLength(0);

    addButton(root).click();
    expect(rows(root)).toHaveLength(1);

    const row = rows(root)[0];
    // Freshly added row: blank required fields must not be flagged invalid yet.
    expect(field(row, "name").classList.contains("is-invalid")).toBe(false);
    expect(field(row, "input").classList.contains("is-invalid")).toBe(false);

    setValue(field(row, "name"), "QCF_a");
    blur(field(row, "name"));
    setValue(field(row, "input"), "~D, DF, F, a");
    blur(field(row, "input"));

    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([
      { name: "QCF_a", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ]);
    expect(last.states).toEqual([]);
  });

  it("loads and displays an existing command's input sequence, timing, and mapped target state", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();

    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: true, commandFile: loadedCommandFile() }),
    });
    await vi.waitFor(() => {
      expect(rows(root)).toHaveLength(1);
    });

    const row = rows(root)[0];
    expect(field(row, "name").value).toBe("QCF_a");
    expect(field(row, "input").value).toBe("~D, DF, F, a");
    expect(field(row, "targetState").value).toBe("1000");
    expect(onChange).toHaveBeenCalledWith(loadedCommandFile());
  });

  it("clears an existing command's input sequence and shows an inline error instead of committing an invalid command", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: true, commandFile: loadedCommandFile() }),
    });
    await vi.waitFor(() => {
      expect(rows(root)).toHaveLength(1);
    });
    const row = rows(root)[0];

    setValue(field(row, "input"), "   ");
    blur(field(row, "input"));

    expect(field(row, "input").classList.contains("is-invalid")).toBe(true);
    expect(fieldError(row, "input").textContent).toBe(
      "Input sequence cannot be empty.",
    );
    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([]);
    // The existing state link is dropped along with the now-invalid
    // command, not left dangling on a broken row's stale name -- the
    // always-state container itself is left in place, just with no
    // ChangeState controller pointing at this command anymore.
    expect(last.states[0]?.controllers).toEqual([]);
  });

  it("shows an inline error for a target state number that doesn't exist, without touching an existing link until fixed", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: true, commandFile: loadedCommandFile() }),
    });
    await vi.waitFor(() => {
      expect(rows(root)).toHaveLength(1);
    });
    const row = rows(root)[0];

    setValue(field(row, "targetState"), "42");
    blur(field(row, "targetState"));

    expect(field(row, "targetState").classList.contains("is-invalid")).toBe(
      true,
    );
    expect(fieldError(row, "targetState").textContent).toBe(
      "No state 42 exists.",
    );
    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([]);
  });

  it("re-keys a command's target-state link when the command is renamed", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: true, commandFile: loadedCommandFile() }),
    });
    await vi.waitFor(() => {
      expect(rows(root)).toHaveLength(1);
    });
    const row = rows(root)[0];

    setValue(field(row, "name"), "QCF_a_renamed");
    blur(field(row, "name"));

    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([
      { name: "QCF_a_renamed", input: "~D, DF, F, a", time: 0, bufferTime: 0 },
    ]);
    const controllers = last.states[0]?.controllers ?? [];
    expect(controllers).toHaveLength(1);
    expect(controllers[0].triggers).toContain('command = "QCF_a_renamed"');
    expect(controllers[0].parameters.value).toBe("1000");
  });

  it("flags two commands sharing the same name, committing neither", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCommandEditor(root, fixtureCharacter(), null, { onChange });

    addButton(root).click();
    addButton(root).click();
    const [first, second] = rows(root);

    setValue(field(first, "name"), "Dup");
    blur(field(first, "name"));
    setValue(field(first, "input"), "a");
    blur(field(first, "input"));
    setValue(field(second, "name"), "Dup");
    blur(field(second, "name"));
    setValue(field(second, "input"), "b");
    blur(field(second, "input"));

    expect(field(first, "name").classList.contains("is-invalid")).toBe(true);
    expect(field(second, "name").classList.contains("is-invalid")).toBe(true);
    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([]);
  });

  it("removes a command and its target-state link immediately", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();
    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: true, commandFile: loadedCommandFile() }),
    });
    await vi.waitFor(() => {
      expect(rows(root)).toHaveLength(1);
    });
    const row = rows(root)[0];

    removeButton(row).click();

    expect(rows(root)).toHaveLength(0);
    const last = onChange.mock.calls.at(-1)?.[0] as CommandFile;
    expect(last.commands).toEqual([]);
    expect(last.states[0]?.controllers).toEqual([]);
  });

  it("shows a clear error banner but stays usable when the .cmd file fails to parse", async () => {
    const root = document.createElement("div");
    const onChange = vi.fn();

    renderCommandEditor(root, fixtureCharacter(), new Uint8Array([1]), {
      onChange,
      loadCmd: stubLoadCmd({ ok: false, error: "malformed .cmd file" }),
    });

    await vi.waitFor(() => {
      const alert = root.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("malformed .cmd file");
    });

    addButton(root).click();
    expect(rows(root)).toHaveLength(1);
  });
});
