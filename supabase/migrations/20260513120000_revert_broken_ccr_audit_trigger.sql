-- Fix: restore log_ccr_audit() to a working version.
--
-- Background
-- ----------
-- Migration 20260512150216_fd08aff2-4e21-4ef0-a092-6b2038548887.sql (Lovable,
-- commit a7c66ca43 on arnar-lovable-branch, 2026-05-12 15:02 UTC) replaced
-- log_ccr_audit() with a body that reads BOTH NEW.transition_reason and
-- NEW.exemption_review_reason on change_control_requests, then INSERTs into
-- audit_trail_logs WITHOUT ip_address / user_agent.
--
-- Two problems with that version:
--
--   1. `NEW.transition_reason` references a column that does not exist on
--      change_control_requests (it lives on change_control_state_transitions).
--      Postgres does not validate NEW.<field> at CREATE OR REPLACE FUNCTION
--      time — only when the trigger fires. So the migration applied cleanly
--      but every UPDATE on change_control_requests then failed with:
--          42703: record "new" has no field "transition_reason"
--
--   2. The new INSERT dropped the ip_address / user_agent columns that
--      20260512120000_audit_trail_request_context.sql (commit abcfb9b9d) had
--      added the same morning. Those values are sourced from
--      current_request_ip() and current_request_user_agent() — Lovable just
--      didn't carry them through.
--
-- Because staging and production share one Supabase project
-- (wzzkbmmgxxrfhhxggrcl), this took out the entire CCR module on both
-- environments for ~24h: Connect/unlink documents, edit Details / Impact /
-- Implementation, Submit, Approve, Reject, Resubmit, Mark Implemented /
-- Verified / Closed, Request Exemption, Review Exemption, and BOM revision
-- activation that depends on CCR approval. No audit_trail_logs rows were
-- written for any of those failed UPDATEs (same trigger writes the log).
--
-- What this migration does
-- ------------------------
--   * Drops only the transition_reason branch. That column legitimately does
--     not exist on change_control_requests — it lives on
--     change_control_state_transitions, and the sibling trigger
--     `propagate_ccr_transition_reason_to_audit` (migration
--     20260512151259_..., commit 23bb32436) already backfills `reason` on
--     the audit row when a transition row is inserted. Keeping that trigger
--     untouched means state-transition reasons still land in the audit log.
--
--   * Keeps the exemption_review_reason branch as-is — that column IS real
--     (added in 20260509120000_ccr_implementation_exemption.sql for Ravi's
--     exemption-request flow), so reading NEW.exemption_review_reason is
--     safe and useful: when an admin approves/rejects an exemption with a
--     written reason, that reason ends up on the audit_trail_logs row
--     directly, no second trigger needed.
--
--   * Restores ip_address / user_agent capture on the INSERT so the audit
--     log keeps recording where the change came from. Helpers
--     current_request_ip() / current_request_user_agent() were installed by
--     20260512120000_audit_trail_request_context.sql and are still present.

CREATE OR REPLACE FUNCTION public.log_ccr_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_changes jsonb := '[]'::jsonb;
  v_action text;
  v_company_id uuid;
  v_entity_id uuid;
  v_entity_name text;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_reason text := NULL;
  v_excluded text[] := ARRAY[
    'id','ccr_id','company_id','created_at','updated_at','created_by'
  ];
BEGIN
  v_user_id := auth.uid();

  IF (TG_OP = 'DELETE') THEN
    v_action := 'ccr_deleted';
    v_company_id := OLD.company_id;
    v_entity_id := OLD.id;
    v_entity_name := COALESCE(OLD.ccr_id, OLD.title, OLD.id::text);
    v_changes := to_jsonb(OLD);
  ELSIF (TG_OP = 'INSERT') THEN
    v_action := 'ccr_created';
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_entity_name := COALESCE(NEW.ccr_id, NEW.title, NEW.id::text);
    v_changes := to_jsonb(NEW);
  ELSE
    v_action := 'ccr_updated';
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_entity_name := COALESCE(NEW.ccr_id, NEW.title, NEW.id::text);

    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Build field-level diff array matching FieldChange[] shape
    FOR v_key IN SELECT jsonb_object_keys(v_new)
    LOOP
      IF v_key = ANY(v_excluded) THEN
        CONTINUE;
      END IF;
      v_old_val := v_old -> v_key;
      v_new_val := v_new -> v_key;
      IF v_old_val IS DISTINCT FROM v_new_val THEN
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'field', v_key,
          'oldValue', CASE WHEN v_old_val IS NULL OR v_old_val = 'null'::jsonb THEN NULL
                           WHEN jsonb_typeof(v_old_val) = 'string' THEN v_old_val #>> '{}'
                           ELSE v_old_val::text END,
          'newValue', CASE WHEN v_new_val IS NULL OR v_new_val = 'null'::jsonb THEN NULL
                           WHEN jsonb_typeof(v_new_val) = 'string' THEN v_new_val #>> '{}'
                           ELSE v_new_val::text END
        ));
      END IF;
    END LOOP;

    -- Skip no-op updates (no real field change)
    IF jsonb_array_length(v_changes) = 0 THEN
      RETURN NEW;
    END IF;

    -- Carry a written exemption review reason onto the audit row directly.
    -- transition_reason is NOT read here — the sibling trigger
    -- propagate_ccr_transition_reason_to_audit handles that from the
    -- change_control_state_transitions table where the column lives.
    IF NEW.exemption_review_reason IS DISTINCT FROM OLD.exemption_review_reason
       AND NEW.exemption_review_reason IS NOT NULL
       AND length(btrim(NEW.exemption_review_reason)) > 0 THEN
      v_reason := NEW.exemption_review_reason;
    END IF;
  END IF;

  INSERT INTO public.audit_trail_logs (
    company_id, user_id, category, action,
    entity_type, entity_id, entity_name,
    reason, changes, action_details,
    ip_address, user_agent
  ) VALUES (
    v_company_id,
    v_user_id,
    'quality_process',
    v_action,
    'change_control_request',
    v_entity_id,
    v_entity_name,
    v_reason,
    v_changes,
    jsonb_build_object('ccr_id', v_entity_name),
    public.current_request_ip(),
    public.current_request_user_agent()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
