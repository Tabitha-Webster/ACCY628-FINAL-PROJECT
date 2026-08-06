-- Grant executive (and admin catalog default) access to Awaiting Your Signature.
insert into public.role_page_permissions (role, page_key, can_view)
values
  ('executive', 'contracts_awaiting_signature', true),
  ('admin', 'contracts_awaiting_signature', true)
on conflict (role, page_key) do update
set can_view = excluded.can_view;
