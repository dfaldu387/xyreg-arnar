## Goal
Three small UX fixes around the Help panel and the Edit Draft drawer.

## Todo
- [ ] (a) Make the Help & Guide book icon a true toggle — open when closed, close when open.
- [ ] (b) Constrain the Edit Draft drawer so it starts below the top app header (matching the Help & Guide sheet's `top-16` offset) instead of covering the full viewport height.
- [ ] (c) Remove the paper-airplane "Send for Review" icon from the Edit Draft top header (it already exists on the Review & Approve step).

## What I found

### a) Toggle race
`AppLayout` already calls `setHelpSidebarOpen(v => !v)` on the book button. But the Sheet underneath calls `onOpenChange(false)` from its `onInteractOutside` handler the moment a click lands outside it (including on the book button). The order is:
1. Sheet outside-click → `setHelpSidebarOpen(false)`
2. Button onClick → `setHelpSidebarOpen(v => !v)` flips false → true

Net result: open stays open. This is the classic Radix sheet/dialog "toggle button next to a non-modal sheet" race.

Fix: in `SheetContent.onInteractOutside` (or directly in `GlobalHelpSidebar`), if the pointer-down target is inside an element marked as the help toggle, call `e.preventDefault()` so Radix doesn't close. The button's onClick then flips state cleanly.

### b) Drawer height vs help height
`GlobalHelpSidebar` uses `top-16 h-[calc(100vh-4rem)]` so the app's top header stays visible.

`ResizableDrawer` (used by `DocumentDraftDrawer`) renders an MUI `Drawer` with default `top: 0` / full viewport height, so it overlays the top header and adds visual whitespace at the very top.

Fix: pass MUI `PaperProps.sx` so the drawer Paper is offset by the header height:
- `top: '64px'` (matches `top-16`)
- `height: 'calc(100vh - 64px)'`
- and lower the modal/backdrop top similarly so the resize handle stays aligned.

### c) Redundant Send icon
`DocumentDraftDrawer.tsx` lines 1255–1265 render a "Send for Review" `IconButton` (paper airplane) in the drawer top toolbar. The same action is the primary CTA of the Review & Approve step (line ~1587). Remove the toolbar icon.

## Technical details

Files:
- `src/components/help/GlobalHelpSidebar.tsx` — add `onInteractOutside` / `onPointerDownOutside` that preventDefault when the click is on `[data-help-toggle]`.
- `src/components/layout/AppLayout.tsx` — add `data-help-toggle` to the book-icon Button.
- `src/components/ui/resizable-drawer.tsx` — add a `topOffset` (default 64px) and apply it to PaperProps and the resize handle, OR set it directly via `PaperProps.sx` for the document drawer.
- `src/components/product/documents/DocumentDraftDrawer.tsx` — delete the Send-for-Review IconButton block and drop the unused `Send` import if no longer used elsewhere in the toolbar.

Minimal-impact approach: keep `ResizableDrawer` API stable; add an optional `topOffsetPx` prop with default `64`. Drawer applies it via PaperProps + Modal sx.

## Review section
After implementation I'll add a one-paragraph note covering what changed and how each item was verified.