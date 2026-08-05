-- Ticket work ↔ billing eligibility
-- Adds approval/billed audit fields and a reliable Ready-to-Bill source for ticket-linked work.
-- Does not auto-generate invoices.

-- ---------------------------------------------------------------------------
-- Fields (reuse existing billing_status / approval_status / billable_approval_status)
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

ALTER TABLE public.direct_costs
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS billable_approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS billable_approved_at timestamptz;

COMMENT ON COLUMN public.time_entries.approved_by IS 'Manager who approved this entry for billing (OOS / billable approval).';
COMMENT ON COLUMN public.time_entries.billed_at IS 'When this entry was connected to an invoice.';
COMMENT ON COLUMN public.time_entries.invoice_id IS 'Invoice that billed this entry (also linked via invoice_line_item_id).';

-- ---------------------------------------------------------------------------
-- Contract date validity helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_valid_for_work_date(p_contract_id uuid, p_work_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.status IS DISTINCT FROM 'canceled'::contract_status
      AND c.start_date <= p_work_date
      AND (c.end_date IS NULL OR c.end_date >= p_work_date)
  );
$$;

-- ---------------------------------------------------------------------------
-- Eligibility predicates (single source of truth)
-- ---------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.direct_cost_ticket_billing_eligible(p_cost_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.direct_costs d
    JOIN public.support_tickets t ON t.id = d.support_ticket_id
    WHERE d.id = p_cost_id
      AND d.support_ticket_id IS NOT NULL
      AND d.entered_by IS NOT NULL
      AND d.customer_id IS NOT NULL
      AND d.contract_id IS NOT NULL
      AND d.customer_id = t.customer_id
      AND (t.contract_id IS NULL OR d.contract_id = t.contract_id)
      AND d.billing_status IN ('unbilled'::billing_status, 'ready'::billing_status)
      AND d.invoice_id IS NULL
      AND d.invoice_line_item_id IS NULL
      AND d.billed_at IS NULL
      AND d.approval_status = 'approved'::approval_status
      AND coalesce(d.billable_amount, 0) > 0
      AND coalesce(length(btrim(d.description)), 0) > 0
      AND coalesce(length(btrim(t.completion_notes)), 0) > 0
      AND (
        t.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
        OR t.billable_approval_status = 'approved'::approval_status
      )
      AND public.contract_valid_for_work_date(d.contract_id, d.cost_date)
  );
$$;

-- ---------------------------------------------------------------------------
-- Ready-to-Bill views for ticket-linked work (security invoker → respects RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ticket_time_ready_to_bill
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.technician_id,
  e.customer_id,
  e.contract_id,
  e.support_ticket_id,
  e.work_date,
  e.hours_worked,
  e.billing_rate,
  e.description,
  e.work_category,
  e.classification,
  e.approval_status,
  e.billing_status,
  e.approved_by,
  e.approved_at,
  e.invoice_id,
  e.billed_at,
  t.ticket_number,
  t.status AS ticket_status,
  t.completion_notes,
  t.billable_approval_status AS ticket_billable_approval_status,
  c.contract_number,
  c.name AS contract_name,
  cust.name AS customer_name,
  p.full_name AS technician_name,
  (e.hours_worked * coalesce(e.billing_rate, 0)) AS amount
FROM public.time_entries e
JOIN public.support_tickets t ON t.id = e.support_ticket_id
JOIN public.contracts c ON c.id = e.contract_id
JOIN public.customers cust ON cust.id = e.customer_id
JOIN public.profiles p ON p.id = e.technician_id
WHERE public.time_entry_ticket_billing_eligible(e.id);

CREATE OR REPLACE VIEW public.v_ticket_cost_ready_to_bill
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.entered_by AS technician_id,
  d.customer_id,
  d.contract_id,
  d.support_ticket_id,
  d.cost_date,
  d.cost_category,
  d.vendor,
  d.billable_amount,
  d.description,
  d.approval_status,
  d.billing_status,
  d.approved_by,
  d.approved_at,
  d.invoice_id,
  d.billed_at,
  t.ticket_number,
  t.status AS ticket_status,
  t.completion_notes,
  c.contract_number,
  c.name AS contract_name,
  cust.name AS customer_name,
  p.full_name AS technician_name,
  d.billable_amount AS amount
FROM public.direct_costs d
JOIN public.support_tickets t ON t.id = d.support_ticket_id
JOIN public.contracts c ON c.id = d.contract_id
JOIN public.customers cust ON cust.id = d.customer_id
LEFT JOIN public.profiles p ON p.id = d.entered_by
WHERE public.direct_cost_ticket_billing_eligible(d.id);

GRANT SELECT ON public.v_ticket_time_ready_to_bill TO authenticated;
GRANT SELECT ON public.v_ticket_cost_ready_to_bill TO authenticated;

-- ---------------------------------------------------------------------------
-- Manager: approve ticket-linked OOS / pending work for billing
-- Reclassifies out_of_scope → billable only after approval.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_time_entry_for_billing(p_entry_id uuid)
RETURNS public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := public.current_user_role();
  v_uid uuid := auth.uid();
  v_entry public.time_entries;
  v_rate numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF v_role IS DISTINCT FROM 'manager'::user_role AND v_role IS DISTINCT FROM 'billing'::user_role THEN
    RAISE EXCEPTION 'Only managers or billing can approve work for billing.';
  END IF;

  SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time entry not found.';
  END IF;

  IF v_entry.billing_status = 'billed'::billing_status OR v_entry.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'This time entry has already been billed.';
  END IF;

  IF coalesce(length(btrim(v_entry.description)), 0) = 0 THEN
    RAISE EXCEPTION 'A work description is required before billing approval.';
  END IF;

  IF v_entry.contract_id IS NOT NULL THEN
    SELECT additional_hourly_rate INTO v_rate FROM public.contracts WHERE id = v_entry.contract_id;
  END IF;

  UPDATE public.time_entries
  SET
    classification = 'billable'::work_classification,
    approval_status = 'approved'::approval_status,
    approved_by = v_uid,
    approved_at = now(),
    billing_rate = CASE
      WHEN coalesce(billing_rate, 0) > 0 THEN billing_rate
      ELSE coalesce(v_rate, billing_rate)
    END,
    billing_status = CASE
      WHEN billing_status = 'unbilled'::billing_status THEN 'ready'::billing_status
      ELSE billing_status
    END,
    updated_at = now()
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  IF coalesce(v_entry.billing_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'Set a billing rate (or contract additional hourly rate) before approving for billing.';
  END IF;

  IF v_entry.support_ticket_id IS NOT NULL THEN
    UPDATE public.support_tickets
    SET
      billable_approval_status = 'approved'::approval_status,
      billable_approved_by = v_uid,
      billable_approved_at = now(),
      classification = CASE
        WHEN classification = 'out_of_scope'::work_classification THEN 'billable'::work_classification
        ELSE classification
      END,
      updated_at = now()
    WHERE id = v_entry.support_ticket_id;
  END IF;

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_direct_cost_for_billing(p_cost_id uuid)
RETURNS public.direct_costs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := public.current_user_role();
  v_uid uuid := auth.uid();
  v_cost public.direct_costs;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF v_role IS DISTINCT FROM 'manager'::user_role AND v_role IS DISTINCT FROM 'billing'::user_role THEN
    RAISE EXCEPTION 'Only managers or billing can approve costs for billing.';
  END IF;

  SELECT * INTO v_cost FROM public.direct_costs WHERE id = p_cost_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Direct cost not found.';
  END IF;

  IF v_cost.billing_status = 'billed'::billing_status OR v_cost.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'This direct cost has already been billed.';
  END IF;

  IF coalesce(v_cost.billable_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Set a billable amount greater than zero before approving.';
  END IF;

  UPDATE public.direct_costs
  SET
    approval_status = 'approved'::approval_status,
    approved_by = v_uid,
    approved_at = now(),
    billing_status = CASE
      WHEN billing_status = 'unbilled'::billing_status THEN 'ready'::billing_status
      ELSE billing_status
    END,
    updated_at = now()
  WHERE id = p_cost_id
  RETURNING * INTO v_cost;

  RETURN v_cost;
END;
$$;

-- Mark source rows billed after invoice connection (idempotent guard)
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
    AND invoice_line_item_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Time entry could not be marked billed (missing, already billed, or locked).';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_direct_cost_billed(
  p_cost_id uuid,
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
  UPDATE public.direct_costs
  SET
    billing_status = 'billed'::billing_status,
    invoice_id = p_invoice_id,
    invoice_line_item_id = p_line_item_id,
    billed_at = now(),
    updated_at = now()
  WHERE id = p_cost_id
    AND billing_status IN ('unbilled'::billing_status, 'ready'::billing_status)
    AND invoice_id IS NULL
    AND invoice_line_item_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Direct cost could not be marked billed (missing, already billed, or locked).';
  END IF;
END;
$$;

-- Sync billing_status to ready for currently eligible ticket rows (no invoice creation)
UPDATE public.time_entries e
SET billing_status = 'ready'::billing_status
WHERE e.billing_status = 'unbilled'::billing_status
  AND public.time_entry_ticket_billing_eligible(e.id);

UPDATE public.direct_costs d
SET billing_status = 'ready'::billing_status
WHERE d.billing_status = 'unbilled'::billing_status
  AND public.direct_cost_ticket_billing_eligible(d.id);

REVOKE ALL ON FUNCTION public.approve_time_entry_for_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_direct_cost_for_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_time_entry_billed(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_direct_cost_billed(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.time_entry_ticket_billing_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.direct_cost_ticket_billing_eligible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contract_valid_for_work_date(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_time_entry_for_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_direct_cost_for_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_time_entry_billed(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_direct_cost_billed(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.time_entry_ticket_billing_eligible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.direct_cost_ticket_billing_eligible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_valid_for_work_date(uuid, date) TO authenticated;
