import { writeFileSync } from "fs";
import { buildDefaultPermissionRows } from "../src/lib/role-permissions";

const rows = buildDefaultPermissionRows();
const values = rows
  .map((r) => `  ('${r.role}', '${r.page_key}', ${r.can_view})`)
  .join(",\n");

const sql = `-- Role page visibility matrix (UI + route enforcement; does not replace RLS)
create table if not exists public.role_page_permissions (
  role text not null,
  page_key text not null,
  can_view boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  primary key (role, page_key),
  constraint role_page_permissions_role_check check (
    role in ('admin', 'manager', 'technician', 'billing', 'customer', 'executive')
  )
);

create index if not exists role_page_permissions_role_idx
  on public.role_page_permissions (role);

alter table public.role_page_permissions enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::user_role
  );
$$;

drop policy if exists "Users can read own role page permissions" on public.role_page_permissions;
create policy "Users can read own role page permissions"
on public.role_page_permissions
for select
to authenticated
using (
  role = (select p.role::text from public.profiles p where p.id = auth.uid())
  or public.is_admin()
);

drop policy if exists "Admins can update non-admin role page permissions" on public.role_page_permissions;
create policy "Admins can update non-admin role page permissions"
on public.role_page_permissions
for update
to authenticated
using (public.is_admin() and role <> 'admin')
with check (public.is_admin() and role <> 'admin');

drop policy if exists "Admins can insert non-admin role page permissions" on public.role_page_permissions;
create policy "Admins can insert non-admin role page permissions"
on public.role_page_permissions
for insert
to authenticated
with check (public.is_admin() and role <> 'admin');

-- Seed defaults (safe to re-run for non-admin roles; admin rows insert once)
insert into public.role_page_permissions (role, page_key, can_view)
values
${values}
on conflict (role, page_key) do nothing;
`;

writeFileSync("scripts/role-page-permissions.sql", sql);
console.log(`wrote ${rows.length} seed rows`);
