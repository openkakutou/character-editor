// The eight editor sections and their four sidebar groups (UX flow 001).
// The order is the task order and is identical everywhere it appears: the
// sidebar, Alt+1…8, the shortcuts help and the section header numbering.

export const SECTION_IDS = [
  "identity",
  "sprites",
  "sounds",
  "palettes",
  "states",
  "commands",
  "animations",
  "output",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type SectionGroupId = "character" | "resources" | "logic" | "output";

export interface SectionGroup {
  id: SectionGroupId;
  sections: readonly SectionId[];
}

export const SECTION_GROUPS: readonly SectionGroup[] = [
  { id: "character", sections: ["identity"] },
  { id: "resources", sections: ["sprites", "sounds", "palettes"] },
  { id: "logic", sections: ["states", "commands", "animations"] },
  { id: "output", sections: ["output"] },
];

/** The 1-based position shown next to a section and used by Alt+digit. */
export function sectionNumber(id: SectionId): number {
  return SECTION_IDS.indexOf(id) + 1;
}

/** The section behind a keyboard digit 1…8, or `undefined` for anything else. */
export function sectionForDigit(digit: number): SectionId | undefined {
  return SECTION_IDS[digit - 1];
}

/** Narrows an arbitrary string (a `wuik-navigate` value, say) to a section id. */
export function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTION_IDS.includes(value as SectionId);
}

/**
 * The digit for a `KeyboardEvent.code` of `Digit1`…`Digit8` or `Numpad1`…
 * `Numpad8`. Read through `code`, not `key`: on AZERTY keyboards `key` with
 * Alt held is not the digit.
 */
export function digitFromKeyCode(code: string): number | undefined {
  const match = /^(?:Digit|Numpad)([1-8])$/.exec(code);
  return match ? Number(match[1]) : undefined;
}
