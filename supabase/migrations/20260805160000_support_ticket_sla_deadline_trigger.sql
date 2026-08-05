-- Calculate response/resolution due timestamps from the related contract when a ticket is submitted.
-- Uses calendar hours from submitted_at (no structured business-hours table exists).
-- Prefer priority-specific response hours when present.

CREATE OR REPLACE FUNCTION public.set_support_ticket_sla_deadlines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  response_hours numeric;
  resolution_hours numeric;
  submitted timestamptz;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fill blanks so manual overrides remain possible
  IF NEW.target_response_at IS NOT NULL AND NEW.target_resolution_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    sla_response_hours,
    sla_resolution_hours,
    sla_critical_response_hours,
    sla_high_response_hours,
    sla_medium_response_hours,
    sla_low_response_hours
  INTO c
  FROM public.contracts
  WHERE id = NEW.contract_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  submitted := coalesce(NEW.submitted_at, now());
  NEW.submitted_at := submitted;

  response_hours := CASE lower(coalesce(NEW.priority::text, 'medium'))
    WHEN 'critical' THEN coalesce(c.sla_critical_response_hours, c.sla_response_hours)
    WHEN 'high' THEN coalesce(c.sla_high_response_hours, c.sla_response_hours)
    WHEN 'medium' THEN coalesce(c.sla_medium_response_hours, c.sla_response_hours)
    WHEN 'low' THEN coalesce(c.sla_low_response_hours, c.sla_response_hours)
    ELSE c.sla_response_hours
  END;

  resolution_hours := c.sla_resolution_hours;

  IF NEW.target_response_at IS NULL AND response_hours IS NOT NULL AND response_hours >= 0 THEN
    NEW.target_response_at := submitted + make_interval(secs => (response_hours * 3600)::int);
  END IF;

  IF NEW.target_resolution_at IS NULL AND resolution_hours IS NOT NULL AND resolution_hours >= 0 THEN
    NEW.target_resolution_at := submitted + make_interval(secs => (resolution_hours * 3600)::int);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_support_ticket_sla_deadlines ON public.support_tickets;
CREATE TRIGGER trg_set_support_ticket_sla_deadlines
  BEFORE INSERT OR UPDATE OF contract_id, priority, submitted_at
  ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_sla_deadlines();

REVOKE ALL ON FUNCTION public.set_support_ticket_sla_deadlines() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_support_ticket_sla_deadlines() FROM anon;
