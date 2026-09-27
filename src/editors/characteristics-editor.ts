// Characteristics editor (backlog item 003): a form for a loaded
// character's top-level metadata -- the first editing screen in the app.
// Scoped to exactly the scalar/list fields `CharacterData` actually
// exposes, not the backlog item's looser "name, display name, author,
// version" wording -- see
// .vibe/decisions/003-characteristics-editor-scope-and-native-inputs.md for
// why. Text fields are `<wuik-text-input>` (backlog item 013, migrating off
// the plain-`<input>` stopgap decision 003 originally chose) -- see
// .vibe/decisions/019-text-input-migration-to-wuik-text-input.md for its
// event/validation contract.
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

  const input = document.createElement("wuik-text-input");
  input.setAttribute("label", label);
  input.setAttribute("value", initialValue);
  input.dataset.field = field;
  if (required) input.setAttribute("required", "");

  function setInvalid(message: string | null): void {
    if (message === null) {
      input.removeAttribute("error");
      return;
    }
    input.setAttribute("error", message);
  }

  // Validates live on every keystroke (`wuik-input`), never gated behind a
  // blur -- matches the field's pre-migration behavior exactly, deliberately
  // not the component's own built-in blur-gated required check, which would
  // both delay the cue and show a different, non-parameterized message. See
  // .vibe/decisions/019.
  input.addEventListener("wuik-input", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    if (!required) {
      setInvalid(null);
      options.onChange({ [field]: value } as Partial<CharacterData>);
      return;
    }
    const trimmed = value.trim();
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

  return input;
}

interface ListRow {
  id: number;
  value: string;
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
  }));

  function commit(): void {
    const committed = rows
      .map((row) => row.value.trim())
      .filter((value) => value !== "");
    options.onChange({ [field]: committed } as Partial<CharacterData>);
  }

  function render(): void {
    list.replaceChildren(
      ...rows.map((row, index) => {
        const rowEl = document.createElement("div");
        rowEl.className = "characteristics-editor__list-row";

        // No `label` attribute (and so no visible label -- see
        // `<wuik-text-input>`'s own source: an empty label hides its whole
        // internal `<label>`, required-marker included), matching this row's
        // pre-migration, deliberately unlabeled design -- the section
        // heading above already names what the list holds. `required` lets
        // the component's own built-in blur-gated message flag a row left
        // blank, in place of this app's previous silent border-only cue.
        const input = document.createElement("wuik-text-input");
        input.setAttribute("required", "");
        input.setAttribute("value", row.value);

        input.addEventListener("wuik-input", (event) => {
          row.value = (event as CustomEvent<{ value: string }>).detail.value;
          commit();
        });
        // `focusout` (composed + bubbling), not `wuik-change` (fires only if
        // the value actually differs from focus-time) -- a row focused and
        // left untouched must still recommit/exclude on leave exactly like
        // an edited one. See .vibe/decisions/019.
        input.addEventListener("focusout", () => {
          commit();
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
    rows = [...rows, { id: nextId++, value: "" }];
    render();
    // `<wuik-text-input>` exposes no public focus proxy (its shadow root
    // isn't opened with `delegatesFocus`), so a plain `.focus()` on the host
    // would silently do nothing -- reach into its shadow DOM for the real
    // focusable `<input>` instead, guarded the same way this codebase
    // already guards every other `<wuik-*>` method this test environment's
    // unregistered custom elements don't provide (see .vibe/index.md).
    const newInputs = list.querySelectorAll("wuik-text-input");
    const lastInput = newInputs[newInputs.length - 1];
    (
      lastInput?.shadowRoot?.querySelector("input") as HTMLInputElement | null
    )?.focus();
  });

  render();

  return section;
}
