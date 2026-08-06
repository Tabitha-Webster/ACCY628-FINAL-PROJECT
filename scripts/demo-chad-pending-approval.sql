-- Paste into Supabase → SQL Editor for project icymsjpkfddfrbbazxss
-- Run STEP 1, then STEP 2 separately (Postgres cannot use a brand-new enum
-- value in the same transaction that adds it).

-- ========== STEP 1: enable pending_approval (Run once) ==========
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
  ADD COLUMN IF NOT EXISTS customer_status text,
  ADD COLUMN IF NOT EXISTS signup_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

-- ========== STEP 2: put Chad in the Approvals queue (Run after Step 1 succeeds) ==========
UPDATE public.customers
SET
  status = 'pending_approval',
  customer_status = 'pending_approval',
  signup_at = COALESCE(signup_at, now()),
  approval_note = NULL,
  reviewed_at = NULL,
  reviewed_by = NULL
WHERE id = '22222222-2222-2222-2222-222222222201'
  AND name = 'Chad Corporation';

SELECT id, name, status, customer_status, signup_at, contact_email
FROM public.customers
WHERE id = '22222222-2222-2222-2222-222222222201';
