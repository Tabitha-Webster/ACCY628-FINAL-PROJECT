-- Ticket number generator for shared ACCY628-FINAL-PROJECT support_tickets.
-- Preserves existing TKT-#### format (zero-padded to 4 digits).
-- Continues after the highest existing number.

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  SELECT coalesce(max(nullif(regexp_replace(ticket_number, '\D', '', 'g'), '')::bigint), 1000)
    INTO max_num
  FROM public.support_tickets;
  PERFORM setval('public.support_ticket_number_seq', greatest(max_num, 55), true);
END $$;

CREATE OR REPLACE FUNCTION public.generate_support_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    n := nextval('public.support_ticket_number_seq');
    NEW.ticket_number := 'TKT-' || lpad(n::text, 4, '0');
  END IF;
  IF NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;
  IF NEW.status IS NULL THEN
    NEW.status := 'new';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_support_ticket_number ON public.support_tickets;
CREATE TRIGGER trg_generate_support_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_support_ticket_number();

REVOKE ALL ON FUNCTION public.generate_support_ticket_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_support_ticket_number() FROM anon;
GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_number_seq TO authenticated;
