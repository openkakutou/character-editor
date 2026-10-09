// A problem is a typed code plus parameters, localized when it is rendered
// (UX flow 002, decision 003): a language switch re-renders it, and the raw
// technical text of an exception never becomes the message -- it is kept
// apart as `detail`, shown only behind "Show details".
import { t } from "../i18n/i18n.ts";

export const PROBLEM_CODES = [
  "file.unreadable",
  "load.partial",
  "load.failed",
  "format.unsupportedVersion",
  "import.image",
  "import.sprite",
  "import.palette",
  "import.sound",
  "preview.failed",
  "wizard.createFailed",
  "engine.loadFailed",
  "export.failed",
  "export.fileFailed",
  "unknown",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

export interface Problem {
  code: ProblemCode;
  /** Values interpolated into the localized text (file name, version…). */
  params: Record<string, string>;
  /** Raw technical text (English, from the engine or the browser). Never the main message. */
  detail?: string;
}

export interface ProblemText {
  title: string;
  cause?: string;
  action?: string;
}

interface ProblemDefaults {
  title: string;
  cause?: string;
  action?: string;
}

/**
 * English texts, character for character those of `en.json`: they are the
 * fallback before i18n resolves, and a test pins both catalogs to this table.
 */
export const PROBLEM_DEFAULTS: Record<ProblemCode, ProblemDefaults> = {
  "file.unreadable": {
    title: "Couldn't read {{fileName}}",
    cause: "The file may be damaged.",
    action: "Replace it.",
  },
  "load.partial": {
    title: "Opened with unreadable files",
    action: "Replace them to export a complete character.",
  },
  "load.failed": {
    title: "Couldn't open this folder",
    action: "Choose another folder.",
  },
  "format.unsupportedVersion": {
    title: "This file version isn't supported",
    cause:
      "{{fileName}} uses version {{version}}, which this editor can't open.",
    action: "Export it from a supported version or choose another file.",
  },
  "import.image": {
    title: "Couldn't import this sprite",
    cause: "The image can't be decoded.",
    action: "Choose a PNG or PCX file.",
  },
  "import.sprite": {
    title: "Couldn't import this sprite",
    cause: "The sprite sheet rejected this image.",
    action: "Check the image and try again.",
  },
  "import.palette": {
    title: "Couldn't import this palette",
    cause: "The palette file can't be read.",
    action: "Choose an .act palette file.",
  },
  "import.sound": {
    title: "Couldn't import this sound",
    cause: "The sound file can't be read.",
    action: "Choose a WAV file.",
  },
  "preview.failed": {
    title: "Preview unavailable for this sprite",
    action: "Replace the image or delete the sprite.",
  },
  "wizard.createFailed": {
    title: "Couldn't create the character",
    action:
      "Your entries are kept. Select Create to try again, or cancel to go back.",
  },
  "engine.loadFailed": {
    title: "The editor engine didn't load",
    action: "Check your connection, then retry.",
  },
  "export.failed": {
    title: "The export didn't finish",
    action: "Try again, and check the problems listed in the Export section.",
  },
  "export.fileFailed": {
    title: "The export is blocked",
    cause: "{{fileName}} could not be saved.",
    action: "Check the problems listed in the Export section, then try again.",
  },
  unknown: {
    title: "Something went wrong",
    action: "Try again. If it keeps happening, copy the details.",
  },
};

/** Alternative action for a load failure that retrying can fix. */
const LOAD_FAILED_RETRY_ACTION = "Try again or choose another folder.";

export function describeProblem(problem: Problem): ProblemText {
  const defaults = PROBLEM_DEFAULTS[problem.code];
  const key = `errors.${problem.code}`;
  const text: ProblemText = {
    title: t(`${key}.title`, defaults.title, problem.params),
  };
  const cause =
    problem.params.cause !== undefined
      ? problem.params.cause
      : defaults.cause === undefined
        ? undefined
        : t(`${key}.cause`, defaults.cause, problem.params);
  if (cause !== undefined) text.cause = cause;
  if (problem.code === "load.failed" && problem.params.retry === "1") {
    text.action = t(
      `${key}.actionRetry`,
      LOAD_FAILED_RETRY_ACTION,
      problem.params,
    );
  } else if (defaults.action !== undefined) {
    text.action = t(`${key}.action`, defaults.action, problem.params);
  }
  return text;
}

/** One sentence for a status line or an announcement: title, cause and action. */
export function problemSentence(problem: Problem): string {
  const { title, cause, action } = describeProblem(problem);
  return [title, cause, action]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => (/[.!?…]$/.test(part) ? part : `${part}.`))
    .join(" ");
}

/** English-only keys the catalogs need beyond `PROBLEM_DEFAULTS`. */
export const EXTRA_PROBLEM_KEYS: Readonly<Record<string, string>> = {
  "errors.load.failed.actionRetry": LOAD_FAILED_RETRY_ACTION,
};

/** Wraps anything thrown or rejected into a printable technical detail. */
export function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
