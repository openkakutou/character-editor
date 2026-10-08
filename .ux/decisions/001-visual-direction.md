---
status: accepted
date: 2026-10-08
flow: none
---

# 001 — Visual direction: "Studio"

## Decision

Adopt direction B "Studio" (friendly, structured, legible; warm dark-first palette with amber accent; DM Sans + IBM Plex Mono; 8 px radii; comfortable density; section header cards and contextual "?" help) for the redesigned `web-ui-kit` and the Character Editor built on it. The kit is redesigned first; the editor follows. Navigation is a left sidebar showing one section at a time.

## Why

Users are experts and novices doing long editing sessions; the product owner chose the guided option over maximum density. Contextual help is a first-class requirement.

## Rejected

- **A "Instrument"** (teal accent, 3 px radii, 28 px controls): calm and dense, was the expert recommendation, but less guiding for novices.
- **C "Console"** (violet accent, square corners, 24 px controls): IDE density, risks overwhelming novices.
- **Keep the current system:** the product owner judged the design system itself poor.

## Consequences

- Amber accent is close to the warning colour: warning is shifted to a darker/other amber with a distinct icon and badge shape.
- Control height 34 px is less dense than the expert recommendation; a kit-wide compact density mode can be added later.
- Shared kit change: every repo using `web-ui-kit` is affected; visual baselines must be regenerated.
