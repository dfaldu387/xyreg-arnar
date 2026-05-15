---
name: SOP Template Version Reseed
description: Version-aware reseed of seeded SOP drafts when SOP_FULL_CONTENT entries are edited; safe mode + force mode with archive history
type: feature
---
- Each `SOPFullContent` entry carries `templateVersion` (default 1). Bump it whenever the static template content is edited.
- `LEGACY_SOP_SECTION_CONTENT` (in `src/data/sopContent/legacyTemplateBaselines.ts`) stores the previous-version, un-personalised text per `(sopKey, sectionId, prevVersion)` so safe-mode can detect un-edited drafts. `SOP_SECTION_DIFFS` lists which section ids changed at each version step.
- `sopAutoSeedService` writes `metadata.sourceTemplateVersion` on every initial draft insert.
- `resyncStaleSopSections(companyId, companyName, { mode })` (in `resyncSeededSopContentService.ts`) is the entry point. Safe mode: replace only when current section content is byte-identical to the personalised previous-version baseline; otherwise emit a `conflict` and skip. Force mode: replace and append the prior content to `metadata.reseedHistory[]` for undo.
- Safe-mode resync runs automatically inside `ensureCompanySeedingComplete` (Documents page mount, post-registration). Manual "Re-seed updated templates" button on `CompanyDocumentsPage` triggers safe-mode; conflicts surface a destructive "Force re-seed N edited" CTA.
- Per-draft surface in `DocumentDraftDrawer`: when an open SOP draft's `metadata.sourceTemplateVersion < SOP_FULL_CONTENT[key].templateVersion`, an amber "Update from template · N" button appears next to `LiveEditorHeaderActions`. Safe-mode by default; if conflicts the AlertDialog prompts force-overwrite (archived to `metadata.reseedHistory`). Scoped via `resyncStaleSopSections(..., { sopKeys: [thisSop] })`. After success the drawer reloads sections from DB and bumps `editorKey` to remount the editor.
- SOP-001 §6.2 was the first reseed: v1 said `Level 1–4` hierarchy; v2 reframes as Foundation vs Core × Tier 1/2/3 with Records as CI-anchored evidence.
