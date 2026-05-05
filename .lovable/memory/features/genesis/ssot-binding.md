---
name: Genesis SSOT Binding
description: Venture Blueprint inline edits write directly to products row; no shadow store
type: feature
---
Venture Blueprint sub-steps are SSOT-bound through `GenesisSsotEditor.tsx`:

- `binding.kind = 'product-column'` → updates `products.<column>` (e.g. `device_name`, `trl_level`, `intended_use`).
- `binding.kind = 'product-jsonb'` → updates a key inside `products.intended_purpose_data` or `products.key_technology_characteristics`.
- `binding.kind = 'open-module'` → no shadow copy; the dedicated module (BOM, IP Strategy, Team, rNPV, Reimbursement, Target Markets, etc.) is the SSOT and is opened with `returnTo=venture-blueprint`.

There is no parallel "blueprint-only" table. Filling a field in Venture Blueprint and filling it in Device Definition write to the same row/column. Completion in the Genesis sidebar is derived from these same fields via `useViabilityFunnelProgress` + the `keyToCompletionField` map in `VentureBlueprint.tsx`.
