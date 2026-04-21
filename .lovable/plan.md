

## Issue
For Class I devices the dropdown only offers **"Self-Declaration (Annex IV)"**. Per EU MDR, the self-declaration route for Class I is more accurately described as **"Conformity Assessment based on Annex II and Annex III"** (Annex II = technical documentation, Annex III = PMS technical documentation). Annex IV is the *Declaration of Conformity template*, not the assessment procedure itself. The label is misleading and the more correct phrasing is missing entirely.

## Fix (single source — propagates to both dropdowns)

**File:** `src/utils/conformityRouteUtils.ts`

1. **Add** a new option as the canonical Class I self-declaration route:
   ```
   { value: 'Self-Declaration (Annex II + III)',
     label: 'Conformity Assessment based on Annex II and Annex III (Self-Declaration, Class I)',
     forClasses: ['I'] }
   ```
2. **Keep** `Self-Declaration (Annex IV)` in `CONFORMITY_ROUTES` so existing product records that already store this value still render and don't break — but mark its label as `Self-Declaration (Annex IV — DoC template, legacy)` so users picking from scratch are steered to the new option.
3. **Update** `getSuggestedConformityRoute('I')` to return the new value `'Self-Declaration (Annex II + III)'`.
4. **Add** `CONFORMITY_ROUTE_DESCRIPTIONS['Self-Declaration (Annex II + III)']` with: *"Class I devices (non-sterile, non-measuring, non-reusable surgical). Manufacturer demonstrates conformity per Annex II (Technical Documentation) and Annex III (PMS Technical Documentation), then issues an EU Declaration of Conformity. No Notified Body involvement."*
5. **Update** `getConformityRouteHelpContent()` first bullet accordingly.

## Where it shows up
- `src/components/product/device/AutopopulatedEUDAMEDSection.tsx` (the dropdown in the screenshot) — currently hard-codes the items as `<SelectItem>` literals. **Refactor** the dropdown there to map over `CONFORMITY_ROUTES` so it picks up the new option automatically. Same edit in `EUDAMEDRegistrationSection.tsx`.

## Files touched
- `src/utils/conformityRouteUtils.ts` — add option, update suggestion + descriptions + help text
- `src/components/product/device/AutopopulatedEUDAMEDSection.tsx` — render from `CONFORMITY_ROUTES`
- `src/components/product/device/EUDAMEDRegistrationSection.tsx` — render from `CONFORMITY_ROUTES`

## Out of scope
- No DB migration — values stored in DB are free-text strings; both old and new values render fine.
- No change to other markets' routes (FDA 510(k) etc.).

## Expected result
On the Market & Regulatory dropdown, Class I devices now see **"Conformity Assessment based on Annex II and Annex III (Self-Declaration, Class I)"** at the top of the list, and it becomes the auto-suggested route for Class I.

