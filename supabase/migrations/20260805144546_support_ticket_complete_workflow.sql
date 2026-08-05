-- Complete-ticket workflow: columns, RPCs, guards (delete/reopen/customer edits),
-- and billing readiness constraints for support tickets.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS no_time_explanation text,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reopen_reason text;

COMMENT ON COLUMN public.support_tickets.no_time_explanation IS
  'Required when completing a ticket with zero recorded time entries.';
COMMENT ON COLUMN public.support_tickets.reopen_reason IS
  'Manager-recorded reason when deliberately reopening a completed ticket.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ticket_recorded_effort_hours(p_ticket_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(hours_worked), 0)::numeric
  FROM public.time_entries
  WHERE support_ticket_id = p_ticket_id;
$$;

CREATE OR REPLACE FUNCTION public.ticket_has_work_description(p_ticket_id uuid, p_extra text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(length(btrim(p_extra)), 0) > 0
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = p_ticket_id
        AND coalesce(length(btrim(t.technician_notes)), 0) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.time_entries e
      WHERE e.support_ticket_id = p_ticket_id
        AND coalesce(length(btrim(e.description)), 0) > 0
    );
$$;

-- ---------------------------------------------------------------------------
-- Complete ticket (assigned technician only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_support_ticket(
  p_ticket_id uuid,
  p_completion_notes text,
  p_customer_resolution_summary text,
  p_work_description text DEFAULT NULL,
  p_no_time_explanation text DEFAULT NULL
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
  v_hours numeric;
  v_notes text;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to complete a ticket.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'technician'::user_role THEN
    RAISE EXCEPTION 'Only the assigned technician can mark a ticket complete.';
  END IF;

  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found.';
  END IF;

  IF v_ticket.assigned_technician_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the assigned technician can mark this ticket complete.';
  END IF;

  IF v_ticket.status IN ('resolved'::ticket_status, 'closed'::ticket_status, 'canceled'::ticket_status) THEN
    RAISE EXCEPTION 'This ticket is already completed or canceled.';
  END IF;

  IF coalesce(length(btrim(p_completion_notes)), 0) = 0 THEN
    RAISE EXCEPTION 'Completion notes are required.';
  END IF;

  IF coalesce(length(btrim(p_customer_resolution_summary)), 0) = 0 THEN
    RAISE EXCEPTION 'A customer-visible resolution summary is required.';
  END IF;

  -- Append optional work description into technician notes history (preserve prior notes).
  v_notes := v_ticket.technician_notes;
  IF coalesce(length(btrim(p_work_description)), 0) > 0 THEN
    v_notes := CASE
      WHEN coalesce(length(btrim(v_notes)), 0) > 0 THEN
        v_notes || E'\n\n' || '[' || to_char(v_now, 'Mon DD, YYYY HH12:MI AM') || '] ' || btrim(p_work_description)
      ELSE
        '[' || to_char(v_now, 'Mon DD, YYYY HH12:MI AM') || '] ' || btrim(p_work_description)
    END;
  END IF;

  IF NOT public.ticket_has_work_description(p_ticket_id, p_work_description)
     AND coalesce(length(btrim(v_notes)), 0) = 0 THEN
    RAISE EXCEPTION 'A description of work performed is required before completing the ticket.';
  END IF;

  v_hours := public.ticket_recorded_effort_hours(p_ticket_id);
  IF v_hours <= 0 AND coalesce(length(btrim(p_no_time_explanation)), 0) = 0 THEN
    RAISE EXCEPTION 'Recorded effort must be greater than zero, or provide an explanation for why no time was recorded.';
  END IF;

  -- Out-of-scope work cannot be treated as billable without approval.
  IF v_ticket.classification = 'out_of_scope'::work_classification
     AND coalesce(v_ticket.billable_approval_status, 'pending'::approval_status) IS DISTINCT FROM 'approved'::approval_status
     AND coalesce(v_ticket.billable_approval_status, 'pending'::approval_status) IS DISTINCT FROM 'not_required'::approval_status THEN
    -- Allow completion while keeping unbillable; do not auto-promote to billable.
    NULL;
  END IF;

  IF v_ticket.classification = 'billable'::work_classification
     AND coalesce(v_ticket.billable_approval_status, 'pending'::approval_status) NOT IN (
       'approved'::approval_status,
       'not_required'::approval_status
     ) THEN
    RAISE EXCEPTION 'Billable/out-of-scope work must be approved before it can be treated as ready to bill on completion.';
  END IF;

  -- Ensure any out_of_scope time entries stay pending (never silently billable).
  UPDATE public.time_entries
  SET
    approval_status = CASE
      WHEN classification = 'out_of_scope'::work_classification
           AND approval_status = 'approved'::approval_status THEN approval_status
      WHEN classification = 'out_of_scope'::work_classification
           AND approval_status IS DISTINCT FROM 'approved'::approval_status THEN 'pending'::approval_status
      ELSE approval_status
    END,
    billing_status = CASE
      WHEN classification = 'out_of_scope'::work_classification
           AND approval_status IS DISTINCT FROM 'approved'::approval_status THEN 'unbilled'::billing_status
      ELSE billing_status
    END
  WHERE support_ticket_id = p_ticket_id
    AND classification = 'out_of_scope'::work_classification
    AND approval_status IS DISTINCT FROM 'approved'::approval_status;

  UPDATE public.support_tickets
  SET
    status = 'resolved'::ticket_status,
    completed_at = v_now,
    completed_by = v_uid,
    completion_notes = btrim(p_completion_notes),
    customer_resolution_summary = btrim(p_customer_resolution_summary),
    technician_notes = v_notes,
    no_time_explanation = CASE
      WHEN v_hours <= 0 THEN btrim(p_no_time_explanation)
      ELSE NULL
    END,
    updated_at = v_now
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$$;

-- ---------------------------------------------------------------------------
-- Manager reopen (deliberate + recorded)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_support_ticket(
  p_ticket_id uuid,
  p_reason text
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_uid uuid := auth.uid();
  v_ticket public.support_tickets;
  v_now timestamptz := now();
  v_notes text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to reopen a ticket.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'manager'::user_role THEN
    RAISE EXCEPTION 'Only managers can reopen completed tickets.';
  END IF;

  IF coalesce(length(btrim(p_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'Provide a clear reopen reason (at least a short sentence).';
  END IF;

  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found.';
  END IF;

  IF v_ticket.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status) THEN
    RAISE EXCEPTION 'Only resolved or closed tickets can be reopened.';
  END IF;

  v_notes := CASE
    WHEN coalesce(length(btrim(v_ticket.technician_notes)), 0) > 0 THEN
      v_ticket.technician_notes || E'\n\n' || '[' || to_char(v_now, 'Mon DD, YYYY HH12:MI AM')
        || '] REOPENED by manager: ' || btrim(p_reason)
    ELSE
      '[' || to_char(v_now, 'Mon DD, YYYY HH12:MI AM') || '] REOPENED by manager: ' || btrim(p_reason)
  END;

  UPDATE public.support_tickets
  SET
    status = CASE
      WHEN assigned_technician_id IS NULL THEN 'assigned'::ticket_status
      ELSE 'in_progress'::ticket_status
    END,
    completed_at = NULL,
    completed_by = NULL,
    customer_confirmed = false,
    reopened_at = v_now,
    reopened_by = v_uid,
    reopen_reason = btrim(p_reason),
    technician_notes = v_notes,
    updated_at = v_now
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row guards: completion path, customer edits, reopen recording
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_support_ticket_update_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := public.current_user_role();
  v_hours numeric;
BEGIN
  -- Customers: only confirmation / close of their own resolved tickets.
  IF v_role = 'customer'::user_role THEN
    IF NEW.completion_notes IS DISTINCT FROM OLD.completion_notes
       OR NEW.technician_notes IS DISTINCT FROM OLD.technician_notes
       OR NEW.no_time_explanation IS DISTINCT FROM OLD.no_time_explanation
       OR NEW.assigned_technician_id IS DISTINCT FROM OLD.assigned_technician_id
       OR NEW.classification IS DISTINCT FROM OLD.classification
       OR NEW.billable_approval_status IS DISTINCT FROM OLD.billable_approval_status
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
       OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
       OR NEW.reopened_by IS DISTINCT FROM OLD.reopened_by
       OR NEW.reopen_reason IS DISTINCT FROM OLD.reopen_reason
    THEN
      RAISE EXCEPTION 'Customers cannot edit internal completion or technician notes.';
    END IF;

    -- Customers may confirm resolution (resolved -> closed) and set customer_confirmed.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         OLD.status = 'resolved'::ticket_status
         AND NEW.status = 'closed'::ticket_status
         AND NEW.customer_confirmed IS TRUE
       )
    THEN
      RAISE EXCEPTION 'Customers can only confirm and close resolved tickets.';
    END IF;

    RETURN NEW;
  END IF;

  -- Technicians cannot complete via a bare status change — must use complete_support_ticket.
  IF v_role = 'technician'::user_role THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
       AND (
         NEW.completed_by IS DISTINCT FROM auth.uid()
         OR NEW.completed_at IS NULL
         OR coalesce(length(btrim(NEW.completion_notes)), 0) = 0
         OR coalesce(length(btrim(NEW.customer_resolution_summary)), 0) = 0
       )
    THEN
      RAISE EXCEPTION 'Use Mark Work Complete to resolve this ticket. Completion notes and a customer resolution summary are required.';
    END IF;

    IF NEW.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
       AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_hours := public.ticket_recorded_effort_hours(NEW.id);
      IF v_hours <= 0 AND coalesce(length(btrim(NEW.no_time_explanation)), 0) = 0 THEN
        RAISE EXCEPTION 'Recorded effort must be greater than zero, or provide an explanation for why no time was recorded.';
      END IF;
      IF NOT public.ticket_has_work_description(NEW.id, NEW.technician_notes) THEN
        RAISE EXCEPTION 'A description of work performed is required before completing the ticket.';
      END IF;
    END IF;

    -- Technicians cannot reopen completed tickets.
    IF OLD.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
       AND NEW.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status, 'canceled'::ticket_status) THEN
      RAISE EXCEPTION 'Only a manager can deliberately reopen a completed ticket.';
    END IF;
  END IF;

  -- Managers: reopening must record reason + timestamp in the same update.
  IF v_role = 'manager'::user_role THEN
    IF OLD.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
       AND NEW.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status, 'canceled'::ticket_status)
    THEN
      IF NEW.reopened_at IS NULL
         OR NEW.reopened_by IS NULL
         OR coalesce(length(btrim(NEW.reopen_reason)), 0) < 10 THEN
        RAISE EXCEPTION 'Reopening a completed ticket requires a recorded reason. Use the reopen action.';
      END IF;
    END IF;
  END IF;

  -- Billing role: read-oriented; block ticket mutations.
  IF v_role = 'billing'::user_role THEN
    RAISE EXCEPTION 'Billing users cannot modify support tickets.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_support_ticket_update_guards ON public.support_tickets;
CREATE TRIGGER trg_enforce_support_ticket_update_guards
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_support_ticket_update_guards();

-- ---------------------------------------------------------------------------
-- Prevent deletes (especially completed tickets) for ordinary users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_support_ticket_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'Support tickets cannot be permanently deleted. Cancel or archive through an authorized workflow instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_support_ticket_delete ON public.support_tickets;
CREATE TRIGGER trg_prevent_support_ticket_delete
  BEFORE DELETE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_support_ticket_delete();

REVOKE DELETE ON public.support_tickets FROM PUBLIC;
REVOKE DELETE ON public.support_tickets FROM anon;
REVOKE DELETE ON public.support_tickets FROM authenticated;

-- ---------------------------------------------------------------------------
-- Privileges for RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.complete_support_ticket(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_support_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_support_ticket(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.ticket_recorded_effort_hours(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ticket_has_work_description(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticket_recorded_effort_hours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ticket_has_work_description(uuid, text) TO authenticated;
