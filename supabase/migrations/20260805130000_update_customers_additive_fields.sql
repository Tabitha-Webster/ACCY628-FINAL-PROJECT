-- Additive update to public.customers for ACCY628-FINAL-PROJECT.
-- IMPORTANT: Does NOT rename/drop existing app columns (name, status, primary_contact,
-- contact_email, service_address, credit_terms, account_manager_id, notes, etc.).
-- Renaming those would break live pages that select customer.name / customer.status.

CREATE SEQUENCE IF NOT EXISTS public.customer_identifier_seq;

CREATE OR REPLACE FUNCTION public.generate_customer_identifier()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_n bigint;
BEGIN
  next_n := nextval('public.customer_identifier_seq');
  RETURN 'CUST-' || lpad(next_n::text, 5, '0');
END;
$$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_identifier text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_status text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill new columns from existing app-used columns
UPDATE public.customers
SET
  customer_name = COALESCE(customer_name, name),
  customer_status = COALESCE(customer_status, status::text),
  primary_contact_name = COALESCE(primary_contact_name, primary_contact),
  primary_contact_email = COALESCE(primary_contact_email, contact_email),
  updated_at = COALESCE(updated_at, created_at, now());

UPDATE public.customers
SET customer_identifier = public.generate_customer_identifier()
WHERE customer_identifier IS NULL;

SELECT setval(
  'public.customer_identifier_seq',
  GREATEST(
    (
      SELECT COALESCE(
        MAX(NULLIF(regexp_replace(customer_identifier, '\D', '', 'g'), '')::bigint),
        0
      )
      FROM public.customers
    ),
    (SELECT last_value FROM public.customer_identifier_seq)
  ),
  true
);

ALTER TABLE public.customers
  ALTER COLUMN customer_identifier SET DEFAULT public.generate_customer_identifier();

DO $$
BEGIN
  ALTER TABLE public.customers ALTER COLUMN customer_name SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'customer_name NOT NULL skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.customers ALTER COLUMN name SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'name NOT NULL skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_customer_identifier_key'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_identifier_key UNIQUE (customer_identifier);
  END IF;
END $$;

ALTER TABLE public.customers
  ALTER COLUMN customer_identifier SET NOT NULL;

-- Keep legacy app columns and new assignment columns synchronized
CREATE OR REPLACE FUNCTION public.sync_customers_legacy_and_new_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_identifier IS NULL OR btrim(NEW.customer_identifier) = '' THEN
    NEW.customer_identifier := public.generate_customer_identifier();
  END IF;

  IF NEW.customer_name IS NULL OR btrim(NEW.customer_name) = '' THEN
    NEW.customer_name := NEW.name;
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.customer_name;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.customer_name IS DISTINCT FROM OLD.customer_name
       AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
      NEW.name := NEW.customer_name;
    ELSIF NEW.name IS DISTINCT FROM OLD.name
          AND NEW.customer_name IS NOT DISTINCT FROM OLD.customer_name THEN
      NEW.customer_name := NEW.name;
    END IF;

    IF NEW.customer_status IS DISTINCT FROM OLD.customer_status
       AND NEW.status::text IS NOT DISTINCT FROM OLD.status::text THEN
      BEGIN
        NEW.status := NEW.customer_status;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    ELSIF NEW.status::text IS DISTINCT FROM OLD.status::text
          AND NEW.customer_status IS NOT DISTINCT FROM OLD.customer_status THEN
      NEW.customer_status := NEW.status::text;
    END IF;

    IF NEW.primary_contact_name IS DISTINCT FROM OLD.primary_contact_name
       AND NEW.primary_contact IS NOT DISTINCT FROM OLD.primary_contact THEN
      NEW.primary_contact := NEW.primary_contact_name;
    ELSIF NEW.primary_contact IS DISTINCT FROM OLD.primary_contact
          AND NEW.primary_contact_name IS NOT DISTINCT FROM OLD.primary_contact_name THEN
      NEW.primary_contact_name := NEW.primary_contact;
    END IF;

    IF NEW.primary_contact_email IS DISTINCT FROM OLD.primary_contact_email
       AND NEW.contact_email IS NOT DISTINCT FROM OLD.contact_email THEN
      NEW.contact_email := NEW.primary_contact_email;
    ELSIF NEW.contact_email IS DISTINCT FROM OLD.contact_email
          AND NEW.primary_contact_email IS NOT DISTINCT FROM OLD.primary_contact_email THEN
      NEW.primary_contact_email := NEW.contact_email;
    END IF;
  ELSE
    IF NEW.customer_status IS NULL THEN
      NEW.customer_status := NEW.status::text;
    END IF;
    IF NEW.status IS NULL AND NEW.customer_status IS NOT NULL THEN
      BEGIN
        NEW.status := NEW.customer_status;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;

    IF NEW.primary_contact_name IS NULL THEN
      NEW.primary_contact_name := NEW.primary_contact;
    END IF;
    IF NEW.primary_contact IS NULL THEN
      NEW.primary_contact := NEW.primary_contact_name;
    END IF;

    IF NEW.primary_contact_email IS NULL THEN
      NEW.primary_contact_email := NEW.contact_email;
    END IF;
    IF NEW.contact_email IS NULL THEN
      NEW.contact_email := NEW.primary_contact_email;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customers_legacy_and_new_fields ON public.customers;
CREATE TRIGGER trg_sync_customers_legacy_and_new_fields
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.sync_customers_legacy_and_new_fields();
