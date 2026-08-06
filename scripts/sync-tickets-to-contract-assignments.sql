-- Keep support ticket assignees aligned with contract technician assignments.
-- Also restore majority Chad Corp contracts to Jackson Pecunia.
-- Does not change ticket titles, priorities, or UI formatting.

-- Majority Chad Corp -> Jackson (exclude project outliers)
update public.contracts c
set
  assigned_technician_id = p.id,
  updated_at = now()
from public.customers cu,
     public.profiles p
where c.customer_id = cu.id
  and cu.name = 'Chad Corporation'
  and p.email = 'tech@servicesync.demo'
  and c.contract_number not in ('CTR-1002', 'CTR-1005');

-- Project outliers stay with projects specialist
update public.contracts c
set assigned_technician_id = p.id, updated_at = now()
from public.customers cu, public.profiles p
where c.customer_id = cu.id
  and cu.name = 'Chad Corporation'
  and c.contract_number in ('CTR-1002', 'CTR-1005')
  and p.email = 'tech5@servicesync.demo';

-- Sync ticket assignee to contract assignee
update public.support_tickets t
set
  assigned_technician_id = c.assigned_technician_id,
  status = case
    when t.status = 'new' and c.assigned_technician_id is not null then 'assigned'::ticket_status
    else t.status
  end,
  updated_at = now()
from public.contracts c
where t.contract_id = c.id
  and c.assigned_technician_id is not null
  and (
    t.assigned_technician_id is distinct from c.assigned_technician_id
    or (t.status = 'new' and t.assigned_technician_id is null)
  );
