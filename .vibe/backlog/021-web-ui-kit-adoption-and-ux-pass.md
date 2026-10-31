---
status: todo
---
# Adopt web-ui-kit components fully and run a UX pass

## Description
The product owner finds the viewer/editor apps ugly and hard to use. web-ui-kit item 012 found the main cause is under-adoption: bare native <button>/<input>/<select> where the kit offers styled components. Audit this app's screens, replace native controls with kit components (including the kit's select, tooltip and toast components, and the checkbox/switch once web-ui-kit 030 lands), fix layout hierarchy and spacing, and verify in the running app.

## Acceptance Criteria
- [ ] Every interactive control that has a kit equivalent uses it (list of exceptions justified in the item notes)
- [ ] Screens checked in light and dark themes at desktop and narrow widths
- [ ] Keyboard-only walkthrough of the main flow works with visible focus
- [ ] Visual-regression baselines regenerated and reviewed

## Notes
Follow-up of web-ui-kit 012. Missing components discovered here become web-ui-kit backlog items, not per-app workarounds.
