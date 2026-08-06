-- Technician skill fields for manager assignment decisions + Assigned Contracts page access.

alter table public.profiles
  add column if not exists primary_specialty text,
  add column if not exists skill_level text,
  add column if not exists skill_tags text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_skill_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_skill_level_check
      check (
        skill_level is null
        or skill_level in ('junior', 'intermediate', 'senior')
      );
  end if;
end $$;

-- Seed demo technician specialties (match by email so IDs stay flexible).
update public.profiles set
  primary_specialty = 'Managed support, help desk & endpoint operations',
  skill_level = 'senior',
  skill_tags = array['helpdesk', 'rmm', 'patching', 'endpoint', 'backup', 'security', 'microsoft365', 'remote', 'onsite', 'tickets', 'monitoring']
where email = 'tech@servicesync.demo';

update public.profiles set
  primary_specialty = 'Network & infrastructure',
  skill_level = 'senior',
  skill_tags = array['network', 'firewall', 'vpn', 'infrastructure']
where email = 'tech2@servicesync.demo';

update public.profiles set
  primary_specialty = 'Endpoint security & backup',
  skill_level = 'intermediate',
  skill_tags = array['security', 'backup', 'endpoint', 'compliance']
where email = 'tech3@servicesync.demo';

update public.profiles set
  primary_specialty = 'On-site break/fix',
  skill_level = 'intermediate',
  skill_tags = array['onsite', 'hardware', 'break', 'imaging']
where email = 'tech4@servicesync.demo';

update public.profiles set
  primary_specialty = 'Projects & migrations',
  skill_level = 'senior',
  skill_tags = array['projects', 'migration', 'coordination', 'documentation']
where email = 'tech5@servicesync.demo';

update public.profiles set
  primary_specialty = 'RMM & patch management',
  skill_level = 'junior',
  skill_tags = array['rmm', 'patching', 'monitoring', 'helpdesk']
where email = 'tech6@servicesync.demo';

update public.profiles set
  primary_specialty = 'Identity & access',
  skill_level = 'intermediate',
  skill_tags = array['identity', 'security', 'microsoft365', 'onboarding']
where email = 'ctkimble@go.olemiss.edu';

update public.profiles set
  primary_specialty = 'General support',
  skill_level = 'junior',
  skill_tags = array['helpdesk', 'support', 'remote']
where email = 'testtech@servicesync.demo'
  and primary_specialty is null;

-- Manager page permission for Assigned Contracts (manager-only staffing edits).
insert into public.role_page_permissions (role, page_key, can_view)
values
  ('manager', 'contracts_assigned', true),
  ('admin', 'contracts_assigned', false)
on conflict (role, page_key) do update
set can_view = excluded.can_view,
    updated_at = now();
