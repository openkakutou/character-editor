# 018 — Visual regression CI runs in Playwright's own Docker image

## Context

The `Deploy to GitHub Pages` `visual` job (item 016) started failing right
after it was introduced (`18e55f1`), and kept failing on every subsequent
push (v0.14.1 release, its own follow-up auto run, and the next backlog
item's push) — the animation editor's Clsn-boxes screenshot, specifically,
at 0.03 diff ratio against a 0.02 threshold. The other two baselines in
the same suite passed every time.

The `visual` job installed Chromium directly onto the bare `ubuntu-latest`
runner (`npx playwright install --with-deps chromium`). That produces
font-rendering (glyph metrics, antialiasing) that doesn't reliably match
whatever machine originally captured the committed baseline PNGs — a
narrow-margin environment mismatch, not real interaction flakiness. The
identical root cause, with a much larger and more obvious diff, was found
and fixed first in the sibling `character-viewer-web` repo (its
`.vibe/decisions/023`).

## Decision

Same fix as `character-viewer-web`: the `visual` job now runs inside
Playwright's own published Docker image (`mcr.microsoft.com/playwright`,
pinned to this repo's exact `@playwright/test` version, referenced by
digest), which bundles a matching Chromium build and font set. The
"Cache/Install Playwright browsers" steps are removed.

The one baseline that was actually failing was regenerated through that
same image, then confirmed stable across two more clean runs inside the
container with no `--update-snapshots`.

## Consequence

Bumping `@playwright/test` in `package.json` must be paired with bumping
the image tag/digest in `.github/workflows/deploy-pages.yml`'s `visual`
job, and every baseline regenerated through the new image before merging.
See `docs/testing.md` for the regeneration command.
