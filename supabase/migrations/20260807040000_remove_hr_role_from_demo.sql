-- Remove HR role from the demo product surface.
-- Leaves unused user_role enum value 'hr' in place (Postgres cannot easily drop enum values).

-- Revoke all HR page permissions and delete obsolete HR page keys.
DELETE FROM public.role_page_permissions
WHERE role = 'hr'
   OR page_key IN ('hr_analytics', 'hr_positions', 'hr_directory');

-- Deactivate the HR demo login and clear demo flags so it no longer appears as a usable account.
UPDATE public.profiles
SET
  is_active = false,
  is_demo_user = false,
  updated_at = now()
WHERE lower(email) = 'hr@servicesync.demo'
   OR role::text = 'hr';

-- Remove Lily Walker / HR Manager from the company employee directory.
DELETE FROM public.employees
WHERE lower(coalesce(email, '')) = 'hr@servicesync.demo'
   OR role = 'hr'
   OR lower(full_name) = 'lily walker';

-- Keep system config rows consistent (no HR role grants).
DELETE FROM public.role_page_permissions
WHERE role = 'hr';
