## What went wrong

You're right — I overcomplicated it. Two concrete mistakes:

1. **Trigger button is black.** I used `variant="default"` in `TemplateFilterBar.tsx`. The Documents filter (`EnhancedDocumentFilters.tsx` line 804) uses `variant="outline" + bg-background` → white. Mine should match.
2. **I split "Tier" into "Category" + "Classification".** There is only one concept here: **Tier** (Generic / Pathway / Device-specific). I confused myself by renaming the table column to "Classification" and adding a "Classification" entry in the filter popover, while a stale `filters.category` branch still exists in the filtering code. None of that should be there.

## Fix (one component + one header line)

### 1. `src/components/settings/document-control/templates/TemplateFilterBar.tsx`
- Change trigger to `variant="outline"` + `bg-background` so it's white, matching Documents.
- Rename the third filter category from **"Classification"** back to **"Tier"** in the popover list.
- Keep the three options as labels only: **Generic, Pathway, Device-specific** (these are the values of Tier — same nomenclature shown in the badge column).
- Active chip prefix becomes `Tier: Generic` etc. (instead of bare label).

### 2. `src/components/settings/document-control/templates/TemplateManagementTab.tsx`
- Revert the table column header (line 572) from **"Classification"** back to **"Tier"**.
- Remove the dead `filters.category` filter branch (lines ~428–431) — it's unused and was part of the confusion.

## Result

- One white "Search and filter" button, identical to Documents.
- Popover drill-down: **Scope → Document type → Tier**.
- Tier sub-view shows checkboxes for **Generic / Pathway / Device-specific** — same words as the Tier column badges.
- Table column stays **Tier**. No "Category", no "Classification" anywhere.

No other files touched. No data model changes.
