

## Plan: Add search to Regulatory News widget

### Change

**File: `src/components/mission-control/widgets/RegulatoryNewsWidget.tsx`**

- Add a search input field (using the existing `Input` component) between the region filter chips and the news list
- Add local state `searchQuery` to track the input
- Filter `newsItems` by matching the query against `title`, `summary`, and `source_name` (case-insensitive) before rendering
- Show "No matching news" message when search yields no results but items exist

Single file change, no new dependencies.

