/**
 * The oldest `@openkakutou/web-ui-kit` release this app can render against:
 * `0.3.0` added the layout shell (`<wuik-app-shell>`, `<wuik-toolbar>`),
 * `0.4.0` added the form components (`<wuik-button>` among them). Below
 * that, a required piece of markup this app relies on simply doesn't exist
 * yet, which would otherwise silently render unstyled/broken.
 */
export const MIN_SUPPORTED_WEB_UI_KIT_VERSION = "0.4.0";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compares `version` against `MIN_SUPPORTED_WEB_UI_KIT_VERSION`. A
 * malformed version string is treated as unsupported rather than thrown —
 * the caller decides how to surface that as a clear, visible error.
 */
export function isWebUiKitVersionSupported(version: string): boolean {
  const actual = parse(version);
  const minimum = parse(MIN_SUPPORTED_WEB_UI_KIT_VERSION);
  if (!actual || !minimum) return false;

  for (let i = 0; i < 3; i++) {
    if (actual[i] > minimum[i]) return true;
    if (actual[i] < minimum[i]) return false;
  }
  return true; // exactly equal
}
