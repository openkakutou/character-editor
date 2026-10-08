import { getI18n, t } from "./i18n.ts";

/**
 * Translates a string that depends on a count. `t()` only accepts string
 * variables, which makes i18next skip its own plural handling, so the plural
 * category is chosen here with `Intl.PluralRules` for the active language and
 * the matching `<key>_one` / `<key>_other` entry is looked up. `{{count}}` is
 * always available to the template.
 */
export function tCount(
  key: string,
  count: number,
  defaults: { one: string; other: string },
  vars: Record<string, string> = {},
): string {
  const language = getI18n()?.resolvedLanguage ?? getI18n()?.language ?? "en";
  const category = new Intl.PluralRules(language).select(count);
  const isOne = category === "one";
  return t(
    `${key}_${isOne ? "one" : "other"}`,
    isOne ? defaults.one : defaults.other,
    { ...vars, count: String(count) },
  );
}
