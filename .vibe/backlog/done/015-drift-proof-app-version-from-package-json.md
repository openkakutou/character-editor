---
status: todo
---
# Drift-Proof App Version From package.json

## Description
`src/version.ts`'s `appVersion` constant is a hardcoded literal duplicating `package.json`'s `version` field. Found stale again during the v0.7.0 release (still read `0.5.0` while `package.json` was already at `0.6.0`, so the app's own UI displayed a stale version). Adopt the drift-proof pattern the sibling `character-viewer-web` app already uses: read `appVersion` directly from `package.json` (via `resolveJsonModule`) instead of duplicating the number.

## Acceptance Criteria
- [ ] `appVersion` is derived from `package.json`'s `version` field, not a separately maintained literal
- [ ] A test pins that `appVersion` matches `package.json`'s `version` field directly (reading the file independently, not through `appVersion` itself), so a future drift is caught by the test suite
- [ ] Existing behavior (the version shown in the toolbar, the document title) is unchanged

## Notes
Reference implementation: `character-viewer-web`'s `src/version.ts` + `src/version.test.ts`. Check whether `resolveJsonModule` is already enabled in `tsconfig.json`; enable it if not. Same drift, same fix, already tracked as its own backlog item in `lifebar-viewer-web` (009) and `lifebar-editor` (010) — this is the `character-editor` instance of it.
