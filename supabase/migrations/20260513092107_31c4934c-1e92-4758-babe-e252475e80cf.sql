UPDATE public.document_studio_templates t
SET document_control = jsonb_set(t.document_control, '{effectiveDate}', 'null'::jsonb, false)
WHERE t.document_control ? 'effectiveDate'
  AND t.document_control->>'effectiveDate' IS NOT NULL
  AND t.template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.review_workflows rw
    WHERE rw.record_type = 'document'
      AND rw.record_id::text = t.template_id
      AND rw.overall_status = 'approved'
  );