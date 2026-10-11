// A kit list row (UX flow 003, F11): `wuik-list-row` is a real button with
// hover, focus-visible and selected states; as a disclosure it mirrors its
// `expanded` attribute as `aria-expanded` on its inner button. The caller
// keeps its own state and sets `expanded` from its click handler.
export interface ListRowOptions {
  className?: string;
  text: string;
  /** A disclosure row: a click toggles `expanded`. */
  expandable?: boolean;
  expanded?: boolean;
  /** The current row of a selection (`aria-current`). */
  selected?: boolean;
  /** Stays focusable (a kit `disabled` row drops out of the tab order) but ignores activation; the caller guards its click. */
  unavailable?: boolean;
}

export function createListRow(options: ListRowOptions): HTMLElement {
  const row = document.createElement("wuik-list-row");
  if (options.className !== undefined) row.className = options.className;
  row.textContent = options.text;
  if (options.expandable) row.setAttribute("expandable", "");
  if (options.expandable && options.expanded) row.setAttribute("expanded", "");
  if (options.selected) row.setAttribute("selected", "");
  if (options.unavailable) row.setAttribute("aria-disabled", "true");
  return row;
}

/**
 * Focuses the real control of a kit element: the kit parts keep it in a shadow
 * root with no focus delegation, so `focus()` on the host does nothing.
 */
export function focusKitControl(element: HTMLElement): void {
  const inner = element.shadowRoot?.querySelector<HTMLElement>(
    "button, input, select",
  );
  (inner ?? element).focus();
}
