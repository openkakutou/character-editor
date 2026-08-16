/**
 * `@openkakutou/web-ui-kit` ships no type declarations of its own (its
 * components are registered as side-effecting custom-element definitions).
 * This app is the first OpenKakutou consumer to need a typed named import
 * from it (the package's own exported `version` string, for the
 * version-guard check) rather than a side-effect-only import, so this
 * minimal ambient declaration exists here until the package publishes its
 * own types.
 */
declare module "@openkakutou/web-ui-kit" {
  export const version: string;
}

declare module "@openkakutou/web-ui-kit/tokens.css" {
  // Side-effect-only CSS import — no exports.
}
