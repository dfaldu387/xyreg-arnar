CREATE OR REPLACE FUNCTION public.propagate_ccr_transition_reason_to_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transition_reason IS NULL OR length(btrim(NEW.transition_reason)) = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.audit_trail_logs a
  SET reason = NEW.transition_reason
  WHERE a.id = (
    SELECT l.id
    FROM public.audit_trail_logs l
    WHERE l.entity_type = 'change_control_request'
      AND l.action      = 'ccr_updated'
      AND l.entity_id   = NEW.ccr_id
      AND l.reason IS NULL
      AND l.created_at >= NEW.created_at - interval '30 seconds'
      AND l.created_at <= NEW.created_at + interval '30 seconds'
      AND jsonb_typeof(l.changes) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(l.changes) c
        WHERE c->>'field' = 'status'
          AND c->>'newValue' = NEW.to_status::text
      )
    ORDER BY abs(extract(epoch FROM (l.created_at - NEW.created_at)))
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_ccr_transition_reason ON public.change_control_state_transitions;
CREATE TRIGGER trg_propagate_ccr_transition_reason
AFTER INSERT ON public.change_control_state_transitions
FOR EACH ROW EXECUTE FUNCTION public.propagate_ccr_transition_reason_to_audit();

UPDATE public.audit_trail_logs a
SET reason = t.transition_reason
FROM (
  SELECT DISTINCT ON (l.id) l.id, sct.transition_reason
  FROM public.audit_trail_logs l
  JOIN LATERAL (
    SELECT c->>'newValue' AS new_status
    FROM jsonb_array_elements(l.changes) c
    WHERE c->>'field' = 'status'
    LIMIT 1
  ) status_diff ON TRUE
  JOIN public.change_control_state_transitions sct
    ON sct.ccr_id = l.entity_id
   AND sct.to_status::text = status_diff.new_status
   AND abs(extract(epoch FROM (sct.created_at - l.created_at))) < 120
  WHERE l.entity_type = 'change_control_request'
    AND l.action      = 'ccr_updated'
    AND l.reason IS NULL
    AND jsonb_typeof(l.changes) = 'array'
    AND sct.transition_reason IS NOT NULL
    AND length(btrim(sct.transition_reason)) > 0
  ORDER BY l.id, abs(extract(epoch FROM (sct.created_at - l.created_at)))
) t
WHERE a.id = t.id;