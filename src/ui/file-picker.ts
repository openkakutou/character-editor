// A localized file picker (UX flow 003, F8): a kit button that opens a hidden
// native input, a status line ("No file chosen" or the file name) and the
// accepted type in plain words -- never the browser's own "Choose file" text.
import { onLocaleChange, t } from "../i18n/i18n.ts";
import { focusKitControl } from "./list-row.ts";

export interface FilePickerOptions {
  /** Value of the native input's `accept` attribute. */
  accept: string;
  /** Class added to the hidden native input (kept for callers and tests). */
  inputClassName?: string;
  /** Visible button text. */
  buttonKey: string;
  buttonDefault: string;
  /** Accepted type said in plain words, e.g. "A PNG or PCX image". */
  typeKey: string;
  typeDefault: string;
}

export interface FilePicker {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  readonly button: HTMLElement;
  /** Re-reads the input and updates the status; call after clearing `input.value`. */
  refresh(): void;
  /** Moves focus to the visible button (the native input is hidden). */
  focus(): void;
  destroy(): void;
}

let pickerCount = 0;

export function createFilePicker(options: FilePickerOptions): FilePicker {
  const element = document.createElement("span");
  element.className = "file-picker";

  const button = document.createElement("wuik-button");
  button.setAttribute("variant", "secondary");
  button.className = "file-picker__button";

  const status = document.createElement("span");
  status.className = "file-picker__status";
  status.setAttribute("role", "status");
  status.id = `file-picker-status-${++pickerCount}`;

  const type = document.createElement("span");
  type.className = "file-picker__type";
  type.id = `file-picker-type-${pickerCount}`;
  button.setAttribute("aria-describedby", `${status.id} ${type.id}`);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = options.accept;
  input.hidden = true;
  input.tabIndex = -1;
  if (options.inputClassName !== undefined) {
    input.className = options.inputClassName;
  }

  function render(): void {
    button.textContent = t(options.buttonKey, options.buttonDefault);
    type.textContent = t(options.typeKey, options.typeDefault);
    const file = input.files?.[0];
    status.textContent =
      file === undefined ? t("filePicker.none", "No file chosen") : file.name;
  }

  button.addEventListener("click", () => input.click());
  input.addEventListener("change", render);
  const stopLocale = onLocaleChange(render);
  element.append(button, status, type, input);
  render();

  return {
    element,
    input,
    button,
    refresh: render,
    focus: () => focusKitControl(button),
    destroy: stopLocale,
  };
}
