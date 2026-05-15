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

    IF jsonb_array_length(v_changes) = 0 THEN
      RETURN NEW;
    END IF;

    IF NEW.transition_reason IS DISTINCT FROM OLD.transition_reason
       AND NEW.transition_reason IS NOT NULL
       AND length(btrim(NEW.transition_reason)) > 0 THEN
      v_reason := NEW.transition_reason;
    ELSIF NEW.exemption_review_reason IS DISTINCT FROM OLD.exemption_review_reason
          AND NEW.exemption_review_reason IS NOT NULL
          AND length(btrim(NEW.exemption_review_reason)) > 0 THEN
      v_reason := NEW.exemption_review_reason;
    END IF;
  END IF;

  INSERT INTO public.audit_trail_logs (
    company_id, user_id, category, action,
    entity_type, entity_id, entity_name,
    reason, changes, action_details
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
    jsonb_build_object('ccr_id', v_entity_name)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.audit_trail_logs a
SET reason = c.new_value
FROM (
  SELECT DISTINCT ON (l.id) l.id, (chg->>'newValue') AS new_value
  FROM public.audit_trail_logs l,
       LATERAL jsonb_array_elements(l.changes) chg
  WHERE l.entity_type = 'change_control_request'
    AND l.action = 'ccr_updated'
    AND l.reason IS NULL
    AND jsonb_typeof(l.changes) = 'array'
    AND chg->>'field' IN ('transition_reason','exemption_review_reason')
    AND chg->>'newValue' IS NOT NULL
    AND length(btrim(chg->>'newValue')) > 0
  ORDER BY l.id,
    CASE WHEN chg->>'field' = 'transition_reason' THEN 0 ELSE 1 END
) c
WHERE a.id = c.id;