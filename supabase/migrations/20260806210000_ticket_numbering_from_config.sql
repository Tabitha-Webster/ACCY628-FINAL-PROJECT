-- Keep support ticket auto-numbers aligned with Admin → Configurations → Numbering.
-- Prefer an explicit ticket_number from the app; otherwise use configured prefix + sequence.

CREATE OR REPLACE FUNCTION public.generate_support_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'TKT-';
  seq integer := 1001;
  numbering jsonb;
BEGIN
  IF NEW.ticket_number IS NOT NULL AND btrim(NEW.ticket_number) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT sc.numbering
  INTO numbering
  FROM public.system_configuration AS sc
  WHERE sc.id = 'default';

  IF numbering IS NOT NULL THEN
    prefix := coalesce(nullif(btrim(numbering->>'ticketPrefix'), ''), 'TKT-');
    BEGIN
      seq := greatest(1, floor(coalesce((numbering->>'nextTicketSequence')::numeric, 1001))::integer);
    EXCEPTION WHEN others THEN
      seq := 1001;
    END;
  END IF;

  NEW.ticket_number := prefix || seq::text;

  UPDATE public.system_configuration
  SET
    numbering = jsonb_set(
      coalesce(numbering, '{}'::jsonb),
      '{nextTicketSequence}',
      to_jsonb(seq + 1),
      true
    ),
    updated_at = now()
  WHERE id = 'default';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_generate_support_ticket_number
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.generate_support_ticket_number();
