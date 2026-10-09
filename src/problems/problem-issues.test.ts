import { describe, expect, it } from "vitest";
import { actionIssues, engineIssues, loadIssues } from "./problem-issues.ts";

describe("loadIssues", () => {
  it("makes one warning per unreadable file, in the section it belongs to", () => {
    const issues = loadIssues([
      { kind: "sff", fileName: "kfm.sff", detail: "denied" },
      { kind: "snd", fileName: "kfm.snd", detail: "denied" },
    ]);
    expect(issues.map((issue) => [issue.section, issue.severity])).toEqual([
      ["sprites", "warning"],
      ["sounds", "warning"],
    ]);
    expect(issues[0].message).toBe(
      "Couldn't read kfm.sff. The file may be damaged. Replace it.",
    );
    expect(issues[0].problem?.detail).toBe("denied");
    expect(new Set(issues.map((issue) => issue.id)).size).toBe(2);
  });

  it("is empty when every file was readable", () => {
    expect(loadIssues([])).toEqual([]);
  });
});

describe("engineIssues", () => {
  it("is an error in the Output section while the engine is down", () => {
    const [issue] = engineIssues({ code: "engine.loadFailed", params: {} });
    expect(issue.section).toBe("output");
    expect(issue.severity).toBe("error");
    expect(issue.message).toContain("The editor engine didn't load");
  });

  it("is empty when the engine is fine", () => {
    expect(engineIssues(undefined)).toEqual([]);
  });
});

describe("actionIssues", () => {
  it("makes one warning per failed action, in the section it happened in", () => {
    const issues = actionIssues([
      {
        section: "sprites",
        key: "import",
        problem: { code: "import.image", params: {}, detail: "x" },
      },
      {
        section: "palettes",
        key: "upload",
        problem: { code: "import.palette", params: {} },
      },
    ]);
    expect(
      issues.map((issue) => [issue.id, issue.section, issue.severity]),
    ).toEqual([
      ["sprites:action:import", "sprites", "warning"],
      ["palettes:action:upload", "palettes", "warning"],
    ]);
    expect(issues[0].message).toContain("Couldn't import this sprite");
  });

  it("is empty when no action failed", () => {
    expect(actionIssues([])).toEqual([]);
  });
});
