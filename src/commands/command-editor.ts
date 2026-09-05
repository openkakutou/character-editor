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
  /** Called with the full, updated CommandFile on every committed edit (add/edit/remove). */
  onChange: (commandFile: CommandFile) => void;
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

  const loadCmdFn = options.loadCmd ?? defaultLoadCmd;

  const container = document.createElement("div");
  container.className = "command-editor";

  const heading = document.createElement("h2");
  heading.textContent = "Commands";
  container.appendChild(heading);

  const statusEl = document.createElement("p");
  statusEl.className = "command-editor__status";
  statusEl.hidden = true;
  container.appendChild(statusEl);

  const listEl = document.createElement("div");
  listEl.className = "command-editor__list";
  container.appendChild(listEl);

  const addCommandButton = document.createElement("wuik-button");
  addCommandButton.setAttribute("variant", "secondary");
  addCommandButton.dataset.action = "add-command";
  addCommandButton.textContent = "Add command";
  container.appendChild(addCommandButton);

  root.appendChild(container);

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
      errorEl.hidden = true;
      errorEl.textContent = "";
      return;
    }
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function buildField(
    row: HTMLElement,
    field: string,
    label: string,
    type: "text" | "number",
  ): { input: HTMLInputElement; error: HTMLElement } {
    const wrapper = document.createElement("div");
    wrapper.className = "command-editor__field";

    const inputId = `command-editor-field-${nextFieldId++}`;

    const labelEl = document.createElement("label");
    labelEl.className = "command-editor__label";
    labelEl.htmlFor = inputId;
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);

    const input = document.createElement("input");
    input.type = type;
    input.id = inputId;
    input.className = "command-editor__input";
    input.dataset.field = field;
    wrapper.appendChild(input);

    const error = document.createElement("span");
    error.className = "command-editor__field-error";
    error.dataset.fieldError = field;
    error.hidden = true;
    wrapper.appendChild(error);

    row.appendChild(wrapper);
    return { input, error };
  }

  function buildRow(row: CommandRow): {
    element: HTMLElement;
    refresh: () => void;
  } {
    const rowEl = document.createElement("div");
    rowEl.className = "command-editor__row";
    rowEl.dataset.commandRow = String(row.id);

    const name = buildField(rowEl, "name", "Name", "text");
    name.input.value = row.command.name;

    const input = buildField(rowEl, "input", "Input sequence", "text");
    input.input.value = row.command.input;

    const hint = document.createElement("p");
    hint.className = "command-editor__hint";
    hint.textContent =
      'Stored as-is (e.g. "~D, DF, F, a") -- not validated against MUGEN/Ikemen input syntax.';
    rowEl.appendChild(hint);

    const time = buildField(rowEl, "time", "Time", "number");
    time.input.value = String(row.command.time);

    const bufferTime = buildField(rowEl, "bufferTime", "Buffer time", "number");
    bufferTime.input.value = String(row.command.bufferTime);

    const targetState = buildField(
      rowEl,
      "targetState",
      "Target state",
      "number",
    );
    targetState.input.value = row.targetStateText;

    const removeButton = document.createElement("wuik-button");
    removeButton.setAttribute("variant", "secondary");
    removeButton.dataset.action = "remove-command";
    removeButton.setAttribute(
      "aria-label",
      `Remove command ${row.command.name || "(unnamed)"}`,
    );
    removeButton.textContent = "Remove";
    rowEl.appendChild(removeButton);

    name.input.addEventListener("input", () => {
      row.command = { ...row.command, name: name.input.value };
      onRowEdited();
    });
    name.input.addEventListener("blur", () => {
      row.touched = true;
      onRowEdited();
    });

    input.input.addEventListener("input", () => {
      row.command = { ...row.command, input: input.input.value };
      onRowEdited();
    });
    input.input.addEventListener("blur", () => {
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

    removeButton.addEventListener("click", () => {
      rows = rows.filter((r) => r.id !== row.id);
      if (row.lastLinkedName !== null) {
        commandFile = {
          ...commandFile,
          states: setLinkedState(commandFile.states, row.lastLinkedName, null),
        };
      }
      commitAll();
      renderList();
    });

    function refresh(): void {
      const validation = validateRow(row);
      applyFieldValidity(
        name.input,
        name.error,
        row.touched ? validation.nameError : null,
      );
      applyFieldValidity(
        input.input,
        input.error,
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
      listEl.replaceChildren(emptyState("No commands yet."));
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
    options.onChange(commandFile);
    renderList();
  }

  if (cmdBytes === null) {
    startReady(emptyCommandFile());
    return;
  }

  statusEl.hidden = false;
  statusEl.setAttribute("role", "status");
  statusEl.textContent = "Loading commands…";

  loadCmdFn(cmdBytes, options.bridgeOptions).then((result) => {
    if (result.ok) {
      statusEl.hidden = true;
      startReady(result.commandFile);
      return;
    }
    statusEl.hidden = false;
    statusEl.setAttribute("role", "alert");
    statusEl.textContent = `Could not read the .cmd file: ${result.error}. You can still create new commands below.`;
    startReady(emptyCommandFile());
  });
}
