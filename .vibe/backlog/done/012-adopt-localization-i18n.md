---
status: done
---
# Adopt Localization (i18n)

## Description
Extract this app's hardcoded English UI strings into namespaced message catalogs (`src/i18n/en.json`, `src/i18n/fr.json`) and wire up `web-ui-kit`'s shared i18next integration layer, adding a `<wuik-locale-switcher>` to the app shell so the user can switch language. See roadmap decision `023-localization-approach-for-web-ui.md` for the shared approach.

## Acceptance Criteria
- [x] All user-facing UI strings are moved out of source code into `src/i18n/en.json` and `src/i18n/fr.json`
- [x] The app initializes `web-ui-kit`'s shared i18next configuration under its own namespace
- [x] A `<wuik-locale-switcher>` is present in the app shell and switches the displayed language live, without a page reload
- [x] The selected locale persists across page reloads

## Notes
Depends on `web-ui-kit` backlog item `011-i18n-core-primitive-and-locale-switcher` landing first.
