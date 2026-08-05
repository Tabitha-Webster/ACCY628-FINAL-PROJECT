-- Controls:
-- 1. Canceled invoices cannot receive payments
-- 2. Changes after approval require reapproval

CREATE OR REPLACE FUNCTION public.prevent_payment_on_canceled_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status invoice_status;
BEGIN
  SELECT i.status INTO v_status
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Payment cannot be applied because the invoice was not found.';
  END IF;

  IF v_status = 'canceled'::invoice_status THEN
    RAISE EXCEPTION 'Canceled invoices cannot receive payments.';
  END IF;

  IF v_status = 'draft'::invoice_status THEN
    RAISE EXCEPTION 'Draft invoices must be reviewed before they can receive payments.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_on_canceled_invoice ON public.payment_applications;
CREATE TRIGGER trg_prevent_payment_on_canceled_invoice
BEFORE INSERT OR UPDATE OF invoice_id, amount_applied
ON public.payment_applications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_payment_on_canceled_invoice();

CREATE OR REPLACE FUNCTION public.require_time_entry_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.hours_worked IS NOT DISTINCT FROM OLD.hours_worked
     AND NEW.billing_rate IS NOT DISTINCT FROM OLD.billing_rate
     AND NEW.classification IS NOT DISTINCT FROM OLD.classification
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.work_date IS NOT DISTINCT FROM OLD.work_date
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.support_ticket_id IS NOT DISTINCT FROM OLD.support_ticket_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  IF OLD.billing_status = 'billed'::billing_status
     OR OLD.invoice_id IS NOT NULL
     OR OLD.billed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Billed time entries cannot be changed after approval. Reverse or credit the invoice first.';
  END IF;

  NEW.approval_status := 'pending'::approval_status;
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  IF NEW.billing_status = 'ready'::billing_status THEN
    NEW.billing_status := 'unbilled'::billing_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_time_entry_reapproval ON public.time_entries;
CREATE TRIGGER trg_require_time_entry_reapproval
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.require_time_entry_reapproval();

CREATE OR REPLACE FUNCTION public.require_direct_cost_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.billable_amount IS NOT DISTINCT FROM OLD.billable_amount
     AND NEW.internal_cost IS NOT DISTINCT FROM OLD.internal_cost
     AND NEW.markup_pct IS NOT DISTINCT FROM OLD.markup_pct
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.cost_category IS NOT DISTINCT FROM OLD.cost_category
     AND NEW.cost_date IS NOT DISTINCT FROM OLD.cost_date
     AND NEW.vendor IS NOT DISTINCT FROM OLD.vendor
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.support_ticket_id IS NOT DISTINCT FROM OLD.support_ticket_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  IF OLD.billing_status = 'billed'::billing_status
     OR OLD.invoice_id IS NOT NULL
     OR OLD.billed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Billed costs cannot be changed after approval. Reverse or credit the invoice first.';
  END IF;

  NEW.approval_status := 'pending'::approval_status;
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  IF NEW.billing_status = 'ready'::billing_status THEN
    NEW.billing_status := 'unbilled'::billing_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_direct_cost_reapproval ON public.direct_costs;
CREATE TRIGGER trg_require_direct_cost_reapproval
BEFORE UPDATE ON public.direct_costs
FOR EACH ROW
EXECUTE FUNCTION public.require_direct_cost_reapproval();

CREATE OR REPLACE FUNCTION public.require_additional_work_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.estimated_hours IS NOT DISTINCT FROM OLD.estimated_hours
     AND NEW.estimated_amount IS NOT DISTINCT FROM OLD.estimated_amount
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.support_ticket_id IS NOT DISTINCT FROM OLD.support_ticket_id
     AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  NEW.approval_status := 'pending'::approval_status;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.review_notes := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_additional_work_reapproval ON public.additional_work_requests;
CREATE TRIGGER trg_require_additional_work_reapproval
BEFORE UPDATE ON public.additional_work_requests
FOR EACH ROW
EXECUTE FUNCTION public.require_additional_work_reapproval();

CREATE OR REPLACE FUNCTION public.require_project_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.customer_approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_approval_status IS DISTINCT FROM OLD.customer_approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.fixed_fee IS NOT DISTINCT FROM OLD.fixed_fee
     AND NEW.estimated_billing_amount IS NOT DISTINCT FROM OLD.estimated_billing_amount
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.uses_milestone_billing IS NOT DISTINCT FROM OLD.uses_milestone_billing THEN
    RETURN NEW;
  END IF;

  IF OLD.billing_status = 'billed'::billing_status OR OLD.status = 'billed'::project_status THEN
    RAISE EXCEPTION 'Billed projects cannot be changed after approval. Reverse or credit the invoice first.';
  END IF;

  NEW.customer_approval_status := 'pending'::approval_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_project_reapproval ON public.projects;
CREATE TRIGGER trg_require_project_reapproval
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.require_project_reapproval();

CREATE OR REPLACE FUNCTION public.require_milestone_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.completed IS NOT DISTINCT FROM OLD.completed THEN
    RETURN NEW;
  END IF;

  IF OLD.billing_status = 'billed'::billing_status OR OLD.invoice_line_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Billed milestones cannot be changed after approval. Reverse or credit the invoice first.';
  END IF;

  NEW.approval_status := 'pending'::approval_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_milestone_reapproval ON public.project_milestones;
CREATE TRIGGER trg_require_milestone_reapproval
BEFORE UPDATE ON public.project_milestones
FOR EACH ROW
EXECUTE FUNCTION public.require_milestone_reapproval();

CREATE OR REPLACE FUNCTION public.require_contract_modification_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.modification_summary IS NOT DISTINCT FROM OLD.modification_summary
     AND NEW.effective_date IS NOT DISTINCT FROM OLD.effective_date THEN
    RETURN NEW;
  END IF;

  NEW.approval_status := 'pending'::approval_status;
  NEW.approved_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_contract_modification_reapproval ON public.contract_modifications;
CREATE TRIGGER trg_require_contract_modification_reapproval
BEFORE UPDATE ON public.contract_modifications
FOR EACH ROW
EXECUTE FUNCTION public.require_contract_modification_reapproval();

CREATE OR REPLACE FUNCTION public.require_invoice_rereview_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.reviewed_at IS NULL OR NEW.status = 'canceled'::invoice_status THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.invoice_date IS NOT DISTINCT FROM OLD.invoice_date
     AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
     AND NEW.billing_period_start IS NOT DISTINCT FROM OLD.billing_period_start
     AND NEW.billing_period_end IS NOT DISTINCT FROM OLD.billing_period_end
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount
     AND NEW.credits IS NOT DISTINCT FROM OLD.credits
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount THEN
    RETURN NEW;
  END IF;

  NEW.status := 'draft'::invoice_status;
  NEW.reviewed_at := NULL;
  NEW.reviewed_by := NULL;
  NEW.review_notes := NULL;
  NEW.sent_at := NULL;
  NEW.sent_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_invoice_rereview_after_change ON public.invoices;
DROP TRIGGER IF EXISTS trg_a_require_invoice_rereview_after_change ON public.invoices;
CREATE TRIGGER trg_a_require_invoice_rereview_after_change
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.require_invoice_rereview_after_change();

CREATE OR REPLACE FUNCTION public.reopen_reviewed_invoice_on_line_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid := coalesce(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE public.invoices
  SET
    status = 'draft'::invoice_status,
    reviewed_at = NULL,
    reviewed_by = NULL,
    review_notes = NULL,
    sent_at = NULL,
    sent_by = NULL,
    updated_at = now()
  WHERE id = v_invoice_id
    AND reviewed_at IS NOT NULL
    AND status IS DISTINCT FROM 'canceled'::invoice_status;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_reviewed_invoice_on_line_change ON public.invoice_line_items;
CREATE TRIGGER trg_reopen_reviewed_invoice_on_line_change
BEFORE INSERT OR UPDATE OR DELETE
ON public.invoice_line_items
FOR EACH ROW
EXECUTE FUNCTION public.reopen_reviewed_invoice_on_line_change();

CREATE OR REPLACE FUNCTION public.require_ticket_reapproval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.billable_approval_status IS DISTINCT FROM 'approved'::approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.billable_approval_status IS DISTINCT FROM OLD.billable_approval_status THEN
    RETURN NEW;
  END IF;

  IF NEW.classification IS NOT DISTINCT FROM OLD.classification
     AND NEW.completion_notes IS NOT DISTINCT FROM OLD.completion_notes
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id THEN
    RETURN NEW;
  END IF;

  NEW.billable_approval_status := 'pending'::approval_status;
  NEW.billable_approved_by := NULL;
  NEW.billable_approved_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_ticket_reapproval ON public.support_tickets;
CREATE TRIGGER trg_require_ticket_reapproval
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.require_ticket_reapproval();

REVOKE ALL ON FUNCTION public.prevent_payment_on_canceled_invoice() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_time_entry_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_direct_cost_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_additional_work_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_project_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_milestone_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_contract_modification_reapproval() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_invoice_rereview_after_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_reviewed_invoice_on_line_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_ticket_reapproval() FROM PUBLIC;
