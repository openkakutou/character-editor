---
date: 2026-08-16
status: accepted
---
# `web-ui-kit` adoption scope: theme toggle instead of a fake button, no-token error state

**Context:** Backlog item 001 requires the layout shell, tokens, and a core form component from `web-ui-kit`, plus a clear failure when the installed version is too old to expose them. At this scaffold stage there is no real screen yet, so no natural place for a form component exists on its own.

**Decision:**
- Use a genuinely working light/dark theme toggle (`<wuik-button>`) in the toolbar to satisfy the form-component requirement, instead of a disabled placeholder button with no behavior.
- Set the minimum supported `web-ui-kit` version to `0.4.0` (the release that added the button component; the shell and tokens landed earlier, in `0.3.0`/`0.1.0`).
- The "version too old" error message is styled without any `--wuik-*` token or component, so it still renders correctly even if the design system's stylesheet itself failed to load.

**Reason:** A non-functional button risks becoming the copy-pasted pattern for every future screen in this repo (flagged by UI/UX consultation). A theme toggle is small, real, and immediately exercises both the button component and the token-driven dark theme — otherwise dark mode would silently never be reachable, since the design tokens have no `prefers-color-scheme` fallback (flagged by design consultation). The error state must not depend on the same system it is reporting as broken/outdated.

**Rejected alternatives:**
- *Disabled "Save" placeholder button* — rejected: no accessible affordance, misleading, sets a bad precedent (UI/UX consultation).
- *Deferring the form-component criterion to a later item* — rejected: the backlog item's acceptance criteria explicitly require it now.
