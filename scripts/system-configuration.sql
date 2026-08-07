-- Admin system configuration (company, tax, numbering, integrations, demo)
create table if not exists public.system_configuration (
  id text primary key default 'default' check (id = 'default'),
  company jsonb not null default '{}'::jsonb,
  tax jsonb not null default '{}'::jsonb,
  numbering jsonb not null default '{}'::jsonb,
  integrations jsonb not null default '{}'::jsonb,
  demo jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

insert into public.system_configuration (id)
values ('default')
on conflict (id) do nothing;

alter table public.system_configuration enable row level security;

drop policy if exists "Admins can read system configuration" on public.system_configuration;
create policy "Admins can read system configuration"
on public.system_configuration
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update system configuration" on public.system_configuration;
create policy "Admins can update system configuration"
on public.system_configuration
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can insert system configuration" on public.system_configuration;
create policy "Admins can insert system configuration"
on public.system_configuration
for insert
to authenticated
with check (public.is_admin());

-- Audit sensitive configuration changes (actions only, not page views)
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'capture_sensitive_audit_event'
  ) then
    drop trigger if exists audit_system_configuration_changes on public.system_configuration;
    create trigger audit_system_configuration_changes
    after insert or update or delete on public.system_configuration
    for each row execute function public.capture_sensitive_audit_event(
      'company', 'tax', 'numbering', 'integrations', 'demo'
    );
  end if;
end
$$;

insert into public.role_page_permissions (role, page_key, can_view)
values
  ('admin', 'admin_configurations', true),
  ('manager', 'admin_configurations', false),
  ('technician', 'admin_configurations', false),
  ('billing', 'admin_configurations', false),
  ('customer', 'admin_configurations', false)
on conflict (role, page_key) do nothing;
