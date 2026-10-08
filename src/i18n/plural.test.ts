import { afterEach, describe, expect, it } from "vitest";
import { getI18n, initAppI18n } from "./i18n.ts";
import { tCount } from "./plural.ts";

const defaults = { one: "{{count}} error", other: "{{count}} errors" };

describe("tCount", () => {
  afterEach(async () => {
    await getI18n()?.changeLanguage("en");
  });

  it("uses the singular default for one and the plural default otherwise", () => {
    expect(tCount("test.errors", 1, defaults)).toBe("1 error");
    expect(tCount("test.errors", 3, defaults)).toBe("3 errors");
    expect(tCount("test.errors", 0, defaults)).toBe("0 errors");
  });

  it("interpolates extra variables next to the count", () => {
    expect(
      tCount(
        "test.items",
        2,
        { one: "{{n}}: {{count}}", other: "{{n}}: {{count}}s" },
        { n: "x" },
      ),
    ).toBe("x: 2s");
  });

  it("treats 0 as singular in French", async () => {
    await initAppI18n();
    await getI18n()?.changeLanguage("fr");
    expect(new Intl.PluralRules("fr").select(0)).toBe("one");
    expect(tCount("test.errors", 0, defaults)).toBe("0 error");
  });
});
