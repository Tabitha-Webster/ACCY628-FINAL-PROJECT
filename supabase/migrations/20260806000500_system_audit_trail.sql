-- Change-only audit trail for sensitive system and C2C records.
-- This intentionally records INSERT/UPDATE/DELETE actions only. It does not log page views or SELECTs.

create table if not exists public.system_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references auth.users(id) on delete set null,
  actor_email text null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity_type text not null,
  entity_id text not null,
  changed_fields text[] not null default '{}',
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_audit_events_created_at_idx
  on public.system_audit_events (created_at desc);

create index if not exists system_audit_events_entity_idx
  on public.system_audit_events (entity_type, entity_id);

create index if not exists system_audit_events_actor_idx
  on public.system_audit_events (actor_id);

alter table public.system_audit_events enable row level security;

drop policy if exists "Admins can read system audit events" on public.system_audit_events;
create policy "Admins can read system audit events"
on public.system_audit_events
for select
to authenticated
using (public.is_admin());

revoke insert, update, delete on public.system_audit_events from anon, authenticated;
grant select on public.system_audit_events to authenticated;

create or replace function public.capture_sensitive_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_old_changed jsonb := '{}'::jsonb;
  v_new_changed jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}';
  v_field text;
  v_entity_id text;
  v_actor_id uuid := auth.uid();
  v_actor_email text;
begin
  if TG_OP <> 'INSERT' then
    v_old := to_jsonb(OLD);
  end if;
  if TG_OP <> 'DELETE' then
    v_new := to_jsonb(NEW);
  end if;

  foreach v_field in array TG_ARGV
  loop
    if TG_OP = 'INSERT' and v_new ? v_field then
      v_changed_fields := array_append(v_changed_fields, v_field);
      v_new_changed := v_new_changed || jsonb_build_object(v_field, v_new -> v_field);
    elsif TG_OP = 'DELETE' and v_old ? v_field then
      v_changed_fields := array_append(v_changed_fields, v_field);
      v_old_changed := v_old_changed || jsonb_build_object(v_field, v_old -> v_field);
    elsif TG_OP = 'UPDATE' and (v_old -> v_field) is distinct from (v_new -> v_field) then
      v_changed_fields := array_append(v_changed_fields, v_field);
      v_old_changed := v_old_changed || jsonb_build_object(v_field, v_old -> v_field);
      v_new_changed := v_new_changed || jsonb_build_object(v_field, v_new -> v_field);
    end if;
  end loop;

  -- Ignore updates that did not change any configured sensitive field.
  if array_length(v_changed_fields, 1) is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  v_entity_id := coalesce(
    v_new ->> 'id',
    v_old ->> 'id',
    concat_ws(':',
      coalesce(v_new ->> 'role', v_old ->> 'role'),
      coalesce(v_new ->> 'page_key', v_old ->> 'page_key')
    )
  );

  if v_actor_id is not null then
    select email into v_actor_email
    from auth.users
    where id = v_actor_id;
  end if;

  insert into public.system_audit_events (
    actor_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    changed_fields,
    old_values,
    new_values
  )
  values (
    v_actor_id,
    v_actor_email,
    TG_OP,
    TG_TABLE_NAME,
    coalesce(nullif(v_entity_id, ''), 'unknown'),
    v_changed_fields,
    v_old_changed,
    v_new_changed
  );

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists audit_profiles_sensitive_changes on public.profiles;
    create trigger audit_profiles_sensitive_changes
    after insert or update or delete on public.profiles
    for each row execute function public.capture_sensitive_audit_event(
      'email', 'full_name', 'role', 'is_active', 'customer_id'
    );
  end if;

  if to_regclass('public.role_page_permissions') is not null then
    drop trigger if exists audit_role_permissions_changes on public.role_page_permissions;
    create trigger audit_role_permissions_changes
    after insert or update or delete on public.role_page_permissions
    for each row execute function public.capture_sensitive_audit_event(
      'role', 'page_key', 'can_view'
    );
  end if;

  if to_regclass('public.customers') is not null then
    drop trigger if exists audit_customers_sensitive_changes on public.customers;
    create trigger audit_customers_sensitive_changes
    after insert or update or delete on public.customers
    for each row execute function public.capture_sensitive_audit_event(
      'name', 'status', 'contact_email', 'primary_contact', 'billing_email'
    );
  end if;

  if to_regclass('public.contracts') is not null then
    drop trigger if exists audit_contracts_sensitive_changes on public.contracts;
    create trigger audit_contracts_sensitive_changes
    after insert or update or delete on public.contracts
    for each row execute function public.capture_sensitive_audit_event(
      'customer_id', 'status', 'billing_frequency', 'payment_terms',
      'monthly_recurring_fee', 'billing_status'
    );
  end if;

  if to_regclass('public.invoices') is not null then
    drop trigger if exists audit_invoices_sensitive_changes on public.invoices;
    create trigger audit_invoices_sensitive_changes
    after insert or update or delete on public.invoices
    for each row execute function public.capture_sensitive_audit_event(
      'customer_id', 'contract_id', 'status', 'due_date', 'subtotal',
      'tax_amount', 'credits', 'total_amount', 'amount_paid', 'remaining_balance'
    );
  end if;

  if to_regclass('public.payments') is not null then
    drop trigger if exists audit_payments_sensitive_changes on public.payments;
    create trigger audit_payments_sensitive_changes
    after insert or update or delete on public.payments
    for each row execute function public.capture_sensitive_audit_event(
      'customer_id', 'payment_date', 'payment_amount', 'payment_method', 'reference_number'
    );
  end if;
end
$$;

-- Keep the route catalog complete for all roles; Audit Trail remains Admin-only.
insert into public.role_page_permissions (role, page_key, can_view)
values
  ('admin', 'admin_audit', true),
  ('manager', 'admin_audit', false),
  ('technician', 'admin_audit', false),
  ('billing', 'admin_audit', false),
  ('customer', 'admin_audit', false),
  ('hr', 'admin_audit', false)
on conflict (role, page_key) do nothing;
