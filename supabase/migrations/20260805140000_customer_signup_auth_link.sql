-- Customer self-signup support for ACCY628-FINAL-PROJECT.
-- Creates/links a customers row to the authenticated user as role = customer only.
-- Does not elevate manager / technician / billing accounts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'customer_status'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'customer_status'
      AND e.enumlabel = 'pending_approval'
  ) THEN
    ALTER TYPE public.customer_status ADD VALUE 'pending_approval';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_status text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text;

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

  IF existing_role IN ('manager', 'technician', 'billing') THEN
    RAISE EXCEPTION 'Employee accounts cannot use customer signup.';
  END IF;

  IF existing_customer_id IS NOT NULL THEN
    RETURN existing_customer_id;
  END IF;

  BEGIN
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
      primary_contact_email
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
      email_value
    )
    RETURNING id INTO new_customer_id;
  EXCEPTION
    WHEN others THEN
      BEGIN
        INSERT INTO public.customers (
          name,
          industry,
          primary_contact,
          contact_email,
          status,
          primary_contact_phone
        ) VALUES (
          customer_name_value,
          industry_value,
          contact_name_value,
          email_value,
          'prospect',
          phone_value
        )
        RETURNING id INTO new_customer_id;
      EXCEPTION
        WHEN others THEN
          INSERT INTO public.customers (
            name,
            industry,
            primary_contact,
            contact_email,
            status,
            notes
          ) VALUES (
            customer_name_value,
            industry_value,
            contact_name_value,
            email_value,
            'prospect',
            CASE WHEN phone_value IS NULL THEN NULL ELSE 'Phone: ' || phone_value END
          )
          RETURNING id INTO new_customer_id;
      END;
  END;

  UPDATE public.profiles
  SET
    role = 'customer',
    customer_id = new_customer_id,
    full_name = contact_name_value,
    email = email_value,
    is_active = true
  WHERE id = uid
    AND COALESCE(role::text, 'customer') NOT IN ('manager', 'technician', 'billing');

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
    WHERE public.profiles.role::text NOT IN ('manager', 'technician', 'billing');
  END IF;

  RETURN new_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_customer_signup(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_customer_signup(text, text, text, text, text) TO authenticated;

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

  BEGIN
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
      primary_contact_email
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
      email_value
    )
    RETURNING id INTO new_customer_id;
  EXCEPTION
    WHEN others THEN
      INSERT INTO public.customers (
        name,
        industry,
        primary_contact,
        contact_email,
        status,
        notes
      ) VALUES (
        customer_name_value,
        industry_value,
        contact_name_value,
        email_value,
        'prospect',
        CASE WHEN phone_value IS NULL THEN NULL ELSE 'Phone: ' || phone_value END
      )
      RETURNING id INTO new_customer_id;
  END;

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
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing') THEN public.profiles.role
      ELSE 'customer'
    END,
    customer_id = CASE
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing') THEN public.profiles.customer_id
      ELSE EXCLUDED.customer_id
    END,
    full_name = CASE
      WHEN public.profiles.role::text IN ('manager', 'technician', 'billing') THEN public.profiles.full_name
      ELSE EXCLUDED.full_name
    END,
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    is_active = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_customer_signup ON auth.users;
CREATE TRIGGER on_auth_customer_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_customer_signup_from_auth();
