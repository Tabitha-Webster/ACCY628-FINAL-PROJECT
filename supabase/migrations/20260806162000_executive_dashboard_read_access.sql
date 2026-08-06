-- Executive read access for company snapshot metrics (customers + invoices / AR).

drop policy if exists "customers_internal_all" on public.customers;
create policy "customers_internal_all"
on public.customers
for select
to authenticated
using (
  public.current_user_role() = any (
    array[
      'manager'::user_role,
      'billing'::user_role,
      'technician'::user_role,
      'executive'::user_role
    ]
  )
  or (
    public.current_user_role() = 'customer'::user_role
    and id = public.current_user_customer_id()
  )
);

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select"
on public.invoices
for select
to authenticated
using (
  public.current_user_role() = any (
    array[
      'manager'::user_role,
      'billing'::user_role,
      'executive'::user_role
    ]
  )
  or (
    public.current_user_role() = 'customer'::user_role
    and customer_id = public.current_user_customer_id()
  )
);

insert into public.role_page_permissions (role, page_key, can_view)
values
  ('executive', 'accounts_receivable', true),
  ('executive', 'customers', true),
  ('executive', 'contracts', true),
  ('executive', 'contracts_reports', true),
  ('executive', 'contracts_renewals', true),
  ('executive', 'employees', true),
  ('executive', 'home', true)
on conflict (role, page_key) do update
set can_view = excluded.can_view,
    updated_at = now();
