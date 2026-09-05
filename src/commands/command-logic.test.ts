import { describe, expect, it } from "vitest";
import type { StateDef } from "../wasm/types.ts";
import {
  emptyCommandFile,
  findLinkedStateNumber,
  setLinkedState,
  validateCommandRow,
} from "./command-logic.ts";

function stateDef(overrides: Partial<StateDef> = {}): StateDef {
  return {
    number: -1,
    type: "U",
    moveType: "I",
    physics: "U",
    anim: 0,
    ctrl: false,
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

describe("emptyCommandFile", () => {
  it("returns a zero-value CommandFile with every collection non-null", () => {
    const file = emptyCommandFile();

    expect(file.remap).toEqual({});
    expect(file.defaults).toEqual({ time: 0, bufferTime: 0 });
    expect(file.commands).toEqual([]);
    expect(file.states).toEqual([]);
  });
});

describe("validateCommandRow", () => {
  it("passes for a well-formed row with no target state", () => {
    const result = validateCommandRow("QCF_a", "~D, DF, F, a", "", [], [0]);

    expect(result).toEqual({
      nameError: null,
      inputError: null,
      targetStateError: null,
      targetState: null,
    });
  });

  it("passes for a well-formed row mapped to an existing target state", () => {
    const result = validateCommandRow(
      "QCF_a",
      "~D, DF, F, a",
      "1000",
      [],
      [1000],
    );

    expect(result.nameError).toBeNull();
    expect(result.inputError).toBeNull();
    expect(result.targetStateError).toBeNull();
    expect(result.targetState).toBe(1000);
  });

  it("flags a blank name", () => {
    const result = validateCommandRow("  ", "a", "", [], []);

    expect(result.nameError).toBe("Name cannot be empty.");
  });

  it("flags a name already used by another command", () => {
    const result = validateCommandRow("QCF_a", "a", "", ["QCF_a", "b"], []);

    expect(result.nameError).toBe("Another command already uses this name.");
  });

  it("flags an empty input sequence", () => {
    const result = validateCommandRow("a", "   ", "", [], []);

    expect(result.inputError).toBe("Input sequence cannot be empty.");
  });

  it("flags a non-numeric target state", () => {
    const result = validateCommandRow("a", "a", "abc", [], [0, 1]);

    expect(result.targetStateError).toBe(
      "Target state must be a whole number.",
    );
    expect(result.targetState).toBeNull();
  });

  it("flags a target state number that doesn't exist among the character's StateDefs", () => {
    const result = validateCommandRow("a", "a", "42", [], [0, 1]);

    expect(result.targetStateError).toBe("No state 42 exists.");
    expect(result.targetState).toBeNull();
  });

  it("accumulates independent errors for name, input, and target state at once", () => {
    const result = validateCommandRow("", "", "42", [], [0]);

    expect(result.nameError).not.toBeNull();
    expect(result.inputError).not.toBeNull();
    expect(result.targetStateError).not.toBeNull();
  });
});

describe("findLinkedStateNumber", () => {
  it("finds the ChangeState controller's target keyed by the command's name", () => {
    const states = [
      stateDef({
        controllers: [
          {
            type: "ChangeState",
            triggers: ['command = "QCF_a"'],
            parameters: { value: "1000" },
          },
        ],
      }),
    ];

    expect(findLinkedStateNumber(states, "QCF_a")).toBe(1000);
  });

  it("returns null when no controller is linked to that command name", () => {
    const states = [
      stateDef({
        controllers: [
          {
            type: "ChangeState",
            triggers: ['command = "OtherCommand"'],
            parameters: { value: "1000" },
          },
        ],
      }),
    ];

    expect(findLinkedStateNumber(states, "QCF_a")).toBeNull();
  });

  it("returns null for an empty states array", () => {
    expect(findLinkedStateNumber([], "QCF_a")).toBeNull();
  });
});

describe("setLinkedState", () => {
  it("creates an implicit always-state when none exists yet", () => {
    const result = setLinkedState([], "QCF_a", 1000);

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(-1);
    expect(result[0].controllers).toHaveLength(1);
    expect(result[0].controllers[0]).toEqual({
      type: "ChangeState",
      triggers: ['command = "QCF_a"'],
      parameters: { value: "1000" },
    });
  });

  it("appends a new ChangeState controller to an existing always-state without touching its other controllers", () => {
    const varSet = {
      type: "VarSet",
      triggers: ["1"],
      parameters: { value: "1" },
    };
    const before = [stateDef({ controllers: [varSet] })];

    const after = setLinkedState(before, "QCF_a", 1000);

    expect(after[0].controllers).toHaveLength(2);
    expect(after[0].controllers[0]).toEqual(varSet);
    expect(after[0].controllers[1].type).toBe("ChangeState");
  });

  it("updates an existing linked controller's target instead of duplicating it", () => {
    const before = [
      stateDef({
        controllers: [
          {
            type: "ChangeState",
            triggers: ['command = "QCF_a"'],
            parameters: { value: "1000" },
          },
        ],
      }),
    ];

    const after = setLinkedState(before, "QCF_a", 2000);

    expect(after[0].controllers).toHaveLength(1);
    expect(after[0].controllers[0].parameters.value).toBe("2000");
  });

  it("removes the linked controller when targetState is null, leaving other controllers untouched", () => {
    const varSet = {
      type: "VarSet",
      triggers: ["1"],
      parameters: { value: "1" },
    };
    const before = [
      stateDef({
        controllers: [
          varSet,
          {
            type: "ChangeState",
            triggers: ['command = "QCF_a"'],
            parameters: { value: "1000" },
          },
        ],
      }),
    ];

    const after = setLinkedState(before, "QCF_a", null);

    expect(after[0].controllers).toEqual([varSet]);
  });

  it("is a no-op when asked to remove a link that doesn't exist", () => {
    const before = [stateDef({ controllers: [] })];

    const after = setLinkedState(before, "QCF_a", null);

    expect(after).toEqual(before);
  });
});
