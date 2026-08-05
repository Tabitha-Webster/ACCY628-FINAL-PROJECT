-- Support tickets + technician workspace
-- Reuses existing customers, contracts, and profiles when present.
-- Does not recreate auth.users. Organization scope = customers via profiles.customer_id.
-- Role scope = profiles.role (manager | technician | billing | customer).

-- ---------------------------------------------------------------------------
-- 0) Prerequisites (create only if missing — never drop/replace teammate tables)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    CREATE TABLE public.customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
      email text,
      full_name text,
      role text NOT NULL DEFAULT 'customer'
        CHECK (role IN ('manager', 'technician', 'billing', 'customer')),
      customer_id uuid REFERENCES public.customers (id),
      internal_cost_rate numeric(12, 2),
      is_demo_user boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.contracts') IS NULL THEN
    CREATE TABLE public.contracts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id uuid NOT NULL REFERENCES public.customers (id),
      contract_number text,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      sla_response_hours numeric(10, 2),
      sla_resolution_hours numeric(10, 2),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Optional organization table is used only when a teammate already created it.
-- Tickets still key off customers; profiles.customer_id is the customer-org link.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 1) support_tickets
-- Column names match the existing ServiceSync app.
-- Plain-English aliases from the assignment brief are noted in comments.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ticket_number filled by trigger; enforced NOT NULL after sequence setup
  ticket_number text,
  customer_id uuid NOT NULL REFERENCES public.customers (id),
  contract_id uuid REFERENCES public.contracts (id),
  project_id uuid,
  -- request_title
  title text NOT NULL,
  -- request_description
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  -- issue_category
  service_category text,
  status text NOT NULL DEFAULT 'new',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES public.profiles (id),
  assigned_technician_id uuid REFERENCES public.profiles (id),
  assigned_at timestamptz,
  -- response_due_at
  target_response_at timestamptz,
  -- resolution_due_at
  target_resolution_at timestamptz,
  actual_response_at timestamptz,
  -- completion_date
  completed_at timestamptz,
  -- technician_work_notes
  technician_notes text,
  completion_notes text,
  -- customer_visible_resolution
  customer_resolution_summary text,
  -- included_or_billable
  classification text,
  billable_approval_status text,
  -- customer_confirmation
  customer_confirmed boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  updated_by uuid REFERENCES public.profiles (id),
  archived_at timestamptz,
  archived_by uuid REFERENCES public.profiles (id)
);

-- Upgrade path when an older support_tickets table already exists
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS ticket_number text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS contract_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS service_category text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS submitted_by uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_technician_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS target_response_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS target_resolution_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS actual_response_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS technician_notes text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS completion_notes text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS customer_resolution_summary text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS classification text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS billable_approval_status text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS customer_confirmed boolean;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Defaults for upgraded rows / new inserts
ALTER TABLE public.support_tickets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.support_tickets ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE public.support_tickets ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE public.support_tickets ALTER COLUMN submitted_at SET DEFAULT now();
ALTER TABLE public.support_tickets ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.support_tickets ALTER COLUMN updated_at SET DEFAULT now();

-- Foreign keys (add only when missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_customer_id_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_contract_id_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_assigned_technician_id_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_assigned_technician_id_fkey
      FOREIGN KEY (assigned_technician_id) REFERENCES public.profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_submitted_by_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_submitted_by_fkey
      FOREIGN KEY (submitted_by) REFERENCES public.profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_created_by_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_updated_by_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.profiles (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_archived_by_fkey'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_archived_by_fkey
      FOREIGN KEY (archived_by) REFERENCES public.profiles (id);
  END IF;
END $$;

-- Validation constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_title_not_blank'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_title_not_blank
      CHECK (length(btrim(title)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_description_not_blank'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_description_not_blank
      CHECK (length(btrim(description)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_priority_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_priority_check
      CHECK (priority IN ('low', 'medium', 'high', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_status_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_status_check
      CHECK (
        status IN (
          'new',
          'assigned',
          'in_progress',
          'waiting_on_customer',
          'waiting_on_approval',
          'resolved',
          'closed',
          'canceled'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_service_category_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_service_category_check
      CHECK (
        service_category IS NULL
        OR service_category IN (
          'Password Reset',
          'Email',
          'Network',
          'Printer',
          'Hardware',
          'Software',
          'Security',
          'Server',
          'Cloud Services',
          'Other'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_classification_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_classification_check
      CHECK (
        classification IS NULL
        OR classification IN ('included', 'billable', 'out_of_scope')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_billable_approval_status_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_billable_approval_status_check
      CHECK (
        billable_approval_status IS NULL
        OR billable_approval_status IN ('not_required', 'pending', 'approved', 'rejected')
      );
  END IF;
END $$;

-- Unique ticket numbers (allow multiple nulls only during upgrade fill)
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_number_key
  ON public.support_tickets (ticket_number);

CREATE INDEX IF NOT EXISTS support_tickets_customer_id_idx
  ON public.support_tickets (customer_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_technician_id_idx
  ON public.support_tickets (assigned_technician_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_archived_at_idx
  ON public.support_tickets (archived_at);

COMMENT ON TABLE public.support_tickets IS
  'Customer support requests and technician workspace tickets. Soft-delete via archived_at.';
COMMENT ON COLUMN public.support_tickets.title IS 'Request title (assignment alias: request_title)';
COMMENT ON COLUMN public.support_tickets.description IS 'Request description (assignment alias: request_description)';
COMMENT ON COLUMN public.support_tickets.service_category IS 'Issue category (assignment alias: issue_category)';
COMMENT ON COLUMN public.support_tickets.target_response_at IS 'SLA response due (assignment alias: response_due_at)';
COMMENT ON COLUMN public.support_tickets.target_resolution_at IS 'SLA resolution due (assignment alias: resolution_due_at)';
COMMENT ON COLUMN public.support_tickets.completed_at IS 'Completion timestamp (assignment alias: completion_date)';
COMMENT ON COLUMN public.support_tickets.technician_notes IS 'Internal tech notes (assignment alias: technician_work_notes)';
COMMENT ON COLUMN public.support_tickets.customer_resolution_summary IS 'Customer-visible resolution (assignment alias: customer_visible_resolution)';
COMMENT ON COLUMN public.support_tickets.classification IS 'Included vs billable (assignment alias: included_or_billable)';
COMMENT ON COLUMN public.support_tickets.customer_confirmed IS 'Customer confirmation (assignment alias: customer_confirmation)';

-- ---------------------------------------------------------------------------
-- 2) Readable ticket numbers: TKT-1001, TKT-1002, ...
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION private.next_support_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.support_ticket_number_seq');
  RETURN 'TKT-' || n::text;
END;
$$;

CREATE OR REPLACE FUNCTION private.set_support_ticket_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  sla_response numeric;
  sla_resolution numeric;
BEGIN
  IF NEW.ticket_number IS NULL OR btrim(NEW.ticket_number) = '' THEN
    NEW.ticket_number := private.next_support_ticket_number();
  END IF;

  IF NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  IF NEW.submitted_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.submitted_by := auth.uid();
  END IF;

  IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  -- Populate SLA due dates from the linked contract when available
  IF NEW.contract_id IS NOT NULL
     AND (NEW.target_response_at IS NULL OR NEW.target_resolution_at IS NULL) THEN
    SELECT c.sla_response_hours, c.sla_resolution_hours
      INTO sla_response, sla_resolution
    FROM public.contracts c
    WHERE c.id = NEW.contract_id;

    IF NEW.target_response_at IS NULL AND sla_response IS NOT NULL AND sla_response >= 0 THEN
      NEW.target_response_at := NEW.submitted_at + (sla_response::text || ' hours')::interval;
    END IF;
    IF NEW.target_resolution_at IS NULL AND sla_resolution IS NOT NULL AND sla_resolution >= 0 THEN
      NEW.target_resolution_at := NEW.submitted_at + (sla_resolution::text || ' hours')::interval;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_insert
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION private.set_support_ticket_defaults();

CREATE OR REPLACE FUNCTION private.touch_support_ticket_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;

  -- Track assignment time
  IF NEW.assigned_technician_id IS DISTINCT FROM OLD.assigned_technician_id
     AND NEW.assigned_technician_id IS NOT NULL
     AND NEW.assigned_at IS NULL THEN
    NEW.assigned_at := now();
  END IF;

  IF NEW.assigned_technician_id IS NOT NULL
     AND NEW.status = 'new'
     AND OLD.status = 'new' THEN
    NEW.status := 'assigned';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_before_update ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_update
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_support_ticket_updated();

-- Backfill empty ticket numbers for any pre-existing rows
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.support_tickets
    WHERE ticket_number IS NULL OR btrim(ticket_number) = ''
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.support_tickets
    SET ticket_number = private.next_support_ticket_number()
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_number SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Technician workspace assignment journal (optional companion table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.technician_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES public.profiles (id),
  support_ticket_id uuid REFERENCES public.support_tickets (id),
  project_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS technician_assignments_technician_id_idx
  ON public.technician_assignments (technician_id);
CREATE INDEX IF NOT EXISTS technician_assignments_support_ticket_id_idx
  ON public.technician_assignments (support_ticket_id);

ALTER TABLE public.technician_assignments ENABLE ROW LEVEL SECURITY;

-- Non-negative time/cost guards on related workspace tables when they exist
DO $$
BEGIN
  IF to_regclass('public.time_entries') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_hours_worked_nonnegative'
    ) THEN
      ALTER TABLE public.time_entries
        ADD CONSTRAINT time_entries_hours_worked_nonnegative
        CHECK (hours_worked IS NULL OR hours_worked >= 0);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_internal_cost_rate_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.time_entries
          ADD CONSTRAINT time_entries_internal_cost_rate_nonnegative
          CHECK (internal_cost_rate IS NULL OR internal_cost_rate >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_billing_rate_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.time_entries
          ADD CONSTRAINT time_entries_billing_rate_nonnegative
          CHECK (billing_rate IS NULL OR billing_rate >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_labor_cost_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.time_entries
          ADD CONSTRAINT time_entries_labor_cost_nonnegative
          CHECK (labor_cost IS NULL OR labor_cost >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
  END IF;

  IF to_regclass('public.direct_costs') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'direct_costs_internal_cost_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.direct_costs
          ADD CONSTRAINT direct_costs_internal_cost_nonnegative
          CHECK (internal_cost IS NULL OR internal_cost >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'direct_costs_billable_amount_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.direct_costs
          ADD CONSTRAINT direct_costs_billable_amount_nonnegative
          CHECK (billable_amount IS NULL OR billable_amount >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
  END IF;

  IF to_regclass('public.additional_work_requests') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'additional_work_requests_estimated_hours_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.additional_work_requests
          ADD CONSTRAINT additional_work_requests_estimated_hours_nonnegative
          CHECK (estimated_hours IS NULL OR estimated_hours >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'additional_work_requests_estimated_amount_nonnegative'
    ) THEN
      BEGIN
        ALTER TABLE public.additional_work_requests
          ADD CONSTRAINT additional_work_requests_estimated_amount_nonnegative
          CHECK (estimated_amount IS NULL OR estimated_amount >= 0);
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Role helpers (private schema — security definer, fixed search_path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager' AND coalesce(is_active, true)
  )
$$;

CREATE OR REPLACE FUNCTION private.is_technician()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'technician' AND coalesce(is_active, true)
  )
$$;

CREATE OR REPLACE FUNCTION private.is_billing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'billing' AND coalesce(is_active, true)
  )
$$;

CREATE OR REPLACE FUNCTION private.is_customer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'customer' AND coalesce(is_active, true)
  )
$$;

REVOKE ALL ON FUNCTION private.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_customer_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_technician() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_billing() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_customer() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.next_support_ticket_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.set_support_ticket_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.touch_support_ticket_updated() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_customer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_technician() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_billing() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_customer() TO authenticated;

-- Soft-archive helper (no hard delete of completed work)
CREATE OR REPLACE FUNCTION public.archive_support_ticket(p_ticket_id uuid)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  result public.support_tickets;
BEGIN
  IF NOT private.is_manager() THEN
    RAISE EXCEPTION 'Only managers can archive support tickets';
  END IF;

  UPDATE public.support_tickets t
  SET
    archived_at = now(),
    archived_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE t.id = p_ticket_id
    AND t.archived_at IS NULL
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found or already archived';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_support_ticket(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_support_ticket(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_support_ticket(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Business-rule triggers (completion + billing note protection)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_support_ticket_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  actor_role text := private.current_profile_role();
BEGIN
  -- Billing users may not alter technician work notes
  IF actor_role = 'billing'
     AND NEW.technician_notes IS DISTINCT FROM OLD.technician_notes THEN
    RAISE EXCEPTION 'Billing users cannot change technician work notes';
  END IF;

  -- Only the assigned technician may mark a ticket complete / resolved
  IF (NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved')
     OR (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL) THEN
    IF auth.uid() IS DISTINCT FROM coalesce(NEW.assigned_technician_id, OLD.assigned_technician_id) THEN
      RAISE EXCEPTION 'Only the assigned technician can mark a ticket complete';
    END IF;
  END IF;

  -- Completed / resolved tickets must be archived, not hard-deleted (enforced via RLS DELETE deny)
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_enforce_rules ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_enforce_rules
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_support_ticket_rules();

CREATE OR REPLACE FUNCTION private.block_hard_delete_completed_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF OLD.completed_at IS NOT NULL
     OR OLD.status IN ('resolved', 'closed') THEN
    RAISE EXCEPTION
      'Completed tickets cannot be permanently deleted. Archive them instead with archive_support_ticket().';
  END IF;

  -- Ordinary users: no hard deletes at all (service_role / migrations still bypass via ownership)
  IF auth.uid() IS NOT NULL AND NOT private.is_manager() THEN
    RAISE EXCEPTION 'Hard delete is not allowed. Use archive_support_ticket() instead.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_block_hard_delete ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_block_hard_delete
  BEFORE DELETE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION private.block_hard_delete_completed_tickets();

-- ---------------------------------------------------------------------------
-- 6) Row Level Security — support_tickets
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select_customer ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_select_technician ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_select_manager ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_select_billing ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_insert_customer ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update_technician ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update_manager ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update_billing ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update_customer ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_delete_deny ON public.support_tickets;

-- Customers: view only their organization's tickets
CREATE POLICY support_tickets_select_customer
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    private.is_customer()
    AND customer_id = private.current_customer_id()
    AND archived_at IS NULL
  );

-- Technicians: view tickets assigned to them (and open unassigned queue for pickup)
CREATE POLICY support_tickets_select_technician
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    private.is_technician()
    AND archived_at IS NULL
    AND (
      assigned_technician_id = auth.uid()
      OR (assigned_technician_id IS NULL AND status IN ('new', 'assigned'))
    )
  );

-- Managers: view and manage all tickets (including archived)
CREATE POLICY support_tickets_select_manager
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (private.is_manager());

-- Billing: view completed or approved billable work
CREATE POLICY support_tickets_select_billing
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    private.is_billing()
    AND archived_at IS NULL
    AND (
      status IN ('resolved', 'closed')
      OR billable_approval_status = 'approved'
      OR classification = 'billable'
    )
  );

-- Customers: create tickets for their own organization
CREATE POLICY support_tickets_insert_customer
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_customer()
    AND customer_id = private.current_customer_id()
    AND (submitted_by IS NULL OR submitted_by = auth.uid())
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- Technicians: update only tickets assigned to them (or claim unassigned)
CREATE POLICY support_tickets_update_technician
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    private.is_technician()
    AND archived_at IS NULL
    AND (
      assigned_technician_id = auth.uid()
      OR assigned_technician_id IS NULL
    )
  )
  WITH CHECK (
    private.is_technician()
    AND assigned_technician_id = auth.uid()
  );

-- Managers: assign and update all tickets
CREATE POLICY support_tickets_update_manager
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (private.is_manager())
  WITH CHECK (private.is_manager());

-- Billing: may update billing-related fields only (notes protected by trigger)
CREATE POLICY support_tickets_update_billing
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    private.is_billing()
    AND archived_at IS NULL
    AND (
      status IN ('resolved', 'closed')
      OR billable_approval_status IN ('pending', 'approved', 'rejected')
      OR classification = 'billable'
    )
  )
  WITH CHECK (private.is_billing());

-- Customers: confirm resolution / close their own tickets
CREATE POLICY support_tickets_update_customer
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    private.is_customer()
    AND customer_id = private.current_customer_id()
    AND archived_at IS NULL
  )
  WITH CHECK (
    private.is_customer()
    AND customer_id = private.current_customer_id()
  );

-- Ordinary users cannot hard-delete via the API (archive instead)
CREATE POLICY support_tickets_delete_deny
  ON public.support_tickets
  FOR DELETE
  TO authenticated
  USING (false);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.support_ticket_number_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS — technician_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS technician_assignments_select_own ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_select_manager ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_insert_manager ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_update_manager ON public.technician_assignments;
DROP POLICY IF EXISTS technician_assignments_update_own ON public.technician_assignments;

CREATE POLICY technician_assignments_select_own
  ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (
    private.is_technician() AND technician_id = auth.uid()
  );

CREATE POLICY technician_assignments_select_manager
  ON public.technician_assignments
  FOR SELECT
  TO authenticated
  USING (private.is_manager());

CREATE POLICY technician_assignments_insert_manager
  ON public.technician_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_manager() OR (private.is_technician() AND technician_id = auth.uid()));

CREATE POLICY technician_assignments_update_manager
  ON public.technician_assignments
  FOR UPDATE
  TO authenticated
  USING (private.is_manager())
  WITH CHECK (private.is_manager());

CREATE POLICY technician_assignments_update_own
  ON public.technician_assignments
  FOR UPDATE
  TO authenticated
  USING (private.is_technician() AND technician_id = auth.uid())
  WITH CHECK (private.is_technician() AND technician_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.technician_assignments TO authenticated;
