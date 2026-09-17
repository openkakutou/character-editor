// DOM layer for the new-character wizard (backlog item 010): a "New
// character" button next to the file input that opens a `<wuik-dialog>`
// offering a blank template or the "basic" preset, plus a Name field.
// Visibility is driven by the `open` attribute directly (never
// `.showModal()`/`.close()`) so this works identically whether or not the
// real `@openkakutou/web-ui-kit` custom elements are registered -- this
// project's own test environment never registers them (see
// `.vibe/index.md`'s "never assume a `<wuik-*>` element's own methods are
// present" convention), and `<wuik-dialog>`'s own doc comment states `open`
// is its single source of truth regardless of how it's set.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import type {
  CharacterInputResult,
  LoadedFileBytes,
} from "../input/character-file-input.ts";
import type { CharacterData } from "../wasm/types.ts";
import {
  type CreateCharacterOptions,
  type WizardTemplate,
  createCharacterFromWizard,
} from "./new-character-wizard.ts";

export interface NewCharacterWizardOptions {
  /** Called once a character is successfully created -- the same shape `character-file-input-view.ts`'s `onLoaded` uses, so a caller can wire both identically. */
  onCreated: (character: CharacterData, files: LoadedFileBytes) => void;
  /** Forwarded to the default `createCharacterFromWizard`'s own WASM bridge calls; ignored if `createCharacter` is overridden. */
  bridgeOptions?: CreateCharacterOptions;
  /** Builds the character. Defaults to the real `createCharacterFromWizard`; injectable for testing. */
  createCharacter?: (
    name: string,
    template: WizardTemplate,
    options?: CreateCharacterOptions,
  ) => Promise<CharacterInputResult>;
}

function describeFailure(result: CharacterInputResult): string {
  if (result.status === "bridge-error") return result.message;
  if (result.status === "read-error") return result.error.message;
  return t("wizard.genericFailure", "Could not create the character.");
}

/**
 * Renders the wizard trigger button and its dialog into `root`, replacing
 * previous content. The dialog starts closed and resets its own fields
 * (name, template choice, error) every time it is (re)opened, so a
 * cancelled or failed attempt never leaks into the next one.
 */
export function renderNewCharacterWizard(
  root: HTMLElement,
  options: NewCharacterWizardOptions,
): void {
  root.replaceChildren();

  const createCharacter = options.createCharacter ?? createCharacterFromWizard;

  const wrapper = document.createElement("div");
  wrapper.className = "new-character-wizard";

  const trigger = document.createElement("wuik-button");
  trigger.className = "new-character-wizard__trigger";
  trigger.setAttribute("variant", "secondary");
  trigger.dataset.action = "open-wizard";

  const dialogEl = document.createElement("wuik-dialog");
  dialogEl.className = "new-character-wizard__dialog";

  const heading = document.createElement("span");
  heading.slot = "heading";
  dialogEl.appendChild(heading);

  const templateGroup = document.createElement("wuik-radio-group");
  templateGroup.className = "new-character-wizard__template";
  templateGroup.setAttribute("value", "blank");

  const blankOption = document.createElement("wuik-radio-option");
  blankOption.setAttribute("value", "blank");

  const basicOption = document.createElement("wuik-radio-option");
  basicOption.setAttribute("value", "basic");

  templateGroup.append(blankOption, basicOption);
  dialogEl.appendChild(templateGroup);

  const nameLabel = document.createElement("label");
  nameLabel.className = "new-character-wizard__name-label";
  // A text node (not `nameLabel.textContent`) so the label's own visible
  // text can be retranslated in place without wiping out the nested
  // `<input>` appended right after it -- see `renderNameLabel` below.
  const nameLabelText = document.createTextNode("");
  nameLabel.appendChild(nameLabelText);
  const nameField = document.createElement("input");
  nameField.type = "text";
  nameField.className = "new-character-wizard__input";
  // Not `data-field="name"`: that attribute is the characteristics editor's
  // own convention for its *loaded character's* Name field elsewhere on
  // this same page -- reusing it here would make `[data-field="name"]`
  // ambiguous between the two unrelated forms.
  nameField.dataset.field = "wizard-name";
  nameLabel.appendChild(nameField);
  dialogEl.appendChild(nameLabel);

  const errorEl = document.createElement("p");
  errorEl.className = "new-character-wizard__error";
  errorEl.setAttribute("role", "alert");
  dialogEl.appendChild(errorEl);

  const statusEl = document.createElement("p");
  statusEl.className = "new-character-wizard__status";
  statusEl.setAttribute("role", "status");
  dialogEl.appendChild(statusEl);

  const actions = document.createElement("div");
  actions.className = "new-character-wizard__actions";

  const cancelButton = document.createElement("wuik-button");
  cancelButton.setAttribute("variant", "secondary");
  cancelButton.dataset.action = "cancel-wizard";

  const createButton = document.createElement("wuik-button");
  createButton.setAttribute("variant", "primary");
  createButton.dataset.action = "create-character";

  actions.append(cancelButton, createButton);
  dialogEl.appendChild(actions);

  wrapper.append(trigger, dialogEl);
  root.appendChild(wrapper);

  let selectedTemplate: WizardTemplate = "blank";
  // Whatever the error/status lines currently show, kept as a small raw
  // description rather than a pre-formatted string, so a locale change can
  // retranslate them in place without touching the open dialog's other
  // state (the entered name, the selected template). See
  // .vibe/decisions/015-i18n-integration-approach.md.
  type WizardError =
    | { kind: "required" }
    | { kind: "failure"; message: string };
  let currentError: WizardError | null = null;
  let currentStatus: "creating" | null = null;

  function renderStaticText(): void {
    trigger.textContent = t("wizard.trigger", "New character");
    heading.textContent = t("wizard.heading", "New Character");
    templateGroup.setAttribute("label", t("wizard.startFrom", "Start from"));
    blankOption.textContent = t(
      "wizard.blankOption",
      "Blank — no animations or states yet",
    );
    basicOption.textContent = t(
      "wizard.basicOption",
      "Basic template — one starting animation and state",
    );
    cancelButton.textContent = t("wizard.cancel", "Cancel");
    createButton.textContent = t("wizard.create", "Create");
    nameLabelText.textContent = t("wizard.nameLabel", "Name");
  }

  function renderErrorAndStatus(): void {
    errorEl.textContent =
      currentError === null
        ? ""
        : currentError.kind === "required"
          ? t("wizard.nameRequired", "A name is required.")
          : currentError.message;
    statusEl.textContent =
      currentStatus === "creating" ? t("wizard.creating", "Creating…") : "";
  }

  function refreshCreateEnabled(): void {
    if (nameField.value.trim() === "") {
      createButton.setAttribute("disabled", "");
    } else {
      createButton.removeAttribute("disabled");
    }
  }

  function resetForm(): void {
    nameField.value = "";
    templateGroup.setAttribute("value", "blank");
    selectedTemplate = "blank";
    currentError = null;
    currentStatus = null;
    renderErrorAndStatus();
    refreshCreateEnabled();
  }

  function open(): void {
    resetForm();
    dialogEl.toggleAttribute("open", true);
  }

  function close(): void {
    dialogEl.toggleAttribute("open", false);
  }

  function setBusy(busy: boolean): void {
    if (busy) {
      createButton.setAttribute("disabled", "");
      cancelButton.setAttribute("disabled", "");
    } else {
      createButton.removeAttribute("disabled");
      cancelButton.removeAttribute("disabled");
    }
  }

  trigger.addEventListener("click", open);
  cancelButton.addEventListener("click", close);

  templateGroup.addEventListener("wuik-change", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    selectedTemplate = value === "basic" ? "basic" : "blank";
  });

  nameField.addEventListener("input", () => {
    currentError = null;
    renderErrorAndStatus();
    refreshCreateEnabled();
  });

  // Re-validates on click rather than trusting the `disabled` attribute
  // alone -- this project's own convention for a boundary condition (see
  // state-editor.ts's reorder handlers).
  createButton.addEventListener("click", () => {
    void handleCreate();
  });

  async function handleCreate(): Promise<void> {
    const name = nameField.value.trim();
    if (name === "") {
      currentError = { kind: "required" };
      renderErrorAndStatus();
      return;
    }

    currentError = null;
    currentStatus = "creating";
    renderErrorAndStatus();
    setBusy(true);

    const result = await createCharacter(
      name,
      selectedTemplate,
      options.bridgeOptions,
    );

    setBusy(false);
    if (result.status !== "success") {
      currentStatus = null;
      currentError = { kind: "failure", message: describeFailure(result) };
      renderErrorAndStatus();
      return;
    }

    currentStatus = null;
    renderErrorAndStatus();
    close();
    options.onCreated(result.character, result.files);
  }

  // This view is only ever mounted once per app session (see main.ts's
  // renderApp) -- one subscription for its whole lifetime never
  // accumulates. Never touches `dialogEl`'s `open` attribute, the entered
  // name, or the selected template, so an in-progress wizard interaction
  // survives a locale switch untouched. See
  // .vibe/decisions/015-i18n-integration-approach.md.
  onLocaleChange(() => {
    renderStaticText();
    renderErrorAndStatus();
  });

  renderStaticText();
  renderErrorAndStatus();
}
