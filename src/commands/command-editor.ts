import { onLocaleChange, t } from "../i18n/i18n.ts";
import { createProblemView } from "../problems/problem-view.ts";
// Command editor (backlog item 008): a structured editor over the parsed
// `.cmd` model — view/edit an existing character's input commands (name,
// input sequence, timing overrides) and optionally map each one to a
// target combat state (from the state editor's own `character.stateDefs`,
// item 007). See
// .vibe/decisions/008-command-editor-state-link-and-validation-scope.md for
// why the mapping is represented as a `ChangeState` controller keyed by the
// command's name, why Name is a required, unique field, and why an invalid
// row (blank/duplicate name, blank input, or an unknown target state) is
// excluded from the committed model entirely rather than partially saved.
//
// `.cmd` isn't wired into `CharacterData` (unlike `.air`/`.cns`), so unlike
// every other editor screen in this app, this one owns its own WASM
// interaction: given the raw `.cmd` bytes captured by the file input (item
// 002), it parses them itself via the injectable `loadCmd` bridge call, the
// same "editor screen owns the WASM call for the raw bytes it's given"
// precedent `palette-editor.ts`/`sprite-browser.ts` already established for
// `resolveSpritePixels`. A missing or unparseable `.cmd` file degrades to a
// visible message plus a blank starting point, never a silent crash or a
// dead end -- the user can still create new commands from scratch.
import { createHelpHint } from "../ui/help-hint.ts";
import { focusKitControl } from "../ui/list-row.ts";
import {
  type LoadCmdResult,
  type WasmBridgeOptions,
  loadCmd as defaultLoadCmd,
} from "../wasm/bridge.ts";
import type { CharacterData, Command, CommandFile } from "../wasm/types.ts";
import {
  emptyCommandFile,
  findLinkedStateNumber,
  setLinkedState,
  validateCommandRow,
} from "./command-logic.ts";

export interface CommandEditorOptions {
  /**
   * Called with the full, updated CommandFile on every committed edit
   * (add/edit/remove), and once more at mount to seed the caller with the
   * freshly parsed `.cmd` file (or an empty one) before any edit -- `isInitialLoad`
   * is `true` only for that one seeding call, `undefined` for every real
   * edit, so a caller that must treat the two differently (e.g. not
   * recording the initial seed as an undoable history entry) can.
   */
  onChange: (commandFile: CommandFile, isInitialLoad?: boolean) => void;
  /** Parses raw `.cmd` bytes. Defaults to the real WASM bridge; injectable for testing. */
  loadCmd?: (
    cmdBytes: Uint8Array,
    options?: WasmBridgeOptions,
  ) => Promise<LoadCmdResult>;
  /** Forwarded to the default loadCmd; ignored if loadCmd is overridden. */
  bridgeOptions?: WasmBridgeOptions;
}

/** One command row's editor-only bookkeeping alongside its Command data. */
interface CommandRow {
  id: number;
  command: Command;
  /** Raw text of the target-state field; blank means "no link". Kept separately from `command` since it isn't part of the `.cmd` command model itself. */
  targetStateText: string;
  /** Whether the user has left (blurred) a required field on this row yet -- gates only the *visual* invalid styling, never whether the row is actually committed. A freshly added row starts false; a loaded one starts true (see .vibe/decisions/008). */
  touched: boolean;
  /** The command name this row's ChangeState controller is currently keyed to in `commandFile.states`, or null if not linked -- tracked so a rename or invalidation can remove the *old* link before applying the new one. */
  lastLinkedName: string | null;
}

function emptyState(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "command-editor__empty";
  el.textContent = text;
  return el;
}

// `main.ts` can call `renderCommandEditor` more than once per page (e.g. the
// new-character wizard replacing an already-loaded character) -- unsubscribed
// at the top of every call, before a fresh one is registered, so a
// locale-change subscription from a previous mount never accumulates. See
// .vibe/decisions/015-i18n-integration-approach.md.
let currentUnsubscribeLocaleChange: (() => void) | undefined;

/**
 * Renders the command editor into `root`, replacing its previous content.
 * `cmdBytes` is the raw `.cmd` file bytes captured at input time (item
 * 002), or `null` when no `.cmd` file was supplied -- both start the editor
 * from a usable, editable state.
 */
export function renderCommandEditor(
  root: HTMLElement,
  character: CharacterData,
  cmdBytes: Uint8Array | null,
  options: CommandEditorOptions,
): void {
  root.replaceChildren();
  currentUnsubscribeLocaleChange?.();
  currentUnsubscribeLocaleChange = undefined;

  const loadCmdFn = options.loadCmd ?? defaultLoadCmd;

  const container = document.createElement("div");
  container.className = "command-editor";

  const heading = document.createElement("h2");

  heading.className = "editor-title";
  heading.textContent = t("commands.heading", "Commands");
  container.appendChild(heading);

  const statusEl = document.createElement("div");
  statusEl.className = "command-editor__status";
  statusEl.hidden = true;
  container.appendChild(statusEl);

  // Persistent polite region: announces removals, which move focus.
  const liveEl = document.createElement("p");
  liveEl.className = "visually-hidden";
  liveEl.setAttribute("aria-live", "polite");
  container.appendChild(liveEl);

  const listEl = document.createElement("div");
  listEl.className = "command-editor__list";
  container.appendChild(listEl);

  const addCommandButton = document.createElement("wuik-button");
  addCommandButton.setAttribute("variant", "secondary");
  addCommandButton.dataset.action = "add-command";
  addCommandButton.textContent = t("commands.addCommand", "Add command");
  container.appendChild(addCommandButton);

  root.appendChild(container);

  // A tagged description of what `statusEl` currently shows (or `null` for
  // "loaded, no status to show" -- see the `startReady` success path) so a
  // locale change can reformat it without re-parsing `.cmd` bytes. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  let currentStatus:
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | null = null;
  function renderStatus(): void {
    if (currentStatus === null) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    if (currentStatus.kind === "loading") {
      statusEl.setAttribute("role", "status");
      statusEl.textContent = t("commands.loadingCommands", "Loading commands…");
    } else {
      statusEl.setAttribute("role", "alert");
      // The parser's own text stays behind "Show details".
      statusEl.replaceChildren(
        createProblemView({
          code: "load.commandFile",
          params: {},
          detail: currentStatus.message,
        }).element,
      );
    }
  }

  let commandFile: CommandFile = emptyCommandFile();
  let rows: CommandRow[] = [];
  let nextId = 0;
  let nextFieldId = 0;
  let rowRefreshers = new Map<number, () => void>();

  function availableStateNumbers(): number[] {
    return character.stateDefs.map((s) => s.number);
  }

  function validateRow(row: CommandRow) {
    const otherNames = rows
      .filter((r) => r.id !== row.id)
      .map((r) => r.command.name.trim());
    return validateCommandRow(
      row.command.name,
      row.command.input,
      row.targetStateText,
      otherNames,
      availableStateNumbers(),
    );
  }

  /**
   * Recomputes `commandFile.commands`/`states` from every row and reports
   * it via `onChange`. Every row's state link is removed and re-applied
   * from scratch on every commit (not patched incrementally) so a rename,
   * a newly broken row, or a cleared target state can never leave a stale
   * link behind under a name nothing points to anymore.
   */
  function commitAll(): void {
    let states = commandFile.states;
    for (const row of rows) {
      if (row.lastLinkedName !== null) {
        states = setLinkedState(states, row.lastLinkedName, null);
        row.lastLinkedName = null;
      }
    }
    const commands: Command[] = [];
    for (const row of rows) {
      const validation = validateRow(row);
      if (
        validation.nameError !== null ||
        validation.inputError !== null ||
        validation.targetStateError !== null
      ) {
        continue;
      }
      const name = row.command.name.trim();
      commands.push({ ...row.command, name });
      if (validation.targetState !== null) {
        states = setLinkedState(states, name, validation.targetState);
        row.lastLinkedName = name;
      }
    }
    commandFile = { ...commandFile, commands, states };
    options.onChange(commandFile);
  }

  function refreshAllRows(): void {
    for (const refresh of rowRefreshers.values()) refresh();
  }

  function onRowEdited(): void {
    commitAll();
    refreshAllRows();
  }

  function applyFieldValidity(
    input: HTMLInputElement,
    errorEl: HTMLElement,
    message: string | null,
  ): void {
    if (message === null) {
      input.classList.remove("is-invalid");
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      errorEl.hidden = true;
      errorEl.removeAttribute("role");
      errorEl.textContent = "";
      return;
    }
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", errorEl.id);
    errorEl.hidden = false;
    errorEl.setAttribute("role", "alert");
    errorEl.textContent = message;
  }

  function buildField(
    row: HTMLElement,
    field: string,
    label: string,
    type: "number",
    help?: { label: string; text: string },
  ): { input: HTMLInputElement; error: HTMLElement } {
    const wrapper = document.createElement("div");
    wrapper.className = "command-editor__field";

    const inputId = `command-editor-field-${nextFieldId++}`;

    const labelEl = document.createElement("label");
    labelEl.className = "command-editor__label";
    labelEl.htmlFor = inputId;
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);
    if (help !== undefined) {
      wrapper.appendChild(createHelpHint(help.label, help.text));
    }

    const input = document.createElement("input");
    input.type = type;
    input.id = inputId;
    input.className = "field-number";
    input.dataset.field = field;
    wrapper.appendChild(input);

    const error = document.createElement("span");
    error.className = "command-editor__field-error";
    error.dataset.fieldError = field;
    error.id = `${inputId}-error`;
    error.hidden = true;
    wrapper.appendChild(error);

    row.appendChild(wrapper);
    return { input, error };
  }

  /**
   * Builds a `<wuik-text-input>` (backlog item 013) for a Name/Input-sequence
   * field -- both are always required. Unlike `buildField` above, this owns
   * no separate `<label>`/error `<span>`: the component renders its own
   * label and, once `error` is set, its own invalid-state cue and message
   * text internally. See
   * .vibe/decisions/019-text-input-migration-to-wuik-text-input.md.
   */
  function buildTextField(
    row: HTMLElement,
    field: string,
    label: string,
  ): HTMLElement {
    const input = document.createElement("wuik-text-input");
    input.setAttribute("label", label);
    input.setAttribute("required", "");
    input.dataset.field = field;
    row.appendChild(input);
    return input;
  }

  function applyTextFieldValidity(
    input: HTMLElement,
    message: string | null,
  ): void {
    if (message === null) {
      input.removeAttribute("error");
      return;
    }
    input.setAttribute("error", message);
  }

  function focusField(field: HTMLElement): void {
    const inner = field.shadowRoot?.querySelector("input");
    if (inner) inner.focus();
    else field.focus();
  }

  function buildRow(row: CommandRow): {
    element: HTMLElement;
    refresh: () => void;
  } {
    const rowEl = document.createElement("wuik-panel");
    rowEl.className = "command-editor__row";
    rowEl.dataset.commandRow = String(row.id);

    const nameInput = buildTextField(
      rowEl,
      "name",
      t("commands.nameLabel", "Name"),
    );
    nameInput.setAttribute("value", row.command.name);

    const inputInput = buildTextField(
      rowEl,
      "input",
      t("commands.inputSequenceLabel", "Input sequence"),
    );
    inputInput.setAttribute("value", row.command.input);

    const hint = document.createElement("p");
    hint.className = "command-editor__hint";
    hint.textContent = t(
      "commands.inputHint",
      'Written exactly as typed, for example "~D, DF, F, a". The editor does not check it against the MUGEN/Ikemen input syntax.',
    );
    rowEl.appendChild(hint);

    const time = buildField(
      rowEl,
      "time",
      t("commands.timeLabel", "Sequence window (ticks)"),
      "number",
      {
        label: t("commands.timeHelpLabel", "Help: sequence window"),
        text: t(
          "commands.timeHelp",
          "Number of ticks within which the whole sequence must be entered. 1 tick = 1/60 s.",
        ),
      },
    );
    time.input.value = String(row.command.time);

    const bufferTime = buildField(
      rowEl,
      "bufferTime",
      t("commands.bufferTimeLabel", "Command buffer (ticks)"),
      "number",
      {
        label: t("commands.bufferTimeHelpLabel", "Help: command input delay"),
        text: t(
          "commands.bufferTimeHelp",
          "Number of ticks a command stays active once entered, so that a slightly early press still counts. 1 tick = 1/60 s.",
        ),
      },
    );
    bufferTime.input.value = String(row.command.bufferTime);

    const targetState = buildField(
      rowEl,
      "targetState",
      t("commands.targetStateLabel", "Target state"),
      "number",
    );
    targetState.input.value = row.targetStateText;

    const removeButton = document.createElement("wuik-button");
    removeButton.setAttribute("variant", "secondary");
    removeButton.dataset.action = "remove-command";
    removeButton.setAttribute(
      "aria-label",
      t("commands.removeCommandAriaLabel", "Remove command {{name}}", {
        name: row.command.name || t("commands.unnamed", "(unnamed)"),
      }),
    );
    removeButton.textContent = t("commands.remove", "Remove");
    rowEl.appendChild(removeButton);

    nameInput.addEventListener("wuik-input", (event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value;
      row.command = { ...row.command, name: value };
      onRowEdited();
    });
    // `focusout` (composed + bubbling), not `wuik-change` (fires only if the
    // value actually differs from focus-time) -- a row focused and left
    // untouched must still reveal its "required" state on leave exactly
    // like an edited one did via the old native `blur`. See
    // .vibe/decisions/019.
    nameInput.addEventListener("focusout", () => {
      row.touched = true;
      onRowEdited();
    });

    inputInput.addEventListener("wuik-input", (event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value;
      row.command = { ...row.command, input: value };
      onRowEdited();
    });
    inputInput.addEventListener("focusout", () => {
      row.touched = true;
      onRowEdited();
    });

    time.input.addEventListener("blur", () => {
      const parsed = Number.parseInt(time.input.value, 10);
      row.command = {
        ...row.command,
        time: Number.isInteger(parsed) ? parsed : row.command.time,
      };
      time.input.value = String(row.command.time);
      onRowEdited();
    });

    bufferTime.input.addEventListener("blur", () => {
      const parsed = Number.parseInt(bufferTime.input.value, 10);
      row.command = {
        ...row.command,
        bufferTime: Number.isInteger(parsed) ? parsed : row.command.bufferTime,
      };
      bufferTime.input.value = String(row.command.bufferTime);
      onRowEdited();
    });

    targetState.input.addEventListener("input", () => {
      row.targetStateText = targetState.input.value;
      onRowEdited();
    });
    targetState.input.addEventListener("blur", () => {
      onRowEdited();
    });

    // "Submit": Enter in a field of this row reveals every error and moves
    // focus to the first invalid field. The kit's text inputs announce their
    // own error, so no live attribute is added here (announce once).
    rowEl.addEventListener("keydown", (event) => {
      // Only a text or number field submits; a button keeps Enter for itself.
      const target = event.target as HTMLElement | null;
      const isField =
        target === nameInput ||
        target === inputInput ||
        (target instanceof HTMLInputElement &&
          (target.type === "text" || target.type === "number"));
      if (event.key !== "Enter" || !isField) return;
      const validation = validateRow(row);
      const firstInvalid: HTMLElement | null =
        validation.nameError !== null
          ? nameInput
          : validation.inputError !== null
            ? inputInput
            : validation.targetStateError !== null
              ? targetState.input
              : null;
      if (firstInvalid === null) return;
      event.preventDefault();
      row.touched = true;
      refresh();
      focusField(firstInvalid);
    });

    removeButton.addEventListener("click", () => {
      const index = rows.findIndex((r) => r.id === row.id);
      const removedName = row.command.name;
      rows = rows.filter((r) => r.id !== row.id);
      if (row.lastLinkedName !== null) {
        commandFile = {
          ...commandFile,
          states: setLinkedState(commandFile.states, row.lastLinkedName, null),
        };
      }
      commitAll();
      renderList();
      const neighbour = rows[Math.min(index, rows.length - 1)];
      const nextField =
        neighbour === undefined
          ? null
          : listEl.querySelector<HTMLElement>(
              `[data-command-row="${neighbour.id}"] [data-field="name"]`,
            );
      if (nextField) focusField(nextField);
      else focusKitControl(addCommandButton);
      liveEl.textContent = t("commands.removed", "Command removed: {{name}}", {
        name: removedName || t("commands.unnamed", "(unnamed)"),
      });
    });

    function refresh(): void {
      const validation = validateRow(row);
      applyTextFieldValidity(
        nameInput,
        row.touched ? validation.nameError : null,
      );
      applyTextFieldValidity(
        inputInput,
        row.touched ? validation.inputError : null,
      );
      // Target state has no "touched" gate: a blank value is always a
      // valid, deliberate "no link" choice, never an unflagged draft.
      applyFieldValidity(
        targetState.input,
        targetState.error,
        validation.targetStateError,
      );
    }

    refresh();
    return { element: rowEl, refresh };
  }

  function renderList(): void {
    rowRefreshers = new Map();
    if (rows.length === 0) {
      listEl.replaceChildren(
        emptyState(t("commands.noCommandsYet", "No commands yet.")),
      );
      return;
    }
    listEl.replaceChildren(
      ...rows.map((row) => {
        const { element, refresh } = buildRow(row);
        rowRefreshers.set(row.id, refresh);
        return element;
      }),
    );
  }

  addCommandButton.addEventListener("click", () => {
    rows = [
      ...rows,
      {
        id: nextId++,
        command: { name: "", input: "", time: 0, bufferTime: 0 },
        targetStateText: "",
        touched: false,
        lastLinkedName: null,
      },
    ];
    renderList();
  });

  function startReady(initial: CommandFile): void {
    commandFile = initial;
    rows = initial.commands.map((command) => {
      const linked = findLinkedStateNumber(initial.states, command.name);
      return {
        id: nextId++,
        command,
        targetStateText: linked === null ? "" : String(linked),
        // Loaded rows reflect already-existing data: a blank/duplicate
        // name or empty input in the source file should show as invalid
        // immediately, unlike a row the user just added.
        touched: true,
        lastLinkedName: linked === null ? null : command.name,
      };
    });
    // Hands the parsed data to the caller as-is, before any edit, so the
    // shared document reflects the loaded commands right away rather than
    // staying at its empty placeholder until the user touches something.
    // `isInitialLoad: true` tells the caller this is that one-time seed,
    // not a user edit -- see this option's own doc comment.
    options.onChange(commandFile, true);
    renderList();
  }

  // This screen is only ever mounted once per loaded character (see
  // main.ts's `mountCommandEditor`) -- unsubscribed at the top of every
  // call above, so a locale-change subscription from a previous mount
  // never accumulates. Retranslates the heading/add-button/status in place
  // and every row's own already-shown validation messages, never
  // re-parsing the `.cmd` bytes or resetting a row's data.
  currentUnsubscribeLocaleChange = onLocaleChange(() => {
    heading.textContent = t("commands.heading", "Commands");
    addCommandButton.textContent = t("commands.addCommand", "Add command");
    renderStatus();
    renderList();
  });

  if (cmdBytes === null) {
    startReady(emptyCommandFile());
    return;
  }

  currentStatus = { kind: "loading" };
  renderStatus();

  loadCmdFn(cmdBytes, options.bridgeOptions).then((result) => {
    if (result.ok) {
      currentStatus = null;
      renderStatus();
      startReady(result.commandFile);
      return;
    }
    currentStatus = { kind: "error", message: result.error };
    renderStatus();
    startReady(emptyCommandFile());
  });
}
