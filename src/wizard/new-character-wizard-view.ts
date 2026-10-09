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
import {
  type ProblemView,
  createProblemView,
} from "../problems/problem-view.ts";
import {
  type Problem,
  detailOf,
  problemSentence,
} from "../problems/problem.ts";
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
  /**
   * Called once per failed creation with the sentence to announce assertively
   * (the error shown in the dialog is plain DOM with no live attribute).
   */
  onFailure?: (message: string) => void;
  /** Builds the character. Defaults to the real `createCharacterFromWizard`; injectable for testing. */
  createCharacter?: (
    name: string,
    template: WizardTemplate,
    options?: CreateCharacterOptions,
  ) => Promise<CharacterInputResult>;
}

/** A failed creation as a problem: the localized message is fixed, the engine's own text is only the detail. */
function failureProblem(detail?: string): Problem {
  return { code: "wizard.createFailed", params: {}, detail };
}

function problemOfResult(result: CharacterInputResult): Problem {
  if (result.status === "bridge-error") return failureProblem(result.message);
  if (result.status === "read-error") {
    return failureProblem(result.error.message);
  }
  return failureProblem();
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

  // A `<wuik-text-input>` (backlog item 013) -- its own internal `<label>`
  // replaces the app's previous manual `<label>` + text-node retranslation
  // trick, since the component's `label` attribute can just be re-set
  // directly on locale change. See
  // .vibe/decisions/019-text-input-migration-to-wuik-text-input.md.
  const nameField = document.createElement("wuik-text-input");
  // Not `data-field="name"`: that attribute is the characteristics editor's
  // own convention for its *loaded character's* Name field elsewhere on
  // this same page -- reusing it here would make `[data-field="name"]`
  // ambiguous between the two unrelated forms.
  nameField.dataset.field = "wizard-name";
  dialogEl.appendChild(nameField);

  // The failure shown inside the dialog: plain DOM with no live attribute,
  // announced once through `options.onFailure`.
  const errorEl = document.createElement("div");
  errorEl.className = "new-character-wizard__error";
  dialogEl.appendChild(errorEl);
  let errorView: ProblemView | null = null;

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
    | { kind: "failure"; problem: Problem };
  let currentError: WizardError | null = null;
  let currentStatus: "creating" | null = null;
  // Bumped by every creation and by Cancel: a creation that finishes after
  // the dialog was cancelled (or replaced by a newer attempt) is ignored.
  let attempt = 0;
  let busy = false;

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
    createButton.textContent = busy
      ? t("wizard.creating", "Creating…")
      : t("wizard.create", "Create");
    nameField.setAttribute("label", t("wizard.nameLabel", "Name"));
  }

  function renderErrorAndStatus(): void {
    if (currentError?.kind !== "failure") {
      errorView = null;
      errorEl.replaceChildren();
    }
    if (currentError === null) {
      nameField.removeAttribute("error");
    } else if (currentError.kind === "required") {
      // Shown inline on the field itself only -- unlike a generic
      // post-submit failure (the other branch, e.g. a bridge error), this
      // one *is* about this specific field, so repeating the identical
      // sentence on the shared line too would just be the same message
      // twice on screen (found by real-browser runtime verification). See
      // .vibe/decisions/019.
      nameField.setAttribute(
        "error",
        t("wizard.nameRequired", "A name is required."),
      );
    } else {
      if (errorView === null) {
        errorView = createProblemView(currentError.problem);
        errorEl.replaceChildren(errorView.element);
      } else {
        errorView.setProblem(currentError.problem);
      }
      nameField.removeAttribute("error");
    }
    statusEl.textContent =
      currentStatus === "creating" ? t("wizard.creating", "Creating…") : "";
  }

  function currentName(): string {
    return nameField.getAttribute("value") ?? "";
  }

  function refreshCreateEnabled(): void {
    if (currentName().trim() === "") {
      createButton.setAttribute("disabled", "");
    } else {
      createButton.removeAttribute("disabled");
    }
  }

  // Busy, not disabled: the button keeps keyboard focus while the character
  // is being built, and a second press is ignored.
  function setBusy(next: boolean): void {
    busy = next;
    if (next) createButton.setAttribute("aria-disabled", "true");
    else createButton.removeAttribute("aria-disabled");
    createButton.textContent = next
      ? t("wizard.creating", "Creating…")
      : t("wizard.create", "Create");
  }

  function resetForm(): void {
    nameField.setAttribute("value", "");
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

  function cancel(): void {
    attempt += 1;
    setBusy(false);
    currentStatus = null;
    renderErrorAndStatus();
    close();
  }

  trigger.addEventListener("click", open);
  cancelButton.addEventListener("click", cancel);

  templateGroup.addEventListener("wuik-change", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    selectedTemplate = value === "basic" ? "basic" : "blank";
  });

  nameField.addEventListener("wuik-input", (event) => {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    nameField.setAttribute("value", value);
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

  // `<wuik-text-input>` exposes no public focus proxy (its shadow root isn't
  // opened with `delegatesFocus`), so a plain `.focus()` would silently do
  // nothing -- reach into its shadow DOM for the real focusable `<input>`
  // instead, guarded the same way this codebase already guards every other
  // `<wuik-*>` method this test environment's unregistered custom elements
  // don't provide. See .vibe/decisions/019.
  function focusNameField(): void {
    (
      nameField.shadowRoot?.querySelector("input") as HTMLInputElement | null
    )?.focus();
  }

  async function handleCreate(): Promise<void> {
    if (busy) return;
    const name = currentName().trim();
    if (name === "") {
      currentError = { kind: "required" };
      renderErrorAndStatus();
      focusNameField();
      return;
    }

    const mine = ++attempt;
    currentError = null;
    currentStatus = "creating";
    setBusy(true);
    renderErrorAndStatus();

    let result: CharacterInputResult;
    try {
      result = await createCharacter(
        name,
        selectedTemplate,
        options.bridgeOptions,
      );
    } catch (error) {
      result = { status: "bridge-error", message: detailOf(error) };
    } finally {
      // Whatever happened, the dialog must never stay stuck on "Creating…".
      if (mine === attempt) {
        setBusy(false);
        currentStatus = null;
      }
    }
    // Cancelled, or superseded, while the character was being built.
    if (mine !== attempt) return;

    if (result.status !== "success") {
      const problem = problemOfResult(result);
      currentError = { kind: "failure", problem };
      renderErrorAndStatus();
      options.onFailure?.(problemSentence(problem));
      errorView?.focus();
      return;
    }

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
