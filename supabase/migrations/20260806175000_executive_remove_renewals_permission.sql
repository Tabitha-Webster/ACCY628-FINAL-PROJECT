-- Remove Renewal & Expiration from the executive role menu / page access.
update public.role_page_permissions
set can_view = false,
    updated_at = now()
where role = 'executive'
  and page_key = 'contracts_renewals';
