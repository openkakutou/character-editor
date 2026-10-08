---
id: 002
date: 2026-10-08
status: accepted
flow: 001
---

# Application shell: fixed sidebar + one-section workspace

**Context:** audit F1 — eight editors stacked on a 2935 px page, no navigation, always-visible shortcuts panel. Users are experts doing long sessions and novices; web first; visual direction "Studio" (decision 001).
**Options considered:** A — fixed labelled sidebar with one section at a time, foldable to a rail, drawer below 1024 px; B — icon rail by default with a wide panel; C — guided step-by-step flow with Previous/Next.
**Decision:** A.
**Reason:** labels and section header cards serve novices (job 3) while Alt+N, persistent sections and the rail fold serve daily experts (jobs 1 and 2). B hides format terms behind icons, C slows experts who tweak one thing.
**Consequences:** sections stay mounted, so each editor must stop rebuilding its DOM on every change (audit F23) and Undo must navigate to the touched section. A single validation store must feed badges and the Output list. Alt+digit may be intercepted by some browsers: the sidebar stays the primary route and the help dialog lists the keys. Other product decisions: home without sidebar; section kept in memory only; leave confirmation only for modified state; global primary Export plus Output section; badges for real problems only.
