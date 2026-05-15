-- Backfill historical e-signature audit events from esign_audit_log into the
-- unified audit_trail_logs table so they appear under the "E-Signatures" tab
-- on the main Audit Trail page (21 CFR Part 11 view).
--
-- After this migration, ESignService writes and reads only from
-- audit_trail_logs. The esign_audit_log table is left in place as a safety
-- net and can be dropped in a follow-up once the unified path is verified.
--
-- Idempotent: re-running is safe because of the NOT EXISTS de-dup on
-- (category, entity_id, user_id, action, created_at).

INSERT INTO public.audit_trail_logs (
  company_id,
  user_id,
  category,
  action,
  entity_type,
  entity_id,
  entity_name,
  action_details,
  ip_address,
  user_agent,
  created_at
)
SELECT
  COALESCE(padt.company_id, dst.company_id)                                AS company_id,
  eal.user_id,
  'e_signature'                                                            AS category,
  eal.action,
  'document'                                                               AS entity_type,
  eal.document_id                                                          AS entity_id,
  COALESCE(padt.name, dst.name, 'Document')                                AS entity_name,
  COALESCE(eal.metadata, '{}'::jsonb)
    || jsonb_build_object('request_id', eal.request_id)                    AS action_details,
  eal.ip_address,
  eal.user_agent,
  eal.created_at
FROM public.esign_audit_log eal
LEFT JOIN public.phase_assigned_document_template padt
  ON padt.id = eal.document_id
LEFT JOIN public.document_studio_templates dst
  ON dst.id = eal.document_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.audit_trail_logs atl
  WHERE atl.category   = 'e_signature'
    AND atl.entity_id  = eal.document_id
    AND atl.user_id    = eal.user_id
    AND atl.action     = eal.action
    AND atl.created_at = eal.created_at
);
