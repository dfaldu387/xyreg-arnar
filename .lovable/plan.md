# Fix the broken SOP-001 template update path

## Goal
Make the **Update from template** action do what the UI promises for this draft: replace the old SOP-001 section content with the current template instead of showing **Nothing to update**.

## Plan
1. **Align stale detection with the actual replace logic**
   - Update the drawer’s `sopReseedInfo` detection so it only shows the CTA when the reseed service can really act on the same section content.
   - Use the same normalization rules as the reseed service so list bullets / HTML list markup / whitespace are treated consistently.

2. **Add an explicit replace path for this stale-template case**
   - In `DocumentDraftDrawer.tsx`, change the button flow so when a draft is clearly old-by-content but safe reseed returns zero updates, the action can directly swap in the latest section content for that stale SOP section.
   - Keep the change scoped to the already-identified SOP template version update case; do not broaden it to unrelated draft types.

3. **Keep user-edit protection intact**
   - Preserve the current protection for genuinely edited sections.
   - Only replace sections that match the known old baseline for SOP-001 v1 → v2, so we do not overwrite user-authored content.

4. **Verify the exact broken case**
   - Confirm the SOP-001 `6.2 QMS Documentation Structure` content updates from the old `Level 1 / Level 2 / Level 3 / Level 4` hierarchy to the current `Foundation Documents / Core Documents / Tier 1 / Tier 2 / Tier 3 / CI evidence` version.
   - Confirm the misleading **Nothing to update** path no longer occurs for this stale draft.

5. **Write the review note**
   - Update `projectplan.md` with the completed steps and a short review summary of the fix.

## Files likely to change
- `src/components/product/documents/DocumentDraftDrawer.tsx`
- `src/services/resyncSeededSopContentService.ts` or keep all fallback logic in the drawer if the smallest fix fits there
- `projectplan.md`

## Technical details
- Root issue: the drawer flags the draft as stale using tolerant content detection, but the actual reseed path still decides there is nothing safe to replace for this specific stored content shape.
- The visible broken case is SOP-001 v1 procedure section content still containing the old `6.2` text (`Level 1 / 2 / 3 / 4`) while the UI advertises template v2.
- The fix should be minimal and specific: one consistent signature/comparison path, then one actual replacement path for the known stale section.
