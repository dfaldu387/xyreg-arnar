## Fix broken SOP-001 template swap in Document Draft Drawer

### Todo
- [x] Inspect the stale-template detection and reseed logic for SOP-001 in the draft drawer and reseed service
- [x] Identify why the UI shows “Update from template” but the action falls through to “Nothing to update”
- [x] Apply the smallest fix so stale HTML list content matches the legacy baseline and can be safely replaced
- [x] Add a review summary with the root cause and changes made

### Notes
- Focus only on the broken SOP-001 template-update path shown in Change Control / Document Draft Drawer
- Keep the change as small as possible

### Review
- Root cause: the drawer’s stale detector was more tolerant than the actual reseed service. The drawer correctly identified the old SOP-001 `6.2` content as stale, but `resyncSeededSopContentService` normalized bullet lists differently, so the safe-mode matcher treated the same stale section as edited and skipped replacement.
- Change made: updated `normalizedTextSignature()` in `src/services/resyncSeededSopContentService.ts` to strip leading bullet markers (`•`, `·`, `-`) per line, matching the drawer logic used for stale detection.
- Result: legacy SOP-001 procedure content stored as HTML list items now compares equal to the recorded v1 baseline, so the **Update from template** action can replace it with the current v2 template instead of returning **Nothing to update**.
- Verification: a targeted script confirmed the old `6.2 QMS Documentation Structure` baseline and the stored HTML-list version now produce identical normalized signatures.
