
ALTER TABLE public.audit_trail_logs
  ADD COLUMN IF NOT EXISTS ip_address_inferred inet,
  ADD COLUMN IF NOT EXISTS ip_address_source text;

UPDATE public.audit_trail_logs
SET ip_address_source = 'captured'
WHERE ip_address IS NOT NULL AND ip_address_source IS NULL;

WITH login_ips AS (
  SELECT user_id, ip_address, created_at
  FROM public.audit_trail_logs
  WHERE action = 'login' AND ip_address IS NOT NULL AND user_id IS NOT NULL
),
matches AS (
  SELECT DISTINCT ON (a.id)
    a.id,
    l.ip_address AS inferred_ip
  FROM public.audit_trail_logs a
  JOIN login_ips l
    ON l.user_id = a.user_id
   AND l.created_at <= a.created_at
   AND l.created_at >= a.created_at - interval '24 hours'
  WHERE a.ip_address IS NULL
    AND a.user_id IS NOT NULL
  ORDER BY a.id, l.created_at DESC
)
UPDATE public.audit_trail_logs a
SET ip_address_inferred = (m.inferred_ip)::inet,
    ip_address_source = 'inferred_from_login'
FROM matches m
WHERE a.id = m.id;
