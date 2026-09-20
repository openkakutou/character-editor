// Read from package.json rather than duplicated as a literal here, so it
// can never drift out of sync with an actual release — see
// src/version.test.ts, which pins that guarantee against package.json
// directly.
import packageJson from "../package.json";

export const appVersion: string = packageJson.version;
