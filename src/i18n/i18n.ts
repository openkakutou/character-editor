/**
 * This app's own i18n setup (backlog item 012): wires the shared
 * `web-ui-kit` i18next integration layer (roadmap decision
 * `023-localization-approach-for-web-ui.md`) under this app's own
 * namespace, plus a thin `t()` wrapper mirroring `web-ui-kit`'s own `t()`
 * contract. See `.vibe/decisions/015-i18n-integration-approach.md` for why
 * the fallback path (before `initAppI18n` has ever resolved in this page)
 * must stay a plain `{{var}}` substitution of `defaultValue`, never a real
 * i18next lookup -- that property is what lets the existing test suite
 * keep asserting plain English text without every test file bootstrapping
 * i18n itself. Mirrors `lifebar-editor`'s/`stage-editor`'s own identical
 * `src/i18n/i18n.ts`, the closest sibling apps.
 */
import {
  type I18nInstance,
  type LocaleCatalogs,
  getI18n,
  initI18n,
  onLocaleChange as wuikOnLocaleChange,
} from "@openkakutou/web-ui-kit";
import en from "./en.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };

export { getI18n } from "@openkakutou/web-ui-kit";
export type { I18nInstance } from "@openkakutou/web-ui-kit";

/** This app's own i18next namespace -- must stay unique among every
 * OpenKakutou app sharing `web-ui-kit`'s reserved `"wuik"` namespace. */
export const NAMESPACE = "character-editor";

/**
 * Every OpenKakutou web app is deployed as its own GitHub Pages project
 * site under the same `openkakutou.github.io` origin -- `localStorage` is
 * scoped per-origin, not per-path, so sharing `web-ui-kit`'s default
 * storage key would leak a locale choice made in this app into every other
 * OpenKakutou app on that origin. See `.vibe/decisions/015`.
 */
export const STORAGE_KEY = "character-editor-locale";

const resources: LocaleCatalogs = { en, fr };

/**
 * Initializes this app's i18n. Only ever called once, from `main.ts`'s
 * real bootstrap (`mount()`), awaited before the first `renderApp` call --
 * never from `renderApp` itself, which stays synchronous so tests can keep
 * calling it directly without bootstrapping i18n at all.
 */
export function initAppI18n(): Promise<I18nInstance> {
  return initI18n({
    namespace: NAMESPACE,
    resources,
    storageKey: STORAGE_KEY,
  });
}

export const onLocaleChange = wuikOnLocaleChange;

/**
 * Translates one of this app's own strings, interpolating `{{var}}`
 * placeholders from `vars`. Returns `defaultValue` (interpolated) verbatim
 * -- never a raw i18next key, never blank -- whenever `initAppI18n` hasn't
 * resolved yet in this page (e.g. a test that renders a view directly
 * without bootstrapping i18n). Every call site's `defaultValue` matches its
 * `en.json` entry exactly, so the rendered text is identical either way.
 */
export function t(
  key: string,
  defaultValue: string,
  vars?: Record<string, string>,
): string {
  const instance = getI18n();
  if (instance === undefined || !instance.isInitialized) {
    return interpolate(defaultValue, vars);
  }
  return instance.t(key, { ns: NAMESPACE, defaultValue, ...vars });
}

function interpolate(
  template: string,
  vars: Record<string, string> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? vars[name] : match,
  );
}
