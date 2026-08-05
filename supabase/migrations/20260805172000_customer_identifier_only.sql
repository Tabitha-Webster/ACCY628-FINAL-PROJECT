-- Unique customer identifiers only (CUST-00001, CUST-00002, …).
-- Does not rename or drop existing customer columns.

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
  ADD COLUMN IF NOT EXISTS customer_identifier text;

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
