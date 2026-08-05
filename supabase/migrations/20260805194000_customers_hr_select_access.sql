-- Give HR the same customers read/write access as Manager (list, add, edit).
-- Required for /customers as HR — without this, RLS returns zero rows.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Ensure hr exists on user_role when that enum is present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'hr'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'hr';
  END IF;
END $$;

DROP POLICY IF EXISTS customers_select_hr ON public.customers;
DROP POLICY IF EXISTS customers_insert_hr ON public.customers;
DROP POLICY IF EXISTS customers_update_hr ON public.customers;

CREATE POLICY customers_select_hr
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);

CREATE POLICY customers_insert_hr
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);

CREATE POLICY customers_update_hr
ON public.customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);
