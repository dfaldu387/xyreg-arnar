

## Fix Reference Documents upload dialog and file upload failures

### Problem A — Dialog too narrow
The upload dialog uses `max-w-lg` (512px). Long filenames spill out of the file list items.

**Fix**: Override the dialog width to `max-w-2xl` on the upload dialog in `ReferenceDocumentsTab.tsx` by adding `className="sm:max-w-2xl"` to `DialogContent`.

### Problem B — Upload fails with "Invalid key"
The storage file path is built as `${companyId}/${Date.now()}_${file.name}`, which includes the original filename with spaces, accented characters (e.g., `skýrsla`), and other special chars. Supabase Storage rejects these as invalid keys.

**Fix**: In `ReferenceDocumentService.uploadFile()`, sanitize the filename before building the storage path — replace spaces with underscores, strip non-ASCII/special characters, and keep the extension. The original `file.name` is still stored in the `file_name` DB column for display.

### Files changed

| File | Change |
|------|--------|
| `src/services/referenceDocumentService.ts` | Sanitize filename in `uploadFile()` before constructing `filePath` |
| `src/components/document-composer/ReferenceDocumentsTab.tsx` | Add `className="sm:max-w-2xl"` to upload dialog's `DialogContent` |

