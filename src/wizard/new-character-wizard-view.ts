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
  return "Could not create the character.";
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
  trigger.textContent = "New character";

  const dialogEl = document.createElement("wuik-dialog");
  dialogEl.className = "new-character-wizard__dialog";

  const heading = document.createElement("span");
  heading.slot = "heading";
  heading.textContent = "New Character";
  dialogEl.appendChild(heading);

  const templateGroup = document.createElement("wuik-radio-group");
  templateGroup.className = "new-character-wizard__template";
  templateGroup.setAttribute("label", "Start from");
  templateGroup.setAttribute("value", "blank");

  const blankOption = document.createElement("wuik-radio-option");
  blankOption.setAttribute("value", "blank");
  blankOption.textContent = "Blank — no animations or states yet";

  const basicOption = document.createElement("wuik-radio-option");
  basicOption.setAttribute("value", "basic");
  basicOption.textContent = "Basic template — one starting animation and state";

  templateGroup.append(blankOption, basicOption);
  dialogEl.appendChild(templateGroup);

  const nameLabel = document.createElement("label");
  nameLabel.className = "new-character-wizard__name-label";
  nameLabel.textContent = "Name";
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
  cancelButton.textContent = "Cancel";

  const createButton = document.createElement("wuik-button");
  createButton.setAttribute("variant", "primary");
  createButton.dataset.action = "create-character";
  createButton.textContent = "Create";

  actions.append(cancelButton, createButton);
  dialogEl.appendChild(actions);

  wrapper.append(trigger, dialogEl);
  root.appendChild(wrapper);

  let selectedTemplate: WizardTemplate = "blank";

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
    errorEl.textContent = "";
    statusEl.textContent = "";
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
    errorEl.textContent = "";
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
      errorEl.textContent = "A name is required.";
      return;
    }

    errorEl.textContent = "";
    statusEl.textContent = "Creating…";
    setBusy(true);

    const result = await createCharacter(
      name,
      selectedTemplate,
      options.bridgeOptions,
    );

    setBusy(false);
    if (result.status !== "success") {
      statusEl.textContent = "";
      errorEl.textContent = describeFailure(result);
      return;
    }

    statusEl.textContent = "";
    close();
    options.onCreated(result.character, result.files);
  }
}
