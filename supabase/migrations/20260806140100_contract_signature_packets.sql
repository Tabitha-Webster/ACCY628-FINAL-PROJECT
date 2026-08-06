-- Contract PDF signature workflow: Manager → Admin → Customer

create table if not exists public.contract_signature_packets (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_admin', 'awaiting_customer', 'fully_executed', 'rejected')),
  is_current boolean not null default true,
  storage_path text null,
  document_id uuid null references public.contract_documents(id) on delete set null,

  manager_signed_by uuid null references public.profiles(id),
  manager_signed_at timestamptz null,
  manager_signature_data text null,
  manager_signer_name text null,

  admin_signed_by uuid null references public.profiles(id),
  admin_signed_at timestamptz null,
  admin_signature_data text null,
  admin_signer_name text null,

  customer_signed_by uuid null references public.profiles(id),
  customer_signed_at timestamptz null,
  customer_signature_data text null,
  customer_signer_name text null,

  rejection_reason text null,
  rejected_by uuid null references public.profiles(id),
  rejected_at timestamptz null,

  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_signature_packets_contract_id_idx
  on public.contract_signature_packets (contract_id);

create index if not exists contract_signature_packets_status_idx
  on public.contract_signature_packets (status);

create unique index if not exists contract_signature_packets_one_current_idx
  on public.contract_signature_packets (contract_id)
  where is_current;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.customer_owns_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    join public.profiles p on p.id = auth.uid()
    where c.id = p_contract_id
      and p.role::text = 'customer'
      and p.customer_id is not null
      and p.customer_id = c.customer_id
  );
$$;

alter table public.contract_signature_packets enable row level security;

drop policy if exists "signature_packets_select" on public.contract_signature_packets;
create policy "signature_packets_select"
on public.contract_signature_packets
for select
to authenticated
using (
  public.current_profile_role() in ('admin', 'manager', 'billing', 'technician', 'hr')
  or public.customer_owns_contract(contract_id)
);

drop policy if exists "signature_packets_insert" on public.contract_signature_packets;
create policy "signature_packets_insert"
on public.contract_signature_packets
for insert
to authenticated
with check (
  public.current_profile_role() in ('admin', 'manager')
  and created_by = auth.uid()
);

drop policy if exists "signature_packets_update" on public.contract_signature_packets;
create policy "signature_packets_update"
on public.contract_signature_packets
for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'manager')
  or (
    public.customer_owns_contract(contract_id)
    and status = 'awaiting_customer'
  )
)
with check (
  public.current_profile_role() in ('admin', 'manager')
  or (
    public.customer_owns_contract(contract_id)
    and status in ('awaiting_customer', 'fully_executed', 'rejected')
  )
);

-- Expand contract-documents storage so admin can manage files and customers can read.
drop policy if exists "contract_docs_storage_select" on storage.objects;
create policy "contract_docs_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'contract-documents'
  and (
    public.current_user_role() = any (array['manager'::user_role, 'admin'::user_role, 'billing'::user_role, 'technician'::user_role])
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
  and public.current_user_role() = any (array['manager'::user_role, 'admin'::user_role])
);

drop policy if exists "contract_docs_storage_update" on storage.objects;
create policy "contract_docs_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'contract-documents'
  and public.current_user_role() = any (array['manager'::user_role, 'admin'::user_role])
)
with check (
  bucket_id = 'contract-documents'
  and public.current_user_role() = any (array['manager'::user_role, 'admin'::user_role])
);

drop policy if exists "contract_docs_storage_delete" on storage.objects;
create policy "contract_docs_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'contract-documents'
  and public.current_user_role() = any (array['manager'::user_role, 'admin'::user_role])
);
