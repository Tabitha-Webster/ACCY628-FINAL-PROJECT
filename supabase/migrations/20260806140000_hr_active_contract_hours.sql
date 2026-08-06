-- Minimal contract coverage hours for HR applicant match scoring.
-- Returns only contract_id + hours — no names, fees, or customer data.

CREATE OR REPLACE FUNCTION public.hr_active_contract_hours()
RETURNS TABLE (contract_id uuid, hours_worked numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS contract_id,
    COALESCE(SUM(e.hours_worked), 0)::numeric AS hours_worked
  FROM public.contracts c
  LEFT JOIN public.time_entries e ON e.contract_id = c.id
  WHERE c.status = 'active'::public.contract_status
  GROUP BY c.id;
$$;

REVOKE ALL ON FUNCTION public.hr_active_contract_hours() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_active_contract_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_active_contract_hours() TO service_role;

COMMENT ON FUNCTION public.hr_active_contract_hours() IS
  'HR-safe aggregate: active contract ids with total logged hours for applicant match scoring.';
