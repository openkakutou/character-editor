---
status: todo
depends_on: [027]
---
# Bake Clsn boxes from bone-attached capsules

## Description
Roadmap decision `028`: collision boxes of a 3D character are computed at authoring time, never at runtime. Let the user attach capsules to the model's bones (hurt = Clsn2, hit = Clsn1, per action or per frame range), project them onto the fight plane (orthographic) for each 3D frame, and write the resulting rectangles into `.air`. `.air` stays the single source of truth; `engine` is unchanged.

## Acceptance Criteria
- [ ] Capsules can be added, sized, attached to a bone and typed (Clsn1/Clsn2)
- [ ] Baking writes per-frame Clsn rectangles into `.air`; re-baking replaces them
- [ ] Capsule definitions are persisted so a re-bake after a model change needs no re-authoring (storage location documented, consistent with the `character` 069 spec)
- [ ] Baked boxes match the rendered silhouette on the `character` 071 sample (visual regression)
