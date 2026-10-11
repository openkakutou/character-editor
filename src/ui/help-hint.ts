// A "?" help hint for a format term (UX flow 003, F22): the kit's
// `wuik-help-hint`, with the text as its content and a label for its button.
export function createHelpHint(label: string, text: string): HTMLElement {
  const hint = document.createElement("wuik-help-hint");
  hint.setAttribute("label", label);
  hint.textContent = text;
  return hint;
}
