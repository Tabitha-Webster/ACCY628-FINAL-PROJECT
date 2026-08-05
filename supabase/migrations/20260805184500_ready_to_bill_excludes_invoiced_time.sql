-- Keep ticket Ready-to-Bill eligibility aligned with the duplicate-invoice control.

CREATE OR REPLACE FUNCTION public.time_entry_ticket_billing_eligible(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.time_entries e
    JOIN public.support_tickets t ON t.id = e.support_ticket_id
    WHERE e.id = p_entry_id
      AND e.support_ticket_id IS NOT NULL
      AND e.technician_id IS NOT NULL
      AND e.customer_id IS NOT NULL
      AND e.contract_id IS NOT NULL
      AND e.customer_id = t.customer_id
      AND (t.contract_id IS NULL OR e.contract_id = t.contract_id)
      AND e.classification = 'billable'::work_classification
      AND e.billing_status IN ('unbilled'::billing_status, 'ready'::billing_status)
      AND e.invoice_id IS NULL
      AND e.invoice_line_item_id IS NULL
      AND e.billed_at IS NULL
      AND NOT public.time_entry_already_invoiced(e.id)
      AND e.approval_status IN ('approved'::approval_status, 'not_required'::approval_status)
      AND coalesce(length(btrim(e.description)), 0) > 0
      AND e.hours_worked > 0
      AND coalesce(e.billing_rate, 0) > 0
      AND coalesce(length(btrim(t.completion_notes)), 0) > 0
      AND coalesce(length(btrim(t.technician_notes)), 0) + coalesce(length(btrim(e.description)), 0) > 0
      AND (
        t.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
        OR e.approval_status = 'approved'::approval_status
        OR t.billable_approval_status = 'approved'::approval_status
      )
      AND public.contract_valid_for_work_date(e.contract_id, e.work_date)
  );
$$;
