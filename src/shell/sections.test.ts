import { describe, expect, it } from "vitest";
import {
  SECTION_GROUPS,
  SECTION_IDS,
  digitFromKeyCode,
  isSectionId,
  sectionForDigit,
  sectionNumber,
} from "./sections.ts";

describe("sections", () => {
  it("lists eight sections in task order", () => {
    expect(SECTION_IDS).toEqual([
      "identity",
      "sprites",
      "sounds",
      "palettes",
      "states",
      "commands",
      "animations",
      "output",
    ]);
  });

  it("groups every section exactly once, following the same order", () => {
    const grouped = SECTION_GROUPS.flatMap((group) => group.sections);
    expect(grouped).toEqual([...SECTION_IDS]);
  });

  it("numbers sections from 1 and maps digits back to sections", () => {
    expect(sectionNumber("identity")).toBe(1);
    expect(sectionNumber("output")).toBe(8);
    expect(sectionForDigit(5)).toBe("states");
  });

  it("returns undefined for a digit outside 1…8", () => {
    expect(sectionForDigit(0)).toBeUndefined();
    expect(sectionForDigit(9)).toBeUndefined();
  });

  it("recognises only real section ids", () => {
    expect(isSectionId("palettes")).toBe(true);
    expect(isSectionId("nope")).toBe(false);
    expect(isSectionId(null)).toBe(false);
  });

  it("reads digits from Digit and Numpad key codes, ignoring others", () => {
    expect(digitFromKeyCode("Digit3")).toBe(3);
    expect(digitFromKeyCode("Numpad8")).toBe(8);
    expect(digitFromKeyCode("Digit9")).toBeUndefined();
    expect(digitFromKeyCode("KeyA")).toBeUndefined();
  });
});
