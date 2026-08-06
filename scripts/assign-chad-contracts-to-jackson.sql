-- Assign majority of Chad Corporation contracts to Jackson Pecunia
-- and align his specialty/skills with Chad MSP work.
-- Leaves project/network outliers on other techs: CTR-1002, CTR-1005.

update public.profiles
set
  primary_specialty = 'Managed support, help desk & endpoint operations',
  skill_level = 'senior',
  skill_tags = array[
    'helpdesk',
    'rmm',
    'patching',
    'endpoint',
    'backup',
    'security',
    'microsoft365',
    'remote',
    'onsite',
    'tickets',
    'monitoring'
  ]
where email = 'tech@servicesync.demo';

update public.contracts c
set
  assigned_technician_id = (
    select id from public.profiles where email = 'tech@servicesync.demo' limit 1
  ),
  updated_at = now()
from public.customers cu
where c.customer_id = cu.id
  and cu.name = 'Chad Corporation'
  and c.contract_number not in ('CTR-1002', 'CTR-1005');
