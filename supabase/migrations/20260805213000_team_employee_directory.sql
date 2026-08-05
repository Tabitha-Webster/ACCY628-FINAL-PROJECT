-- Team employee names for demo accounts + HR directory.
-- Demo login emails/passwords are unchanged. Mark, Carson, and Evan are employees only.

update public.profiles
set full_name = 'Tabitha Webster', updated_at = now()
where email = 'admin@servicesync.demo';

update public.profiles
set full_name = 'Emilie Pierson', updated_at = now()
where email = 'manager@servicesync.demo';

update public.profiles
set full_name = 'Jackson Pecunia', updated_at = now()
where email = 'tech@servicesync.demo';

update public.profiles
set full_name = 'Lindsay-Kate Williams', updated_at = now()
where email = 'billing@servicesync.demo';

update public.profiles
set full_name = 'Lily Walker', updated_at = now()
where email = 'hr@servicesync.demo';

insert into public.hr_departments (id, name, annual_budget)
values ('a1000001-0000-4000-8000-000000000006', 'Finance & Administration', 360000)
on conflict (id) do update
set name = excluded.name, annual_budget = excluded.annual_budget;

insert into public.hr_positions (id, department_id, title, status, budgeted_cost, opened_at, filled_at, notes)
values
  ('b2000001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000006', 'System Administrator', 'filled', 98000, '2023-01-15', '2023-01-15', 'Demo team — Tabitha Webster'),
  ('b2000001-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000000001', 'Operations Manager', 'filled', 105000, '2023-01-15', '2023-01-15', 'Demo team — Emilie Pierson'),
  ('b2000001-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000001', 'Lead Technician', 'filled', 82000, '2023-02-01', '2023-02-01', 'Demo team — Jackson Pecunia'),
  ('b2000001-0000-4000-8000-000000000004', 'a1000001-0000-4000-8000-000000000006', 'Billing Specialist', 'filled', 72000, '2023-02-01', '2023-02-01', 'Demo team — Lindsay-Kate Williams'),
  ('b2000001-0000-4000-8000-000000000005', 'a1000001-0000-4000-8000-000000000006', 'HR Manager', 'filled', 78000, '2023-02-15', '2023-02-15', 'Demo team — Lily Walker'),
  ('b2000001-0000-4000-8000-000000000006', 'a1000001-0000-4000-8000-000000000005', 'Service Desk Technician', 'filled', 58000, '2023-03-01', '2023-03-01', 'Demo team — Mark Ashe'),
  ('b2000001-0000-4000-8000-000000000007', 'a1000001-0000-4000-8000-000000000006', 'Staff Accountant / AR', 'filled', 70000, '2023-03-01', '2023-03-01', 'Demo team — Carson Kimble'),
  ('b2000001-0000-4000-8000-000000000008', 'a1000001-0000-4000-8000-000000000004', 'Account Manager', 'filled', 88000, '2023-03-15', '2023-03-15', 'Demo team — Evan Bean')
on conflict (id) do update set
  department_id = excluded.department_id,
  title = excluded.title,
  status = excluded.status,
  budgeted_cost = excluded.budgeted_cost,
  notes = excluded.notes;

insert into public.hr_contractors (id, department_id, position_id, full_name, status, annual_cost, hired_at, notes)
values
  ('c2000001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000006', 'b2000001-0000-4000-8000-000000000001', 'Tabitha Webster', 'active', 98000, '2023-01-15', 'System Administrator — demo login admin@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000002', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000002', 'Emilie Pierson', 'active', 105000, '2023-01-15', 'Operations Manager — demo login manager@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000001', 'b2000001-0000-4000-8000-000000000003', 'Jackson Pecunia', 'active', 82000, '2023-02-01', 'Lead Technician — demo login tech@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000004', 'a1000001-0000-4000-8000-000000000006', 'b2000001-0000-4000-8000-000000000004', 'Lindsay-Kate Williams', 'active', 72000, '2023-02-01', 'Billing Specialist — demo login billing@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000005', 'a1000001-0000-4000-8000-000000000006', 'b2000001-0000-4000-8000-000000000005', 'Lily Walker', 'active', 78000, '2023-02-15', 'HR Manager — demo login hr@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000006', 'a1000001-0000-4000-8000-000000000005', 'b2000001-0000-4000-8000-000000000006', 'Mark Ashe', 'active', 58000, '2023-03-01', 'Service Desk Technician — shares technician demo login tech@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000007', 'a1000001-0000-4000-8000-000000000006', 'b2000001-0000-4000-8000-000000000007', 'Carson Kimble', 'active', 70000, '2023-03-01', 'Staff Accountant / AR — shares billing demo login billing@servicesync.demo'),
  ('c2000001-0000-4000-8000-000000000008', 'a1000001-0000-4000-8000-000000000004', 'b2000001-0000-4000-8000-000000000008', 'Evan Bean', 'active', 88000, '2023-03-15', 'Account Manager — shares manager demo login manager@servicesync.demo')
on conflict (id) do update set
  department_id = excluded.department_id,
  position_id = excluded.position_id,
  full_name = excluded.full_name,
  status = excluded.status,
  annual_cost = excluded.annual_cost,
  notes = excluded.notes;
