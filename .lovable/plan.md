
## Two issues, two answers

### 1. SSOT — yes, it is wired correctly

Every Venture Blueprint sub-step that uses an inline editor writes through `GenesisSsotEditor.tsx`, which `update`s a column on the `products` row (or a key inside the `intended_purpose_data` / `key_technology_characteristics` JSONB on `products`). That is the exact same store that Device Definition reads and writes from — there is no parallel "blueprint-only" table.

Concretely:
- `binding.kind = 'product-column'` → `products.<column>` (e.g. `device_name`, `trl_level`, `intended_use`)
- `binding.kind = 'product-jsonb'` → key inside `products.intended_purpose_data` or `products.key_technology_characteristics`
- `binding.kind = 'open-module'` (Tier C: BOM, IP, Team, rNPV, Reimbursement, Target Markets…) → no shadow copy, the dedicated module is the SSOT

So filling TRL = 3 in the blueprint and TRL on Device Definition are the same row/column. No separate state, no duplication. I'll add a one-line note to memory confirming this so it stays the rule.

### 2. Floating step pill — port the gap-analysis one

You're right: `ProductGapItemDetailPage.tsx` (lines 720–765) renders a fixed bottom pill: `[← prev section] [current step (amber, Step X/Y)] [next section →]` with green dots when complete. Venture Blueprint's `BlueprintStepDetail.tsx` only has a plain inline ghost "Previous step / Next step" pair (lines 145–168). That's why it feels different.

I will lift the gap-analysis pill into a small shared component and use it in the blueprint detail view.

## Changes

1. **New** `src/components/product/business-case/genesis/BlueprintStepFloatingNav.tsx`
   - Visual + behavior copy of the pill in `ProductGapItemDetailPage.tsx` (fixed bottom, rounded, amber center, prev/next pills with dot + label + complete-state colors).
   - Props: `currentLabel`, `currentIndex`, `totalSteps`, `currentComplete`, `prevLabel?`, `prevComplete?`, `onPrev?`, `nextLabel`, `nextComplete?`, `onNext`.

2. **Edit** `src/components/product/business-case/genesis/BlueprintStepDetailView.tsx`
   - Compute global step index across the flat list of all sub-steps (already has `flatSteps`).
   - Resolve prev/next sub-step labels from `GENESIS_SECTIONS` and their completion from the `completion` map already passed in.
   - Render `<BlueprintStepFloatingNav />` at the bottom; remove (or hide) the inline prev/next pair in `BlueprintStepDetail.tsx` to avoid duplication.

3. **Edit** `src/components/product/business-case/genesis/BlueprintStepDetail.tsx`
   - Remove the inline `Previous step / Next step` row (lines 144–168). The floating pill replaces it. Keep `onBack` / "Back to Venture Blueprint".

4. **Memory**: add a short `mem://features/genesis/ssot-binding` confirming Venture Blueprint inline edits are SSOT-on-`products` (no shadow store), and Tier C steps defer to their dedicated module.

## Out of scope

- No DB changes.
- No changes to which step is "complete" (already fixed in the previous loop).
- No restyle of the gap-analysis pill — we mirror it verbatim for visual consistency.
