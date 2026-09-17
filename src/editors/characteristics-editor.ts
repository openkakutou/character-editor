// Characteristics editor (backlog item 003): a form for a loaded
// character's top-level metadata — the first editing screen in the app.
// Scoped to exactly the scalar/list fields `CharacterData` actually
// exposes, not the backlog item's looser "name, display name, author,
// version" wording — see
// .vibe/decisions/003-characteristics-editor-scope-and-native-inputs.md for
// why, and for why text fields are plain `<input>`s styled with
// `web-ui-kit` tokens rather than a (currently nonexistent) `wuik-input`
// component.
import { t } from "../i18n/i18n.ts";
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

interface ScalarFieldSpec {
  field: ScalarField;
  labelKey: string;
  labelDefault: string;
}

const IDENTITY_FIELDS: readonly ScalarFieldSpec[] = [
  {
    field: "name",
    labelKey: "characteristics.nameLabel",
    labelDefault: "Name",
  },
  {
    field: "author",
    labelKey: "characteristics.authorLabel",
    labelDefault: "Author",
  },
];

const FILE_REFERENCE_FIELDS: readonly ScalarFieldSpec[] = [
  {
    field: "spriteFile",
    labelKey: "characteristics.spriteFileLabel",
    labelDefault: "Sprite file",
  },
  {
    field: "animationFile",
    labelKey: "characteristics.animationFileLabel",
    labelDefault: "Animation file",
  },
  {
    field: "soundFile",
    labelKey: "characteristics.soundFileLabel",
    labelDefault: "Sound file",
  },
  {
    field: "commandFile",
    labelKey: "characteristics.commandFileLabel",
    labelDefault: "Command file",
  },
  {
    field: "constantsFile",
    labelKey: "characteristics.constantsFileLabel",
    labelDefault: "Constants file",
  },
];

/** A list field (an array of file-path strings) this screen edits. */
type ListField = "stateFiles" | "palettes";

interface ListFieldSpec {
  field: ListField;
  labelKey: string;
  labelDefault: string;
  singularKey: string;
  singularDefault: string;
}

const LIST_FIELDS: readonly ListFieldSpec[] = [
  {
    field: "stateFiles",
    labelKey: "characteristics.stateFilesLabel",
    labelDefault: "State files",
    singularKey: "characteristics.stateFileSingular",
    singularDefault: "state file",
  },
  {
    field: "palettes",
    labelKey: "characteristics.palettesLabel",
    labelDefault: "Palettes",
    singularKey: "characteristics.paletteSingular",
    singularDefault: "palette",
  },
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
    renderScalarSection(
      t("characteristics.identityHeading", "Identity"),
      IDENTITY_FIELDS,
      character,
      options,
    ),
  );
  container.appendChild(
    renderScalarSection(
      t("characteristics.fileReferencesHeading", "File references"),
      FILE_REFERENCE_FIELDS,
      character,
      options,
    ),
  );
  for (const list of LIST_FIELDS) {
    container.appendChild(
      renderListSection(
        list.field,
        t(list.labelKey, list.labelDefault),
        t(list.singularKey, list.singularDefault),
        character,
        options,
      ),
    );
  }

  root.appendChild(container);
}

function renderScalarSection(
  heading: string,
  fields: readonly ScalarFieldSpec[],
  character: CharacterData,
  options: CharacteristicsEditorOptions,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "characteristics-editor__section";

  const title = document.createElement("h2");
  title.textContent = heading;
  section.appendChild(title);

  for (const { field, labelKey, labelDefault } of fields) {
    section.appendChild(
      renderScalarField(
        field,
        t(labelKey, labelDefault),
        character[field],
        options,
      ),
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
  labelEl.textContent = required
    ? t("characteristics.requiredSuffix", "{{label}} *", { label })
    : label;
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
      setInvalid(
        t("characteristics.cannotBeEmpty", "{{label}} cannot be empty.", {
          label,
        }),
      );
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
  addButton.textContent = t("characteristics.addButton", "Add {{singular}}", {
    singular,
  });
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
          t(
            "characteristics.removeAriaLabel",
            "Remove {{singular}} #{{index}}",
            { singular, index: String(index + 1) },
          ),
        );
        removeButton.textContent = t("characteristics.removeButton", "Remove");
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
