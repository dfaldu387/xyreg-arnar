# Make Super-Admin Templates Editable Via Doc Studio Side Drawer

## Why
Today, clicking the pencil on a row in `Super Admin → Templates → Document Templates` opens a metadata-only upload dialog. The user wants the SAME inline authoring experience used in the company-side QMS (`TemplateManagementTab` → `DocumentDraftDrawer`), because the super-admin row IS the master that downstream companies inherit. This pattern already exists for the **FPD Catalog** tab (`FpdCatalogSection` → `DocumentDraftDrawer normalDraft initialSections={...}`) and the **WI Catalog** tab — we just need to extend it to the regular Document Templates tab.

## Scope of change

### 1. Schema — add inline section content to `default_document_templates`
Add nullable JSONB column `sections` (array of `{ id, title, content }`). File-based templates keep working unchanged; section-based authoring is opt-in per template.

```text
default_document_templates
  + sections  jsonb null   -- master section content (Doc Studio shape)
```

### 2. Service — `SuperAdminTemplateManagementService`
- Extend `SuperAdminTemplate` type with `sections?: SectionBlock[] | null`.
- New methods:
  - `getTemplateSections(id)` — returns the array (defaulting to a sensible starter outline if null, derived from `document_type`, e.g. SOP 8-section template).
  - `updateTemplateSections(id, sections)` — writes back.

### 3. Page — `SuperAdminTemplates.tsx`
- New state: `draftEditing: SuperAdminTemplate | null` and `draftDrawerOpen`.
- Add an **"Author content"** button next to the existing pencil icon on each row (keeps the metadata-only Edit path intact for file uploads).
- Render `<DocumentDraftDrawer normalDraft initialSections={…} documentName="<doc-number> — <title>" documentType={template.document_type} />` exactly like `FpdCatalogSection` does.
- On save, persist via `updateTemplateSections` and reload.

### 4. Wire save-back
`DocumentDraftDrawer` in `normalDraft` mode currently has no master save hook for arbitrary callers. Add an optional `onMasterSave?: (sections: SectionBlock[]) => Promise<void>` prop that, when provided, replaces the company-CI save path. Call it from the existing save action used in normalDraft mode. Falls back to current behaviour when omitted (so FPD/WI flows are untouched).

### 5. RLS
Add an `UPDATE` policy on `default_document_templates` that allows super-admins (same JWT-claim check used elsewhere) to write the `sections` column. Read policies stay unchanged.

## Out of scope
- Lifecycle (review/approve/sign), AI assistant, version history — `normalDraft` already strips these.
- Migrating existing file-based templates to inline sections (opt-in per template).
- Propagation to existing companies — same model as Global WI master: new companies inherit; existing companies opt in via a future "sync from master" action.

## Validation
1. Open `/super-admin/app/templates` → Document Templates tab.
2. Click "Author content" on a SOP row → side drawer opens with the same look-and-feel as the QMS Doc Studio (no lifecycle/AI/Configure tabs).
3. Edit a section, click Save → toast confirms, drawer closes.
4. Re-open → edits persisted. New company onboarding picks up the master sections (existing seeding pipeline already reads `default_document_templates`).
