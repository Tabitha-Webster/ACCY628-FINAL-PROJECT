-- Controls:
-- 1. Draft invoices must be reviewed before sending
-- 2. Unapproved changes cannot be billed
-- 3. Invoice total must equal the sum of its lines

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

UPDATE public.invoices
SET
  reviewed_at = coalesce(reviewed_at, generated_at, created_at),
  reviewed_by = coalesce(reviewed_by, generated_by)
WHERE status IS DISTINCT FROM 'draft'::invoice_status
  AND reviewed_at IS NULL;

CREATE OR REPLACE FUNCTION public.invoice_line_subtotal(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(coalesce(sum(li.line_amount), 0), 2)
  FROM public.invoice_line_items li
  WHERE li.invoice_id = p_invoice_id;
$$;

CREATE OR REPLACE FUNCTION public.invoice_totals_match_lines(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND round(i.subtotal, 2) = public.invoice_line_subtotal(i.id)
      AND round(i.total_amount, 2) = round(greatest(0, i.subtotal + i.tax_amount - i.credits), 2)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_unreviewed_invoice_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF round(NEW.total_amount, 2) IS DISTINCT FROM round(greatest(0, NEW.subtotal + NEW.tax_amount - NEW.credits), 2) THEN
    RAISE EXCEPTION 'Invoice total must equal the sum of its lines plus tax minus credits.';
  END IF;

  IF NEW.status = 'canceled'::invoice_status THEN
    RETURN NEW;
  END IF;

  IF NEW.sent_at IS NOT NULL AND NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Draft invoices must be reviewed before they can be sent.';
  END IF;

  IF NEW.status = 'sent'::invoice_status AND NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Draft invoices must be reviewed before they can be sent.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'draft'::invoice_status
     AND NEW.status IS DISTINCT FROM 'draft'::invoice_status THEN
    IF NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'Draft invoices must be reviewed before they can be issued or sent.';
    END IF;
    IF NOT public.invoice_totals_match_lines(NEW.id) THEN
      RAISE EXCEPTION 'Invoice total must equal the sum of its lines before the invoice can leave draft.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM 'draft'::invoice_status
     AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.credits IS DISTINCT FROM OLD.credits
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     )
     AND NOT public.invoice_totals_match_lines(NEW.id) THEN
    RAISE EXCEPTION 'Invoice total must equal the sum of its lines.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unreviewed_invoice_send ON public.invoices;
CREATE TRIGGER trg_prevent_unreviewed_invoice_send
BEFORE INSERT OR UPDATE OF status, sent_at, reviewed_at, subtotal, tax_amount, credits, total_amount
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unreviewed_invoice_send();

CREATE OR REPLACE FUNCTION public.prevent_invoice_line_total_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_status invoice_status;
  v_subtotal numeric;
  v_tax numeric;
  v_credits numeric;
  v_total numeric;
  v_line_sum numeric;
BEGIN
  v_invoice_id := coalesce(NEW.invoice_id, OLD.invoice_id);
  SELECT i.status, i.subtotal, i.tax_amount, i.credits, i.total_amount
    INTO v_status, v_subtotal, v_tax, v_credits, v_total
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  IF v_status IS NULL OR v_status IN ('draft'::invoice_status, 'canceled'::invoice_status) THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  SELECT round(coalesce(sum(li.line_amount), 0), 2)
    INTO v_line_sum
  FROM public.invoice_line_items li
  WHERE li.invoice_id = v_invoice_id;

  IF round(v_subtotal, 2) IS DISTINCT FROM v_line_sum
     OR round(v_total, 2) IS DISTINCT FROM round(greatest(0, v_subtotal + v_tax - v_credits), 2) THEN
    RAISE EXCEPTION 'Invoice total must equal the sum of its lines.';
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_line_total_mismatch ON public.invoice_line_items;
CREATE TRIGGER trg_prevent_invoice_line_total_mismatch
AFTER INSERT OR UPDATE OF line_amount, invoice_id OR DELETE
ON public.invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invoice_line_total_mismatch();

CREATE OR REPLACE FUNCTION public.prevent_unapproved_invoice_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classification work_classification;
  v_approval approval_status;
  v_customer_approval approval_status;
  v_completed boolean;
BEGIN
  IF NEW.source_type = 'time_entry' AND NEW.source_id IS NOT NULL THEN
    SELECT e.classification, e.approval_status
      INTO v_classification, v_approval
    FROM public.time_entries e
    WHERE e.id = NEW.source_id;

    IF v_classification IN ('billable'::work_classification, 'out_of_scope'::work_classification)
       AND v_approval NOT IN ('approved'::approval_status, 'not_required'::approval_status) THEN
      RAISE EXCEPTION 'Unapproved time entries cannot be billed.';
    END IF;
  ELSIF NEW.source_type = 'direct_cost' AND NEW.source_id IS NOT NULL THEN
    SELECT d.approval_status INTO v_approval
    FROM public.direct_costs d
    WHERE d.id = NEW.source_id;

    IF v_approval IS DISTINCT FROM 'approved'::approval_status THEN
      RAISE EXCEPTION 'Unapproved costs cannot be billed.';
    END IF;
  ELSIF NEW.source_type = 'project' AND NEW.source_id IS NOT NULL THEN
    SELECT p.customer_approval_status INTO v_customer_approval
    FROM public.projects p
    WHERE p.id = NEW.source_id;

    IF v_customer_approval IN ('pending'::approval_status, 'rejected'::approval_status) THEN
      RAISE EXCEPTION 'Unapproved project changes cannot be billed.';
    END IF;
  ELSIF NEW.source_type IN ('milestone', 'project_milestone') AND NEW.source_id IS NOT NULL THEN
    SELECT m.approval_status, m.completed
      INTO v_approval, v_completed
    FROM public.project_milestones m
    WHERE m.id = NEW.source_id;

    IF coalesce(v_completed, false) = false
       OR v_approval NOT IN ('approved'::approval_status, 'not_required'::approval_status) THEN
      RAISE EXCEPTION 'Unapproved milestone changes cannot be billed.';
    END IF;
  END IF;

  IF NEW.line_amount IS DISTINCT FROM round(coalesce(NEW.quantity, 0) * coalesce(NEW.rate, 0), 2) THEN
    RAISE EXCEPTION 'Invoice line amount must equal quantity times rate.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unapproved_invoice_source ON public.invoice_line_items;
CREATE TRIGGER trg_prevent_unapproved_invoice_source
BEFORE INSERT OR UPDATE OF source_type, source_id, quantity, rate, line_amount
ON public.invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_unapproved_invoice_source();

REVOKE ALL ON FUNCTION public.invoice_line_subtotal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoice_totals_match_lines(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_unreviewed_invoice_send() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invoice_line_total_mismatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_unapproved_invoice_source() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.invoice_line_subtotal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_totals_match_lines(uuid) TO authenticated;
