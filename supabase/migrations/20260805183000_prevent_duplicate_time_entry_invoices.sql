-- Prevent the same time entry from being invoiced twice (app + database control).

CREATE OR REPLACE FUNCTION public.time_entry_already_invoiced(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.time_entries e
    WHERE e.id = p_entry_id
      AND (
        e.billing_status IN ('billed'::billing_status, 'excluded'::billing_status)
        OR e.invoice_id IS NOT NULL
        OR e.invoice_line_item_id IS NOT NULL
        OR e.billed_at IS NOT NULL
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.invoice_line_items li
    JOIN public.invoices i ON i.id = li.invoice_id
    WHERE li.source_type = 'time_entry'
      AND li.source_id = p_entry_id
      AND i.status IS DISTINCT FROM 'canceled'
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_time_entry_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'time_entry' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.time_entries e
    WHERE e.id = NEW.source_id
      AND (
        e.billing_status IN ('billed'::billing_status, 'excluded'::billing_status)
        OR e.invoice_id IS NOT NULL
        OR e.invoice_line_item_id IS NOT NULL
        OR e.billed_at IS NOT NULL
      )
      AND e.invoice_id IS DISTINCT FROM NEW.invoice_id
  ) THEN
    RAISE EXCEPTION 'This time entry has already been invoiced and cannot be billed again.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_line_items li
    JOIN public.invoices i ON i.id = li.invoice_id
    WHERE li.source_type = 'time_entry'
      AND li.source_id = NEW.source_id
      AND li.id IS DISTINCT FROM NEW.id
      AND i.status IS DISTINCT FROM 'canceled'
  ) THEN
    RAISE EXCEPTION 'This time entry has already been invoiced and cannot be billed again.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_time_entry_invoice ON public.invoice_line_items;
CREATE TRIGGER trg_prevent_duplicate_time_entry_invoice
BEFORE INSERT OR UPDATE OF source_type, source_id, invoice_id
ON public.invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_time_entry_invoice();

CREATE OR REPLACE FUNCTION public.mark_time_entry_billed(
  p_entry_id uuid,
  p_invoice_id uuid,
  p_line_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.time_entries e
    WHERE e.id = p_entry_id
      AND (
        e.billing_status IN ('billed'::billing_status, 'excluded'::billing_status)
        OR e.invoice_id IS NOT NULL
        OR e.invoice_line_item_id IS NOT NULL
        OR e.billed_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Time entry could not be marked billed (already invoiced).';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_line_items li
    JOIN public.invoices i ON i.id = li.invoice_id
    WHERE li.source_type = 'time_entry'
      AND li.source_id = p_entry_id
      AND i.status IS DISTINCT FROM 'canceled'
      AND li.invoice_id IS DISTINCT FROM p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Time entry could not be marked billed (already invoiced).';
  END IF;

  UPDATE public.time_entries
  SET
    billing_status = 'billed'::billing_status,
    invoice_id = p_invoice_id,
    invoice_line_item_id = p_line_item_id,
    billed_at = now(),
    updated_at = now()
  WHERE id = p_entry_id
    AND billing_status IN ('unbilled'::billing_status, 'ready'::billing_status)
    AND invoice_id IS NULL
    AND invoice_line_item_id IS NULL
    AND billed_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Time entry could not be marked billed (missing, already billed, or locked).';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_time_entries_billed(
  p_entry_ids uuid[],
  p_invoice_id uuid,
  p_line_item_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
  v_expected int;
BEGIN
  IF p_entry_ids IS NULL OR coalesce(array_length(p_entry_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.time_entries
  WHERE id = ANY (p_entry_ids)
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.time_entries e
    WHERE e.id = ANY (p_entry_ids)
      AND public.time_entry_already_invoiced(e.id)
  ) THEN
    RAISE EXCEPTION 'One or more time entries have already been invoiced and cannot be billed again.';
  END IF;

  UPDATE public.time_entries
  SET
    billing_status = 'billed'::billing_status,
    invoice_id = p_invoice_id,
    invoice_line_item_id = p_line_item_id,
    billed_at = now(),
    updated_at = now()
  WHERE id = ANY (p_entry_ids)
    AND billing_status IN ('unbilled'::billing_status, 'ready'::billing_status)
    AND invoice_id IS NULL
    AND invoice_line_item_id IS NULL
    AND billed_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  SELECT count(DISTINCT id) INTO v_expected FROM unnest(p_entry_ids) AS id;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'One or more time entries have already been invoiced and cannot be billed again.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.time_entry_already_invoiced(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_duplicate_time_entry_invoice() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_time_entries_billed(uuid[], uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.time_entry_already_invoiced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_time_entries_billed(uuid[], uuid, uuid) TO authenticated;
