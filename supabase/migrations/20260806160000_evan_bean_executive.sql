-- Make Evan Bean the executive demo user (replacing Jordan Hale).

update public.profiles
set
  full_name = 'Evan Bean',
  role = 'executive',
  updated_at = now()
where email = 'executive@servicesync.demo';

update public.employees
set
  title = 'Chief Executive Officer',
  department = 'Executive Office',
  role = 'executive',
  email = 'executive@servicesync.demo',
  notes = 'Primary executive demo login',
  updated_at = now()
where full_name = 'Evan Bean';

update public.employees
set
  full_name = 'Evan Bean',
  title = 'Chief Executive Officer',
  department = 'Executive Office',
  role = 'executive',
  email = 'executive@servicesync.demo',
  notes = 'Primary executive demo login',
  updated_at = now()
where full_name = 'Jordan Hale'
   or (email = 'executive@servicesync.demo' and full_name <> 'Evan Bean');

-- Deduplicate if both Jordan→Evan rename and Evan update left two rows.
with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.employees
  where full_name = 'Evan Bean'
)
delete from public.employees e
using ranked r
where e.id = r.id and r.rn > 1;

delete from public.employees
where full_name = 'Jordan Hale';

update public.hr_contractors
set notes = 'Chief Executive Officer — demo login executive@servicesync.demo'
where full_name = 'Evan Bean';

update public.hr_positions
set
  title = 'Chief Executive Officer',
  notes = 'Demo team — Evan Bean'
where notes ilike '%Evan Bean%';
