-- Contract controls: pending price-change payload + active-only billing eligibility
ALTER TABLE public.contract_modifications
  ADD COLUMN IF NOT EXISTS proposed_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contract_modifications.proposed_changes IS
  'Pending field-level changes awaiting manager approval (price/commercial terms).';

CREATE OR REPLACE FUNCTION public.contract_valid_for_work_date(p_contract_id uuid, p_work_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.status = 'active'::contract_status
      AND c.start_date <= p_work_date
      AND (c.end_date IS NULL OR c.end_date >= p_work_date)
  );
$$;

COMMENT ON FUNCTION public.contract_valid_for_work_date(uuid, date) IS
  'True when the contract is active and the work date falls within the contract term.';
