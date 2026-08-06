-- Out-of-scope / change requests on projects require BOTH manager and customer approval.
-- approval_status = manager (or billing) decision
-- customer_approval_status = customer decision (not_required for ticket-only / legacy rows)

ALTER TABLE public.additional_work_requests
  ADD COLUMN IF NOT EXISTS customer_approval_status text;

UPDATE public.additional_work_requests
SET customer_approval_status = CASE
  WHEN project_id IS NOT NULL AND approval_status = 'pending' THEN 'pending'
  WHEN project_id IS NOT NULL AND approval_status = 'approved' THEN 'approved'
  WHEN project_id IS NOT NULL AND approval_status = 'rejected' THEN 'rejected'
  ELSE 'not_required'
END
WHERE customer_approval_status IS NULL;

ALTER TABLE public.additional_work_requests
  ALTER COLUMN customer_approval_status SET DEFAULT 'pending';

UPDATE public.additional_work_requests
SET customer_approval_status = 'not_required'
WHERE customer_approval_status IS NULL;

ALTER TABLE public.additional_work_requests
  ALTER COLUMN customer_approval_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'additional_work_requests_customer_approval_status_check'
  ) THEN
    ALTER TABLE public.additional_work_requests
      ADD CONSTRAINT additional_work_requests_customer_approval_status_check
      CHECK (customer_approval_status IN ('pending', 'approved', 'rejected', 'not_required'));
  END IF;
END $$;

COMMENT ON COLUMN public.additional_work_requests.customer_approval_status IS
  'Customer decision for project out-of-scope / change requests. Use not_required for ticket-only requests.';
