// The registry's two session-wide sources (UX flow 002, decision 003) as
// validation issues, so the sidebar badge, the Output list and the banner all
// read the same fact: `load` (files that could not be read at open) and
// `engine` (the engine did not load). A message is the problem's localized
// sentence, recomputed whenever the language changes.
import type { UnreadableFile } from "../input/character-file-input.ts";
import type { ValidationIssue } from "../validation/character-validation.ts";
import { type Problem, problemSentence } from "./problem.ts";
import { SECTION_BY_KIND } from "./replace-file.ts";

export const LOAD_SOURCE = "load";
export const ENGINE_SOURCE = "engine";

export function unreadableProblem(file: UnreadableFile): Problem {
  return {
    code: "file.unreadable",
    params: { fileName: file.fileName },
    detail: file.detail,
  };
}

/**
 * One warning per unreadable file, in the section the file belongs to. A
 * warning rather than an error: the character stays editable and export asks
 * for a confirmation instead of refusing.
 */
export function loadIssues(
  unreadable: readonly UnreadableFile[],
): ValidationIssue[] {
  return unreadable.map((file) => {
    const problem = unreadableProblem(file);
    return {
      id: `${SECTION_BY_KIND[file.kind]}:load:${file.kind}`,
      section: SECTION_BY_KIND[file.kind],
      severity: "warning",
      message: problemSentence(problem),
      problem,
    };
  });
}

/** The engine problem as an error in the Output section, or nothing when it is fine. */
export function engineIssues(problem: Problem | undefined): ValidationIssue[] {
  if (problem === undefined) return [];
  return [
    {
      id: "output:engine:unavailable",
      section: "output",
      severity: "error",
      message: problemSentence(problem),
      problem,
    },
  ];
}
