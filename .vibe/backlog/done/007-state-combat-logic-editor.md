---
status: done
depends_on: [002]
---
# State/Combat Logic Editor

## Description
Add a structured editor over the parsed `.cns` model: browse StateDefs and, within each, add/edit/remove/reorder Controllers (state controllers) with their triggers and parameters. This is a real structured UI over the parsed model — not a raw text/textarea editor over `.cns` source — matching how the characteristics and sprite editors work against the parsed model rather than raw files.

## Acceptance Criteria
- [ ] User can browse existing StateDefs and see their Controllers listed in order
- [ ] User can add, edit, remove, and reorder Controllers within a StateDef, including their trigger expressions and parameters
- [ ] User can create a new StateDef
- [ ] A Controller type or parameter unrecognized by the current `character` parser is shown as a clearly flagged "unsupported" entry (preserved but not editable) rather than dropped or crashing the editor

## Notes
None.
