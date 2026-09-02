---
status: todo
---
# Visual Regression Tests

## Description
Add automated Playwright screenshot-comparison tests covering this app's own real rendered surfaces — the sprite browser, the palette editor's live-recolored sprite preview, and the animation editor's frame preview with its Clsn1/Clsn2 box overlays — loaded/edited from a real character fixture, not blank/default state. See roadmap decision `024-visual-regression-testing-via-playwright-screenshots.md` for the shared approach.

## Acceptance Criteria
- [ ] The app's Playwright config extends `web-ui-kit`'s shared visual-testing config/fixture
- [ ] Baseline screenshots exist for: the sprite browser showing a decoded sprite, the palette editor's preview after a color edit, and the animation editor's frame preview with Clsn boxes drawn (added, dragged, and resized)
- [ ] `npm run test:visual` runs these in CI as its own job, separate from `npm test`, and fails the build on a diff
- [ ] A real, deliberate rendering regression (verified by temporarily breaking one of the covered paths, then reverting) is caught by this suite

## Notes
Depends on `web-ui-kit` backlog item `013-visual-regression-shared-playwright-config-and-component-snapshots` landing first.
