-- Allow manager and HR to view the employees directory (read-only).
-- Insert / update / delete remain admin-only.

drop policy if exists "Admins can select employees" on public.employees;
drop policy if exists "Staff can select employees" on public.employees;

create policy "Staff can select employees"
on public.employees
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'manager', 'hr')
  )
);
