-- Allow assigning a primary technician on a contract (Manage Contracts edit/create).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS assigned_technician_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contracts_assigned_technician_id_idx
  ON public.contracts (assigned_technician_id);

COMMENT ON COLUMN public.contracts.assigned_technician_id IS
  'Primary technician assigned to support this contract.';
