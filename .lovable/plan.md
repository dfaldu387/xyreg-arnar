## Why seeding "isn't working"

It actually is — but the UI lies. Here's what's happening for Actiweight Labs AS:

1. The badge says **Foundation 27/28 → "Seed 1 missing"**.
2. You click it → toast says **"All foundation SOPs already present"** and nothing is inserted.
3. The badge stays at 27/28 forever, looking broken.

### Root cause

The DB has all 28 Tier A SOPs. The 28th one (**SOP-004**) is a legacy row named `"Personnel and Training"` (no `SOP-004 ` prefix), with `document_number = 'SOP-004'`.

Two pieces of code disagree on how to detect duplicates:

| Function | Matches by | Result for SOP-004 |
|---|---|---|
| `seedSopsForCompany` (the seeder) | `document_number` **OR** name | Found → skip |
| `countTierASopsPresent` (the badge counter) | name only | Not found → counts as missing |

So the seeder correctly skips it, but the counter under-reports → badge stays red and never reconciles. Same bug exists in `countTierBSopsPresent`.

The DB itself is fine. No data loss. Just a UI/counter bug.

## Fix (one file, ~20 lines)

**`src/services/sopAutoSeedService.ts`** — make the two count functions use the same three-way match the seeder uses (document_number, full name, bare title):

```ts
// Pseudocode for both countTierA / countTierB:
const { data } = await supabase
  .from('phase_assigned_document_template')
  .select('name, document_number')
  .eq('company_id', companyId)
  .eq('document_type', 'SOP');

const numbers = new Set((data ?? []).map(r => (r.document_number ?? '').toUpperCase().trim()).filter(Boolean));
const names   = new Set((data ?? []).map(r => normalizeTitle(r.name ?? '')));

let count = 0;
for (const entry of TIER_A_AUTO_SEED) {
  const c = SOP_FULL_CONTENT[entry.sop];
  if (!c) continue;
  const num = c.sopNumber.toUpperCase().trim();
  const full = normalizeTitle(`${c.sopNumber} ${c.title}`);
  const bare = normalizeTitle(c.title);
  if (numbers.has(num) || names.has(full) || names.has(bare)) count++;
}
```

After this:
- Actiweight Labs AS will correctly show **Foundation 28/28** (green, no "Seed missing" button).
- Any other company with legacy bare-title SOPs (the second screenshot suggests there are several with `document_number = NULL` and just the canonical title) will also reconcile properly.

## Out of scope (intentionally)

- I am **not** renaming the legacy `"Personnel and Training"` row to add the `SOP-004` prefix, and **not** backfilling missing `document_number` values. Those are cosmetic data tweaks separate from the seeding bug. Happy to do them as a follow-up if you want consistent naming in the list.
- No template content changes. SOP-QA-002 / Document Control template is untouched.
