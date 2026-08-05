-- Additive columns used by the Customers module.
-- Safe to re-run: IF NOT EXISTS / guarded constraints.
-- Does not rename or drop existing app columns (name, status, primary_contact, etc.).

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
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS billing_contact_name text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Assign CUST-##### to any rows still missing an identifier.
UPDATE public.customers
SET customer_identifier = public.generate_customer_identifier()
WHERE customer_identifier IS NULL OR btrim(customer_identifier) = '';

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
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_customer_identifier_key'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_identifier_key UNIQUE (customer_identifier);
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.customers ALTER COLUMN customer_identifier SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'customer_identifier NOT NULL skipped: %', SQLERRM;
END $$;

-- Promote structured billing/phone lines previously stored in notes into real columns.
UPDATE public.customers AS c
SET
  primary_contact_phone = COALESCE(
    NULLIF(btrim(c.primary_contact_phone), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*Primary phone:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*Primary phone:\s*'
      LIMIT 1
    )
  ),
  billing_contact_name = COALESCE(
    NULLIF(btrim(c.billing_contact_name), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*Billing contact:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*Billing contact:\s*'
      LIMIT 1
    )
  ),
  billing_contact_email = COALESCE(
    NULLIF(btrim(c.billing_contact_email), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*Billing email:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*Billing email:\s*'
      LIMIT 1
    )
  ),
  billing_address = COALESCE(
    NULLIF(btrim(c.billing_address), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*Billing address:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*Billing address:\s*'
      LIMIT 1
    )
  ),
  city = COALESCE(
    NULLIF(btrim(c.city), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*City:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*City:\s*'
      LIMIT 1
    )
  ),
  state = COALESCE(
    NULLIF(btrim(c.state), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*State:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*State:\s*'
      LIMIT 1
    )
  ),
  postal_code = COALESCE(
    NULLIF(btrim(c.postal_code), ''),
    (
      SELECT NULLIF(btrim(substring(line from '^\s*Postal code:\s*(.*)$')), '')
      FROM unnest(string_to_array(c.notes, E'\n')) AS line
      WHERE line ~* '^\s*Postal code:\s*'
      LIMIT 1
    )
  )
WHERE c.notes IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_customers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_set_updated_at ON public.customers;
CREATE TRIGGER trg_customers_set_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.set_customers_updated_at();
