---
status: todo
---
# Adopt `web-ui-kit` Design System

## Description
This repo has no UI yet beyond a placeholder (`src/main.ts` just writes a version string) — the ideal moment to adopt the org's shared design system (`web-ui-kit`: layout shell, tokens, form components) as this app's foundation from day one, rather than building ad-hoc UI first and retrofitting it later. See `roadmap`'s `.vibe/decisions/011`.

## Acceptance Criteria
- [ ] `web-ui-kit` added as a dependency, its layout shell used as this app's root frame
- [ ] Design tokens (color/spacing/typography) applied instead of any ad-hoc CSS
- [ ] Core form components (e.g. buttons, sliders) sourced from `web-ui-kit` rather than hand-rolled
- [ ] No existing functionality (version display) regresses
- [ ] A `web-ui-kit` version too old to expose the layout shell/tokens fails the build with a clear error instead of silently rendering unstyled

## Notes
Should land before or alongside item 002 (Character File Input) — the first real screen. Cross-repo dependency: `web-ui-kit` repo must exist with at least its layout shell/tokens published (it does).
