import { describe, expect, it } from "vitest";
import { getI18n, initAppI18n } from "../i18n/i18n.ts";
import { describeProblem, problemSentence } from "./problem.ts";

describe("problems in French", () => {
  it("translates a code once the locale is switched, and back", async () => {
    await initAppI18n();
    await getI18n()?.changeLanguage("fr");
    const problem = {
      code: "file.unreadable" as const,
      params: { fileName: "kfm.sff" },
    };
    expect(describeProblem(problem).title).toBe("Impossible de lire kfm.sff");
    expect(problemSentence(problem)).toBe(
      "Impossible de lire kfm.sff. Le fichier est peut-être endommagé. Remplacez-le.",
    );
    await getI18n()?.changeLanguage("en");
    expect(describeProblem(problem).title).toBe("Couldn't read kfm.sff");
    window.localStorage.clear();
  });
});
