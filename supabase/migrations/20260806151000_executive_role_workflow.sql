-- Executive role wiring: signature statuses, RLS, demo user, page permissions.

-- Signature packet: support awaiting_executive; store executive signatures.
alter table public.contract_signature_packets
  drop constraint if exists contract_signature_packets_status_check;

alter table public.contract_signature_packets
  add constraint contract_signature_packets_status_check
  check (status in (
    'draft',
    'awaiting_admin',
    'awaiting_executive',
    'awaiting_customer',
    'fully_executed',
    'rejected'
  ));

alter table public.contract_signature_packets
  add column if not exists executive_signed_by uuid null references public.profiles(id),
  add column if not exists executive_signed_at timestamptz null,
  add column if not exists executive_signature_data text null,
  add column if not exists executive_signer_name text null;

-- Move any packets still waiting on admin into executive queue.
update public.contract_signature_packets
set status = 'awaiting_executive', updated_at = now()
where status = 'awaiting_admin' and is_current = true;

-- Employees directory role check
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees
  add constraint employees_role_check
  check (role in ('admin', 'manager', 'technician', 'billing', 'hr', 'executive'));

-- Contracts select: include admin, executive, hr
drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select"
on public.contracts
for select
to authenticated
using (
  public.current_user_role() = any (
    array[
      'manager'::user_role,
      'billing'::user_role,
      'technician'::user_role,
      'admin'::user_role,
      'executive'::user_role,
      'hr'::user_role
    ]
  )
  or (
    public.current_user_role() = 'customer'::user_role
    and customer_id = public.current_user_customer_id()
  )
);

-- Signature packet policies
drop policy if exists "signature_packets_select" on public.contract_signature_packets;
create policy "signature_packets_select"
on public.contract_signature_packets
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'manager', 'billing', 'technician', 'hr', 'executive')
  or public.customer_owns_contract(contract_id)
);

drop policy if exists "signature_packets_update" on public.contract_signature_packets;
create policy "signature_packets_update"
on public.contract_signature_packets
for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'manager')
  or (
    public.current_profile_role() = 'executive'
    and status = 'awaiting_executive'
  )
  or (
    public.customer_owns_contract(contract_id)
    and status = 'awaiting_customer'
  )
)
with check (
  public.current_profile_role() in ('admin', 'manager', 'executive')
  or (
    public.customer_owns_contract(contract_id)
    and status in ('awaiting_customer', 'fully_executed', 'rejected')
  )
);

-- Storage: executive can read and upload signed PDFs
drop policy if exists "contract_docs_storage_select" on storage.objects;
create policy "contract_docs_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'contract-documents'
  and (
    public.current_user_role() = any (
      array[
        'manager'::user_role,
        'admin'::user_role,
        'billing'::user_role,
        'technician'::user_role,
        'executive'::user_role
      ]
    )
    or public.current_profile_role() = 'customer'
  )
);

drop policy if exists "contract_docs_storage_insert" on storage.objects;
create policy "contract_docs_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'contract-documents'
  and (
    public.current_user_role() = any (
      array['manager'::user_role, 'admin'::user_role, 'executive'::user_role]
    )
    or (
      public.current_profile_role() = 'customer'
      and public.customer_owns_contract(((string_to_array(name, '/'))[1])::uuid)
    )
  )
);

-- Finalize requires manager + executive + customer signatures
create or replace function public.finalize_contract_signature_packet(
  p_packet_id uuid,
  p_storage_path text,
  p_document_name text,
  p_file_size bigint default null
)
returns public.contract_signature_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.contract_signature_packets;
  v_contract public.contracts;
  v_role text;
  v_doc_id uuid;
  v_group_id uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  select * into v_packet
  from public.contract_signature_packets
  where id = p_packet_id
  for update;

  if not found then
    raise exception 'Signature packet not found';
  end if;

  select * into v_contract
  from public.contracts
  where id = v_packet.contract_id;

  if not found then
    raise exception 'Contract not found';
  end if;

  v_role := public.current_profile_role();

  if v_role not in ('admin', 'manager', 'executive')
     and not public.customer_owns_contract(v_packet.contract_id) then
    raise exception 'Not allowed to finalize this packet';
  end if;

  if v_packet.manager_signature_data is null
     or v_packet.executive_signature_data is null
     or v_packet.customer_signature_data is null then
    raise exception 'Manager, executive, and customer signatures are required before finalizing';
  end if;

  update public.contract_documents
  set
    is_current = false,
    replaced_at = v_now,
    replace_reason = 'Superseded by signature workflow'
  where contract_id = v_packet.contract_id
    and document_type = 'signed_contract'
    and is_current = true;

  insert into public.contract_documents (
    contract_id, document_name, document_type, storage_path, file_url, uploaded_by, notes,
    document_group_id, version_number, is_current, file_size, mime_type
  ) values (
    v_packet.contract_id,
    coalesce(nullif(p_document_name, ''), v_contract.contract_number || ' fully executed.pdf'),
    'signed_contract',
    p_storage_path,
    null,
    auth.uid(),
    'Generated by Manager → Executive → Customer signature workflow',
    v_group_id,
    1,
    true,
    p_file_size,
    'application/pdf'
  )
  returning id into v_doc_id;

  update public.contracts
  set
    status = 'active',
    signed_date = (v_now at time zone 'utc')::date,
    updated_by = auth.uid(),
    updated_at = v_now
  where id = v_packet.contract_id;

  update public.contract_signature_packets
  set
    status = 'fully_executed',
    storage_path = p_storage_path,
    document_id = v_doc_id,
    updated_at = v_now
  where id = v_packet.id
  returning * into v_packet;

  return v_packet;
end;
$$;

-- Reject: allow executive as well
create or replace function public.reject_contract_signature_packet(
  p_packet_id uuid,
  p_reason text
)
returns public.contract_signature_packets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.contract_signature_packets;
  v_role text;
  v_now timestamptz := now();
begin
  select * into v_packet
  from public.contract_signature_packets
  where id = p_packet_id
  for update;

  if not found then
    raise exception 'Signature packet not found';
  end if;

  v_role := public.current_profile_role();
  if v_role not in ('admin', 'manager', 'executive')
     and not public.customer_owns_contract(v_packet.contract_id) then
    raise exception 'Not allowed to reject this packet';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.contract_signature_packets
  set
    status = 'rejected',
    rejection_reason = trim(p_reason),
    rejected_by = auth.uid(),
    rejected_at = v_now,
    updated_at = v_now
  where id = v_packet.id
  returning * into v_packet;

  update public.contracts
  set
    status = 'draft',
    updated_by = auth.uid(),
    updated_at = v_now
  where id = v_packet.contract_id;

  return v_packet;
end;
$$;

-- Role page permissions for executive (contracts + home)
alter table public.role_page_permissions drop constraint if exists role_page_permissions_role_check;
alter table public.role_page_permissions
  add constraint role_page_permissions_role_check
  check (role = any (array['admin', 'manager', 'technician', 'billing', 'customer', 'hr', 'executive']));

insert into public.role_page_permissions (role, page_key, can_view)
select v.role, v.page_key, v.can_view
from (
  values
    ('executive', 'home', true),
    ('executive', 'contracts', true),
    ('executive', 'contracts_reports', true),
    ('executive', 'contracts_renewals', true),
    ('executive', 'customers', true)
) as v(role, page_key, can_view)
where not exists (
  select 1 from public.role_page_permissions r
  where r.role = v.role and r.page_key = v.page_key
);

-- Demo executive auth user + profile (password 1234, same bcrypt as other demos)
do $$
declare
  v_id uuid := '11111111-1111-1111-1111-111111111112';
  v_email text := 'executive@servicesync.demo';
  v_hash text := '$2a$06$qPD71lYvvDV6LSEjdD.VCOCt/dB2/oFVQvIlClNPy4.cCAzrzM4CC';
begin
  if not exists (select 1 from auth.users where id = v_id or email = v_email) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      v_email,
      v_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Jordan Hale', 'role', 'executive'),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      v_id,
      v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email',
      v_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.profiles (
    id, email, full_name, role, customer_id, is_demo_user, is_active
  ) values (
    v_id, v_email, 'Jordan Hale', 'executive', null, true, true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'executive',
    is_demo_user = true,
    is_active = true;

  insert into public.employees (full_name, title, department, role, email, notes)
  select
    'Jordan Hale',
    'Chief Executive Officer',
    'Executive Office',
    'executive',
    v_email,
    'Primary executive demo login'
  where not exists (
    select 1 from public.employees e where e.full_name = 'Jordan Hale'
  );
end $$;
