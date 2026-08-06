-- Customer onboarding consistency: canonical status, signup linkage, role RLS.
-- Additive only — does not delete existing customer rows.

-- ---------------------------------------------------------------------------
-- 1) Status enum values (canonical field: customers.status)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'customer_status'
  ) THEN
    BEGIN
      ALTER TYPE public.customer_status ADD VALUE 'pending_approval';
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
      ALTER TYPE public.customer_status ADD VALUE 'rejected';
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS customer_status text,
  ADD COLUMN IF NOT EXISTS signup_at timestamptz;

-- Backfill signup_at from created_at when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'created_at'
  ) THEN
    EXECUTE $q$
      UPDATE public.customers
      SET signup_at = COALESCE(signup_at, created_at, now())
      WHERE signup_at IS NULL
    $q$;
  ELSE
    UPDATE public.customers
    SET signup_at = COALESCE(signup_at, now())
    WHERE signup_at IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customers_status_signup_at_idx
  ON public.customers (status, signup_at DESC);

-- Keep customer_status text in sync with canonical status.
CREATE OR REPLACE FUNCTION public.sync_customer_status_mirror()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT NULL THEN
    NEW.customer_status := NEW.status::text;
  END IF;
  IF NEW.signup_at IS NULL THEN
    NEW.signup_at := COALESCE(NEW.created_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_status_mirror ON public.customers;
CREATE TRIGGER trg_sync_customer_status_mirror
BEFORE INSERT OR UPDATE OF status ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_status_mirror();

-- ---------------------------------------------------------------------------
-- 2) Role helpers (SECURITY DEFINER) for RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role::text) FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_role() IN ('admin', 'manager')
$$;

CREATE OR REPLACE FUNCTION public.is_hr_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_role() = 'hr'
$$;

CREATE OR REPLACE FUNCTION public.is_billing_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_role() = 'billing'
$$;

CREATE OR REPLACE FUNCTION public.is_technician_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_role() = 'technician'
$$;

CREATE OR REPLACE FUNCTION public.is_customer_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.profile_role() = 'customer'
$$;

CREATE OR REPLACE FUNCTION public.linked_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.technician_can_view_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.customer_id = p_customer_id
        AND t.assigned_technician_id = auth.uid()
    ) THEN
      RETURN true;
    END IF;
  END IF;
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS policies (additive; drop/recreate named policies only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_admin_manager ON public.customers;
DROP POLICY IF EXISTS customers_update_admin_manager ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin_manager ON public.customers;
DROP POLICY IF EXISTS customers_select_hr_master ON public.customers;
DROP POLICY IF EXISTS customers_update_hr_master ON public.customers;
DROP POLICY IF EXISTS customers_insert_hr_master ON public.customers;
DROP POLICY IF EXISTS customers_select_billing_approved ON public.customers;
DROP POLICY IF EXISTS customers_select_technician_assigned ON public.customers;
DROP POLICY IF EXISTS customers_select_own_customer ON public.customers;
DROP POLICY IF EXISTS customers_insert_self_signup ON public.customers;

-- Replace older unrestricted admin/HR policies so role filters are not OR'd open.
DROP POLICY IF EXISTS customers_select_admin ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin ON public.customers;
DROP POLICY IF EXISTS customers_update_admin ON public.customers;
DROP POLICY IF EXISTS customers_select_hr ON public.customers;
DROP POLICY IF EXISTS customers_insert_hr ON public.customers;
DROP POLICY IF EXISTS customers_update_hr ON public.customers;

-- Admin + Manager: full visibility and approval updates
CREATE POLICY customers_select_admin_manager
ON public.customers FOR SELECT TO authenticated
USING (public.is_admin_or_manager());

CREATE POLICY customers_insert_admin_manager
ON public.customers FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_manager());

CREATE POLICY customers_update_admin_manager
ON public.customers FOR UPDATE TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- HR: Active + Inactive master data only (no pending/rejected queue)
CREATE POLICY customers_select_hr_master
ON public.customers FOR SELECT TO authenticated
USING (
  public.is_hr_role()
  AND lower(COALESCE(status::text, '')) IN ('active', 'inactive')
);

CREATE POLICY customers_insert_hr_master
ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  public.is_hr_role()
  AND lower(COALESCE(status::text, '')) IN ('active', 'inactive')
);

CREATE POLICY customers_update_hr_master
ON public.customers FOR UPDATE TO authenticated
USING (
  public.is_hr_role()
  AND lower(COALESCE(status::text, '')) IN ('active', 'inactive')
)
WITH CHECK (
  public.is_hr_role()
  AND lower(COALESCE(status::text, '')) IN ('active', 'inactive')
);

-- Billing: approved / active (and common billing statuses)
CREATE POLICY customers_select_billing_approved
ON public.customers FOR SELECT TO authenticated
USING (
  public.is_billing_role()
  AND lower(COALESCE(status::text, '')) IN ('active', 'on_hold', 'inactive')
);

-- Technician: approved customers tied to assigned tickets/contracts
CREATE POLICY customers_select_technician_assigned
ON public.customers FOR SELECT TO authenticated
USING (
  public.is_technician_role()
  AND lower(COALESCE(status::text, '')) = 'active'
  AND public.technician_can_view_customer(id)
);

-- Customer: own linked record only
CREATE POLICY customers_select_own_customer
ON public.customers FOR SELECT TO authenticated
USING (
  public.is_customer_role()
  AND id = public.linked_customer_id()
);

-- Self-signup insert (pending only) for authenticated customer-path users
CREATE POLICY customers_insert_self_signup
ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  lower(COALESCE(status::text, '')) = 'pending_approval'
  AND (
    public.is_customer_role()
    OR public.profile_role() IS NULL
    OR public.profile_role() = 'customer'
  )
);

-- Keep existing named admin/hr policies from earlier migrations if present;
-- the new policies above are additive OR replacements for the named set we dropped.

-- ---------------------------------------------------------------------------
-- 4) Harden signup RPCs: always pending_approval, never soft-fallback to prospect
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_customer_signup(
  p_customer_name text,
  p_industry text DEFAULT NULL,
  p_primary_contact_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_role text;
  existing_customer_id uuid;
  new_customer_id uuid;
  customer_name_value text := nullif(btrim(p_customer_name), '');
  contact_name_value text := nullif(btrim(COALESCE(p_primary_contact_name, '')), '');
  email_value text := nullif(lower(btrim(COALESCE(p_email, ''))), '');
  industry_value text := nullif(btrim(COALESCE(p_industry, '')), '');
  phone_value text := nullif(btrim(COALESCE(p_phone, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to complete customer signup.';
  END IF;

  IF customer_name_value IS NULL THEN
    RAISE EXCEPTION 'Customer name is required.';
  END IF;

  IF contact_name_value IS NULL THEN
    RAISE EXCEPTION 'Primary contact name is required.';
  END IF;

  IF email_value IS NULL THEN
    RAISE EXCEPTION 'Email is required.';
  END IF;

  SELECT role::text, customer_id
  INTO existing_role, existing_customer_id
  FROM public.profiles
  WHERE id = uid;

  IF existing_role IN ('manager', 'technician', 'billing', 'admin', 'hr') THEN
    RAISE EXCEPTION 'Employee accounts cannot use customer signup.';
  END IF;

  IF existing_customer_id IS NOT NULL THEN
    RETURN existing_customer_id;
  END IF;

  INSERT INTO public.customers (
    name,
    industry,
    primary_contact,
    contact_email,
    status,
    primary_contact_phone,
    customer_name,
    customer_status,
    primary_contact_name,
    primary_contact_email,
    signup_at
  ) VALUES (
    customer_name_value,
    industry_value,
    contact_name_value,
    email_value,
    'pending_approval',
    phone_value,
    customer_name_value,
    'pending_approval',
    contact_name_value,
    email_value,
    now()
  )
  RETURNING id INTO new_customer_id;

  UPDATE public.profiles
  SET
    role = 'customer',
    customer_id = new_customer_id,
    full_name = contact_name_value,
    email = email_value,
    is_active = true
  WHERE id = uid
    AND COALESCE(role::text, 'customer') NOT IN ('manager', 'technician', 'billing', 'admin', 'hr');

  IF NOT FOUND THEN
    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      role,
      customer_id,
      is_active,
      is_demo_user
    ) VALUES (
      uid,
      email_value,
      contact_name_value,
      'customer',
      new_customer_id,
      true,
      false
    )
    ON CONFLICT (id) DO UPDATE
    SET
      role = EXCLUDED.role,
      customer_id = EXCLUDED.customer_id,
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      is_active = true
    WHERE public.profiles.role::text NOT IN ('manager', 'technician', 'billing', 'admin', 'hr');
  END IF;

  RETURN new_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_customer_signup_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  new_customer_id uuid;
  customer_name_value text;
  contact_name_value text;
  email_value text;
  industry_value text;
  phone_value text;
BEGIN
  IF COALESCE(meta->>'role', '') <> 'customer' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.id AND customer_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  customer_name_value := nullif(btrim(COALESCE(meta->>'customer_name', '')), '');
  contact_name_value := nullif(
    btrim(COALESCE(meta->>'full_name', meta->>'primary_contact_name', '')),
    ''
  );
  email_value := nullif(lower(btrim(COALESCE(NEW.email, meta->>'email', ''))), '');
  industry_value := nullif(btrim(COALESCE(meta->>'industry', '')), '');
  phone_value := nullif(btrim(COALESCE(meta->>'phone', '')), '');

  IF customer_name_value IS NULL OR contact_name_value IS NULL OR email_value IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customers (
    name,
    industry,
    primary_contact,
    contact_email,
    status,
    primary_contact_phone,
    customer_name,
    customer_status,
    primary_contact_name,
    primary_contact_email,
    signup_at
  ) VALUES (
    customer_name_value,
    industry_value,
    contact_name_value,
    email_value,
    'pending_approval',
    phone_value,
    customer_name_value,
    'pending_approval',
    contact_name_value,
    email_value,
    now()
  )
  RETURNING id INTO new_customer_id;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    customer_id,
    is_active,
    is_demo_user
  ) VALUES (
    NEW.id,
    email_value,
    contact_name_value,
    'customer',
    new_customer_id,
    true,
    false
  )
  ON CONFLICT (id) DO UPDATE
  SET
    role = CASE
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing', 'admin', 'hr')
        THEN public.profiles.role
      ELSE 'customer'
    END,
    customer_id = CASE
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing', 'admin', 'hr')
        THEN public.profiles.customer_id
      ELSE EXCLUDED.customer_id
    END,
    full_name = CASE
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing', 'admin', 'hr')
        THEN public.profiles.full_name
      ELSE EXCLUDED.full_name
    END,
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    is_active = true;

  RETURN NEW;
END;
$$;
