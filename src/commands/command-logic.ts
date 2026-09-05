// Pure, DOM-free logic for the command editor (backlog item 008): building
// a blank `CommandFile`, validating one command row, and reading/writing
// the command-to-state link a `Command` needs to actually do anything in a
// real MUGEN/Ikemen GO character. See
// .vibe/decisions/008-command-editor-state-link-and-validation-scope.md for
// why the link is represented as a `ChangeState` controller keyed by the
// command's own name (the same mechanism `character/cmd`'s own doc comments
// describe: "the command-to-state link... flows through cns.Controller's
// existing unevaluated Triggers strings, e.g. `command = "holdback"`"),
// and why an invalid row (blank/duplicate name, blank input, or a target
// state number absent from the character's own StateDefs) is excluded from
// the committed model entirely rather than partially saved.
import type { CommandFile, Controller, StateDef } from "../wasm/types.ts";

/** A brand new `.cmd` file with nothing in it yet — the starting point when no `.cmd` was supplied, or one failed to parse. */
export function emptyCommandFile(): CommandFile {
  return {
    remap: {},
    defaults: { time: 0, bufferTime: 0 },
    commands: [],
    states: [],
  };
}

/** Per-field validation result for one command row. `targetState` is the parsed number (or `null` for "no link"); meaningless when `targetStateError` is set. */
export interface CommandRowValidation {
  nameError: string | null;
  inputError: string | null;
  targetStateError: string | null;
  targetState: number | null;
}

const WHOLE_NUMBER_PATTERN = /^-?\d+$/;

/**
 * Validates one command row's Name/Input/Target-state fields independently
 * — each field gets its own error message so a user can tell which one
 * failed without re-reading the whole row. `otherNames` is every other
 * row's current (untrimmed-caller-trimmed) name, for duplicate detection;
 * `availableStateNumbers` is the character's own StateDef numbers a target
 * state must reference.
 */
export function validateCommandRow(
  name: string,
  input: string,
  targetStateText: string,
  otherNames: readonly string[],
  availableStateNumbers: readonly number[],
): CommandRowValidation {
  const trimmedName = name.trim();
  let nameError: string | null = null;
  if (trimmedName === "") {
    nameError = "Name cannot be empty.";
  } else if (otherNames.includes(trimmedName)) {
    nameError = "Another command already uses this name.";
  }

  const inputError =
    input.trim() === "" ? "Input sequence cannot be empty." : null;

  const trimmedTarget = targetStateText.trim();
  let targetStateError: string | null = null;
  let targetState: number | null = null;
  if (trimmedTarget !== "") {
    if (!WHOLE_NUMBER_PATTERN.test(trimmedTarget)) {
      targetStateError = "Target state must be a whole number.";
    } else {
      const parsed = Number(trimmedTarget);
      if (!availableStateNumbers.includes(parsed)) {
        targetStateError = `No state ${parsed} exists.`;
      } else {
        targetState = parsed;
      }
    }
  }

  return { nameError, inputError, targetStateError, targetState };
}

const CHANGE_STATE_TYPE = "ChangeState";

function commandTrigger(commandName: string): string {
  return `command = "${commandName}"`;
}

function isLinkedController(controller: Controller, trigger: string): boolean {
  return (
    controller.type === CHANGE_STATE_TYPE &&
    controller.triggers.includes(trigger)
  );
}

/**
 * Finds the state number a command currently changes to, by looking for a
 * `ChangeState` controller triggered by `command = "<commandName>"` across
 * every StateDef in `states` (in practice just the `[Statedef -1]` block).
 * Returns `null` when no such controller exists, or its `value` parameter
 * isn't a plain number.
 */
export function findLinkedStateNumber(
  states: readonly StateDef[],
  commandName: string,
): number | null {
  const trigger = commandTrigger(commandName);
  for (const def of states) {
    for (const controller of def.controllers) {
      if (isLinkedController(controller, trigger)) {
        const value = Number(controller.parameters.value);
        return Number.isFinite(value) ? value : null;
      }
    }
  }
  return null;
}

/**
 * Creates, updates, or removes the `ChangeState` controller linking
 * `commandName` to `targetState` (`null` removes the link). Never mutates
 * `states`. Every other controller — including ones this editor didn't
 * create, e.g. a hand-authored `VarSet` — is left exactly as it was.
 */
export function setLinkedState(
  states: readonly StateDef[],
  commandName: string,
  targetState: number | null,
): StateDef[] {
  const trigger = commandTrigger(commandName);
  const hasLink = states.some((def) =>
    def.controllers.some((c) => isLinkedController(c, trigger)),
  );

  if (targetState === null) {
    if (!hasLink) return states as StateDef[];
    return states.map((def) => ({
      ...def,
      controllers: def.controllers.filter(
        (c) => !isLinkedController(c, trigger),
      ),
    }));
  }

  if (hasLink) {
    return states.map((def) => ({
      ...def,
      controllers: def.controllers.map((c) =>
        isLinkedController(c, trigger)
          ? {
              ...c,
              parameters: { ...c.parameters, value: String(targetState) },
            }
          : c,
      ),
    }));
  }

  const newController: Controller = {
    type: CHANGE_STATE_TYPE,
    triggers: [trigger],
    parameters: { value: String(targetState) },
  };

  if (states.length === 0) {
    return [
      {
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
        controllers: [newController],
      },
    ];
  }

  const [first, ...rest] = states;
  return [
    { ...first, controllers: [...first.controllers, newController] },
    ...rest,
  ];
}
