import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../i18n/en.json" with { type: "json" };
import fr from "../i18n/fr.json" with { type: "json" };
import {
  EXTRA_PROBLEM_KEYS,
  PROBLEM_CODES,
  PROBLEM_DEFAULTS,
  type Problem,
  describeProblem,
  detailOf,
  problemSentence,
} from "./problem.ts";

type Catalog = Record<string, unknown>;

function lookup(catalog: Catalog, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === "object"
          ? (node as Catalog)[part]
          : undefined,
      catalog,
    );
}

describe("problem catalogs", () => {
  it("has an English and a French entry for every part of every problem code", () => {
    for (const code of PROBLEM_CODES) {
      const defaults = PROBLEM_DEFAULTS[code];
      for (const part of ["title", "cause", "action"] as const) {
        if (defaults[part] === undefined) continue;
        const key = `errors.${code}.${part}`;
        expect(lookup(en, key), `en ${key}`).toBe(defaults[part]);
        expect(lookup(fr, key), `fr ${key}`).toEqual(expect.any(String));
        expect(lookup(fr, key), `fr ${key}`).not.toBe("");
      }
    }
  });

  it("has both languages for the extra keys and the details labels", () => {
    for (const [key, english] of Object.entries(EXTRA_PROBLEM_KEYS)) {
      expect(lookup(en, key)).toBe(english);
      expect(lookup(fr, key)).toEqual(expect.any(String));
    }
    for (const key of [
      "errors.details.show",
      "errors.details.hide",
      "errors.details.copy",
      "errors.details.copied",
      "errors.label",
    ]) {
      expect(lookup(en, key), key).toEqual(expect.any(String));
      expect(lookup(fr, key), key).toEqual(expect.any(String));
    }
  });
});

describe("describeProblem", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("interpolates the params into title and cause", () => {
    const text = describeProblem({
      code: "format.unsupportedVersion",
      params: { fileName: "kfm.sff", version: "3.0" },
    });
    expect(text.title).toBe("This file version isn't supported");
    expect(text.cause).toBe(
      "kfm.sff uses version 3.0, which this editor can't open.",
    );
  });

  it("uses a caller-provided localized cause instead of the default", () => {
    const text = describeProblem({
      code: "load.failed",
      params: { cause: "This folder is empty." },
    });
    expect(text.cause).toBe("This folder is empty.");
  });

  it("offers Retry wording only for a load failure flagged as retryable", () => {
    const retryable = describeProblem({
      code: "load.failed",
      params: { retry: "1" },
    });
    const permanent = describeProblem({ code: "load.failed", params: {} });
    expect(retryable.action).toBe("Try again or choose another folder.");
    expect(permanent.action).toBe("Choose another folder.");
  });

  it("never uses the raw detail as the message", () => {
    const problem: Problem = {
      code: "unknown",
      params: {},
      detail: "TypeError: x is undefined",
    };
    expect(problemSentence(problem)).not.toContain("TypeError");
  });
});

describe("problemSentence", () => {
  it("joins title, cause and action as sentences", () => {
    expect(
      problemSentence({
        code: "file.unreadable",
        params: { fileName: "kfm.sff" },
      }),
    ).toBe("Couldn't read kfm.sff. The file may be damaged. Replace it.");
  });
});

describe("detailOf", () => {
  it("returns an Error's message and stringifies anything else", () => {
    expect(detailOf(new Error("boom"))).toBe("boom");
    expect(detailOf("plain")).toBe("plain");
    expect(detailOf(42)).toBe("42");
  });
});
