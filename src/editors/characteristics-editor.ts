// Characteristics editor (backlog item 003): a form for a loaded
// character's top-level metadata — the first editing screen in the app.
// Scoped to exactly the scalar/list fields `CharacterData` actually
// exposes, not the backlog item's looser "name, display name, author,
// version" wording — see
// .vibe/decisions/003-characteristics-editor-scope-and-native-inputs.md for
// why, and for why text fields are plain `<input>`s styled with
// `web-ui-kit` tokens rather than a (currently nonexistent) `wuik-input`
// component.
import type { CharacterData } from "../wasm/types.ts";

/** A single-value text field this screen edits, in display order. */
type ScalarField =
  | "name"
  | "author"
  | "spriteFile"
  | "animationFile"
  | "soundFile"
  | "commandFile"
  | "constantsFile";

const IDENTITY_FIELDS: readonly { field: ScalarField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "author", label: "Author" },
];

const FILE_REFERENCE_FIELDS: readonly { field: ScalarField; label: string }[] =
  [
    { field: "spriteFile", label: "Sprite file" },
    { field: "animationFile", label: "Animation file" },
    { field: "soundFile", label: "Sound file" },
    { field: "commandFile", label: "Command file" },
    { field: "constantsFile", label: "Constants file" },
  ];

/** A list field (an array of file-path strings) this screen edits. */
type ListField = "stateFiles" | "palettes";

const LIST_FIELDS: readonly {
  field: ListField;
  label: string;
  singular: string;
}[] = [
  { field: "stateFiles", label: "State files", singular: "state file" },
  { field: "palettes", label: "Palettes", singular: "palette" },
];

const REQUIRED_FIELDS: ReadonlySet<ScalarField> = new Set(["name"]);

export interface CharacteristicsEditorOptions {
  /** Called with a patch to merge into the loaded character on every committed edit. */
  onChange: (patch: Partial<CharacterData>) => void;
}

/**
 * Renders the characteristics editor into `root`, replacing its previous
 * content, pre-filled from `character`. Edits are committed to the caller
 * (via `options.onChange`) immediately: a required field left empty is
 * flagged inline and withheld from the commit instead; a blank list row is
 * excluded from its array once the user leaves it, rather than committed
 * as an empty string.
 */
export function renderCharacteristicsEditor(
  root: HTMLElement,
  character: CharacterData,
  options: CharacteristicsEditorOptions,
): void {
  root.replaceChildren();

  const container = document.createElement("div");
  container.className = "characteristics-editor";

  container.appendChild(
    renderScalarSection("Identity", IDENTITY_FIELDS, character, options),
  );
  container.appendChild(
    renderScalarSection(
      "File references",
      FILE_REFERENCE_FIELDS,
      character,
      options,
    ),
  );
  for (const list of LIST_FIELDS) {
    container.appendChild(
      renderListSection(
        list.field,
        list.label,
        list.singular,
        character,
        options,
      ),
    );
  }

  root.appendChild(container);
}

function renderScalarSection(
  heading: string,
  fields: readonly { field: ScalarField; label: string }[],
  character: CharacterData,
  options: CharacteristicsEditorOptions,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "characteristics-editor__section";

  const title = document.createElement("h2");
  title.textContent = heading;
  section.appendChild(title);

  for (const { field, label } of fields) {
    section.appendChild(
      renderScalarField(field, label, character[field], options),
    );
  }

  return section;
}

function renderScalarField(
  field: ScalarField,
  label: string,
  initialValue: string,
  options: CharacteristicsEditorOptions,
): HTMLElement {
  const required = REQUIRED_FIELDS.has(field);
  const wrapper = document.createElement("div");
  wrapper.className = "characteristics-editor__field";

  const inputId = `characteristics-editor-${field}`;

  const labelEl = document.createElement("label");
  labelEl.className = "characteristics-editor__label";
  labelEl.htmlFor = inputId;
  labelEl.textContent = required ? `${label} *` : label;
  wrapper.appendChild(labelEl);

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.className = "characteristics-editor__input";
  input.dataset.field = field;
  input.value = initialValue;
  if (required) input.setAttribute("aria-required", "true");
  wrapper.appendChild(input);

  const errorEl = document.createElement("span");
  errorEl.className = "characteristics-editor__field-error";
  errorEl.dataset.fieldError = field;
  errorEl.hidden = true;
  wrapper.appendChild(errorEl);

  function setInvalid(message: string | null): void {
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

  input.addEventListener("input", () => {
    if (!required) {
      setInvalid(null);
      options.onChange({ [field]: input.value } as Partial<CharacterData>);
      return;
    }
    const trimmed = input.value.trim();
    if (trimmed === "") {
      setInvalid(`${label} cannot be empty.`);
      return;
    }
    setInvalid(null);
    options.onChange({ [field]: trimmed } as Partial<CharacterData>);
  });

  return wrapper;
}

interface ListRow {
  id: number;
  value: string;
  touched: boolean;
}

function renderListSection(
  field: ListField,
  label: string,
  singular: string,
  character: CharacterData,
  options: CharacteristicsEditorOptions,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "characteristics-editor__section";

  const title = document.createElement("h2");
  title.textContent = label;
  section.appendChild(title);

  const list = document.createElement("div");
  list.className = "characteristics-editor__list";
  list.dataset.list = field;
  section.appendChild(list);

  const addButton = document.createElement("wuik-button");
  addButton.setAttribute("variant", "secondary");
  addButton.dataset.listAdd = field;
  addButton.textContent = `Add ${singular}`;
  section.appendChild(addButton);

  let nextId = 0;
  let rows: ListRow[] = character[field].map((value) => ({
    id: nextId++,
    value,
    touched: true,
  }));

  function commit(): void {
    const committed = rows
      .map((row) => row.value.trim())
      .filter((value) => value !== "");
    options.onChange({ [field]: committed } as Partial<CharacterData>);
  }

  /**
   * Toggles `input`'s own invalid styling in place, based on `row`'s
   * current touched/blank state — never a full `render()`, so blurring or
   * editing one row can never steal focus away by rebuilding the DOM node
   * the user is actively interacting with.
   */
  function applyRowValidity(input: HTMLInputElement, row: ListRow): void {
    const isBlank = row.touched && row.value.trim() === "";
    input.classList.toggle("is-invalid", isBlank);
    if (isBlank) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function render(): void {
    list.replaceChildren(
      ...rows.map((row, index) => {
        const rowEl = document.createElement("div");
        rowEl.className = "characteristics-editor__list-row";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "characteristics-editor__input";
        input.value = row.value;
        applyRowValidity(input, row);

        input.addEventListener("input", () => {
          row.value = input.value;
          commit();
          applyRowValidity(input, row);
        });
        input.addEventListener("blur", () => {
          row.touched = true;
          // Recommit even though this row's own trimmed value hasn't
          // changed: a row left blank on blur must be confirmed excluded
          // from the committed array, not just visually flagged, in case
          // it was added without ever firing its own input event.
          commit();
          applyRowValidity(input, row);
        });

        const removeButton = document.createElement("wuik-button");
        removeButton.setAttribute("variant", "secondary");
        removeButton.dataset.listRemove = field;
        removeButton.setAttribute(
          "aria-label",
          `Remove ${singular} #${index + 1}`,
        );
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
          rows = rows.filter((r) => r.id !== row.id);
          commit();
          render();
        });

        rowEl.append(input, removeButton);
        return rowEl;
      }),
    );
  }

  addButton.addEventListener("click", () => {
    rows = [...rows, { id: nextId++, value: "", touched: false }];
    render();
    const lastInput = list.querySelectorAll("input");
    lastInput[lastInput.length - 1]?.focus();
  });

  render();

  return section;
}
