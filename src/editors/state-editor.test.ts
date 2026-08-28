import { describe, expect, it, vi } from "vitest";
import type { CharacterData, StateDef } from "../wasm/types.ts";
import { renderStateEditor } from "./state-editor.ts";

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
    stateDefs: [],
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

function toggle(root: HTMLElement, statedefNumber: number): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>(
    `[data-statedef="${statedefNumber}"] .state-editor__statedef-toggle`,
  );
  if (!el) throw new Error(`toggle not found for statedef ${statedefNumber}`);
  return el;
}

function controllerRows(
  root: HTMLElement,
  statedefNumber: number,
): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[data-statedef="${statedefNumber}"] .state-editor__controller`,
    ),
  );
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function click(el: Element | null): void {
  if (!el) throw new Error("cannot click a null element");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("renderStateEditor", () => {
  it("lists every StateDef with its number and read-only header info", () => {
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({ number: 0, type: "S", moveType: "I", physics: "S" }),
          stateDef({ number: 200, type: "A", moveType: "A", physics: "A" }),
        ],
      }),
      { onChange: vi.fn() },
    );

    expect(toggle(root, 0).textContent).toContain("0");
    expect(toggle(root, 0).textContent).toMatch(/S.*I.*S/);
    expect(toggle(root, 200).textContent).toContain("200");
  });

  it("shows a StateDef's controllers, in order, once expanded", () => {
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              {
                type: "VelSet",
                triggers: ["Time = 0"],
                parameters: { x: "0" },
              },
              { type: "ChangeState", triggers: [], parameters: { value: "0" } },
            ],
          }),
        ],
      }),
      { onChange: vi.fn() },
    );

    click(toggle(root, 0));

    const rows = controllerRows(root, 0);
    expect(rows).toHaveLength(2);
    expect(
      rows[0].querySelector<HTMLInputElement>('[data-field="type"]')?.value,
    ).toBe("VelSet");
    expect(
      rows[1].querySelector<HTMLInputElement>('[data-field="type"]')?.value,
    ).toBe("ChangeState");
  });

  it("shows an empty state, not a blank list, for a StateDef with no controllers", () => {
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [stateDef({ number: 0, controllers: [] })],
      }),
      { onChange: vi.fn() },
    );

    click(toggle(root, 0));

    expect(controllerRows(root, 0)).toHaveLength(0);
    expect(root.querySelector(`[data-statedef="0"]`)?.textContent).toMatch(
      /no controllers/i,
    );
  });

  it("commits an edited controller type, trigger, and parameter into a patch", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              {
                type: "VelSet",
                triggers: ["Time = 0"],
                parameters: { x: "0" },
              },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    const row = controllerRows(root, 0)[0];
    const typeInput = row.querySelector<HTMLInputElement>(
      '[data-field="type"]',
    );
    if (!typeInput) throw new Error("type input not found");
    setValue(typeInput, "VelAdd");
    blur(typeInput);

    const triggerInput = row.querySelector<HTMLInputElement>(
      '[data-trigger-index="0"]',
    );
    if (!triggerInput) throw new Error("trigger input not found");
    setValue(triggerInput, "Time = 1");
    blur(triggerInput);

    const paramValueInput = row.querySelector<HTMLInputElement>(
      '[data-parameter-index="0"][data-parameter-part="value"]',
    );
    if (!paramValueInput) throw new Error("parameter value input not found");
    setValue(paramValueInput, "5");
    blur(paramValueInput);

    expect(onChange).toHaveBeenCalled();
    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    const committed = lastPatch.stateDefs?.[0].controllers[0];
    expect(committed).toEqual({
      type: "VelAdd",
      triggers: ["Time = 1"],
      parameters: { x: "5" },
    });
  });

  it("adds a new controller with an empty, editable type -- never flagged unsupported", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [stateDef({ number: 0, controllers: [] })],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    click(
      root.querySelector(`[data-statedef="0"] [data-action="add-controller"]`),
    );

    const rows = controllerRows(root, 0);
    expect(rows).toHaveLength(1);
    expect(
      rows[0].querySelector(".state-editor__unsupported-badge"),
    ).toBeNull();
    const typeInput = rows[0].querySelector<HTMLInputElement>(
      '[data-field="type"]',
    );
    expect(typeInput).not.toBeNull();
    expect(typeInput?.value).toBe("");
    expect(typeInput?.disabled).toBe(false);

    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers).toHaveLength(1);
  });

  it("removes a controller immediately, with no confirmation step", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "VelSet", triggers: [], parameters: {} },
              { type: "ChangeState", triggers: [], parameters: {} },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    click(
      controllerRows(root, 0)[0].querySelector(
        '[data-action="remove-controller"]',
      ),
    );

    expect(controllerRows(root, 0)).toHaveLength(1);
    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers).toEqual([
      { type: "ChangeState", triggers: [], parameters: {} },
    ]);
  });

  it("reorders controllers with move-up/move-down, disabled at the list boundary", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "First", triggers: [], parameters: {} },
              { type: "Second", triggers: [], parameters: {} },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    let rows = controllerRows(root, 0);
    expect(
      rows[0]
        .querySelector('[data-action="move-up"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
    expect(
      rows[1]
        .querySelector('[data-action="move-down"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);

    click(rows[1].querySelector('[data-action="move-up"]'));

    rows = controllerRows(root, 0);
    expect(
      rows[0].querySelector<HTMLInputElement>('[data-field="type"]')?.value,
    ).toBe("Second");
    expect(
      rows[1].querySelector<HTMLInputElement>('[data-field="type"]')?.value,
    ).toBe("First");

    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers.map((c) => c.type)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("never crashes when a boundary row's move button is clicked despite being disabled", () => {
    // jsdom doesn't enforce a custom element's `disabled` attribute the way
    // a real browser blocks a disabled native button's clicks, so a stray
    // programmatic/synthetic click on a boundary row's move button (found
    // via real-browser runtime verification) must still be a safe no-op,
    // not rely solely on the DOM attribute to prevent it.
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "First", triggers: [], parameters: {} },
              { type: "Second", triggers: [], parameters: {} },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    const rows = controllerRows(root, 0);
    expect(() =>
      click(rows[0].querySelector('[data-action="move-up"]')),
    ).not.toThrow();
    expect(() =>
      click(rows[1].querySelector('[data-action="move-down"]')),
    ).not.toThrow();

    const types = controllerRows(root, 0).map(
      (r) => r.querySelector<HTMLInputElement>('[data-field="type"]')?.value,
    );
    expect(types).toEqual(["First", "Second"]);
  });

  it("adds and removes trigger rows within a controller", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "VelSet", triggers: ["Time = 0"], parameters: {} },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    click(
      controllerRows(root, 0)[0].querySelector('[data-action="add-trigger"]'),
    );
    let row = controllerRows(root, 0)[0];
    const newTrigger = row.querySelector<HTMLInputElement>(
      '[data-trigger-index="1"]',
    );
    expect(newTrigger).not.toBeNull();
    setValue(newTrigger as HTMLInputElement, "Ctrl");
    blur(newTrigger as HTMLInputElement);

    let lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers[0].triggers).toEqual([
      "Time = 0",
      "Ctrl",
    ]);

    click(row.querySelector('[data-remove-trigger-index="0"]'));
    row = controllerRows(root, 0)[0];
    lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers[0].triggers).toEqual(["Ctrl"]);
  });

  it("adds a parameter row and commits duplicate keys as last-value-wins", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "VelSet", triggers: [], parameters: { x: "1" } },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    click(
      controllerRows(root, 0)[0].querySelector('[data-action="add-parameter"]'),
    );
    const row = controllerRows(root, 0)[0];
    const newKey = row.querySelector<HTMLInputElement>(
      '[data-parameter-index="1"][data-parameter-part="key"]',
    );
    const newValue = row.querySelector<HTMLInputElement>(
      '[data-parameter-index="1"][data-parameter-part="value"]',
    );
    if (!newKey || !newValue) throw new Error("new parameter row not found");
    setValue(newKey, "x");
    blur(newKey);
    setValue(newValue, "9");
    blur(newValue);

    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs?.[0].controllers[0].parameters).toEqual({
      x: "9",
    });
  });

  it("flags a controller loaded with a blank type as unsupported, read-only, but still removable", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "", triggers: ["Time = 0"], parameters: { x: "1" } },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    const row = controllerRows(root, 0)[0];
    expect(
      row.querySelector(".state-editor__unsupported-badge"),
    ).not.toBeNull();
    expect(row.querySelector('[data-field="type"]')).toBeNull();
    expect(row.textContent).toContain("Time = 0");

    click(row.querySelector('[data-action="remove-controller"]'));
    expect(controllerRows(root, 0)).toHaveLength(0);
  });

  it("never locks a controller into unsupported just because its type is edited down to blank", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [{ type: "VelSet", triggers: [], parameters: {} }],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    const typeInput = controllerRows(
      root,
      0,
    )[0].querySelector<HTMLInputElement>('[data-field="type"]');
    if (!typeInput) throw new Error("type input not found");
    setValue(typeInput, "");
    blur(typeInput);

    const row = controllerRows(root, 0)[0];
    expect(row.querySelector(".state-editor__unsupported-badge")).toBeNull();
    expect(
      row.querySelector<HTMLInputElement>('[data-field="type"]')?.disabled,
    ).toBe(false);
  });

  it("creates a new StateDef with the next unused number and zero controllers", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [stateDef({ number: 0 }), stateDef({ number: 200 })],
      }),
      { onChange },
    );

    click(root.querySelector('[data-action="add-statedef"]'));

    expect(root.querySelector('[data-statedef="201"]')).not.toBeNull();
    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs).toHaveLength(3);
    const added = lastPatch.stateDefs?.find((s) => s.number === 201);
    expect(added?.controllers).toEqual([]);
  });

  it("starts numbering from 0 when creating the first StateDef", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(root, fixtureCharacter({ stateDefs: [] }), { onChange });

    click(root.querySelector('[data-action="add-statedef"]'));

    expect(root.querySelector('[data-statedef="0"]')).not.toBeNull();
  });

  it("requires a confirm step before removing a StateDef, showing its controller count", () => {
    const onChange = vi.fn();
    const root = document.createElement("div");
    renderStateEditor(
      root,
      fixtureCharacter({
        stateDefs: [
          stateDef({
            number: 0,
            controllers: [
              { type: "VelSet", triggers: [], parameters: {} },
              { type: "ChangeState", triggers: [], parameters: {} },
            ],
          }),
        ],
      }),
      { onChange },
    );
    click(toggle(root, 0));

    click(
      root.querySelector('[data-statedef="0"] [data-action="remove-statedef"]'),
    );

    const confirmButton = root.querySelector(
      '[data-statedef="0"] [data-action="confirm-remove-statedef"]',
    );
    expect(confirmButton).not.toBeNull();
    expect(confirmButton?.textContent).toContain("2");
    expect(onChange).not.toHaveBeenCalled();

    click(
      root.querySelector(
        '[data-statedef="0"] [data-action="cancel-remove-statedef"]',
      ),
    );
    expect(root.querySelector('[data-statedef="0"]')).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    click(
      root.querySelector('[data-statedef="0"] [data-action="remove-statedef"]'),
    );
    click(
      root.querySelector(
        '[data-statedef="0"] [data-action="confirm-remove-statedef"]',
      ),
    );

    expect(root.querySelector('[data-statedef="0"]')).toBeNull();
    const lastPatch = onChange.mock.calls.at(-1)?.[0] as Partial<CharacterData>;
    expect(lastPatch.stateDefs).toEqual([]);
  });
});
