-- Manager approval support for newly registered customers.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'customer_status'
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
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS customers_status_created_at_idx
  ON public.customers (status, created_at DESC);
