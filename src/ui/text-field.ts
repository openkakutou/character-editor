// A labelled kit text field that commits when it loses focus (UX flow 003,
// F10): `wuik-text-input` reports each keystroke as `wuik-input`; the value
// is kept here and committed on `focusout`, which crosses the shadow boundary
// where `blur` does not.
export interface TextFieldOptions {
  label: string;
  value: string;
  /** Called on focus leave with the latest value. */
  onCommit: (value: string) => void;
}

export function createTextField(options: TextFieldOptions): HTMLElement {
  const field = document.createElement("wuik-text-input");
  field.setAttribute("label", options.label);
  field.setAttribute("value", options.value);
  let current = options.value;
  field.addEventListener("wuik-input", (event) => {
    current = (event as CustomEvent<{ value: string }>).detail.value;
  });
  field.addEventListener("focusout", () => options.onCommit(current));
  return field;
}
