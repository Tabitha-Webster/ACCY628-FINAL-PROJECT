-- Manager / admin access to View and Edit Contracts list.
insert into public.role_page_permissions (role, page_key, can_view)
values
  ('manager', 'contracts_view_edit', true),
  ('admin', 'contracts_view_edit', true)
on conflict (role, page_key) do update
set can_view = excluded.can_view;
