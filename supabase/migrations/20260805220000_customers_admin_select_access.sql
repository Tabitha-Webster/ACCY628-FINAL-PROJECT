-- Give Admin the same customers read/write access as Manager (list, add, edit).
-- Required for /customers as Admin — without this, RLS returns zero rows.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Ensure admin exists on user_role when that enum is present.
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
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role::text) = 'admin'
  );
$$;

DROP POLICY IF EXISTS customers_select_admin ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin ON public.customers;
DROP POLICY IF EXISTS customers_update_admin ON public.customers;

CREATE POLICY customers_select_admin
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);

CREATE POLICY customers_insert_admin
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);

CREATE POLICY customers_update_admin
ON public.customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);
