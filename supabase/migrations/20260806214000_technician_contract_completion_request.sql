-- Technician → manager: request that an active contract be marked completed.
-- RPC bypasses insert RLS on contract_changes while still enforcing role + active status.

create or replace function public.request_contract_completion(
  p_contract_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
  v_reason text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_role is distinct from 'technician'::public.user_role then
    raise exception 'Only technicians can request contract completion';
  end if;

  if not exists (
    select 1
    from public.contracts c
    where c.id = p_contract_id
      and c.status = 'active'
  ) then
    raise exception 'Contract must be active to request completion';
  end if;

  v_reason := nullif(trim(coalesce(p_note, '')), '');
  if v_reason is null then
    v_reason := 'Technician reports this contract is ready to complete.';
  end if;

  insert into public.contract_changes (
    contract_id,
    field_name,
    previous_value,
    new_value,
    change_reason,
    changed_by,
    source
  ) values (
    p_contract_id,
    'completion_request',
    null,
    'requested',
    v_reason,
    v_uid,
    'technician'
  );
end;
$$;

create or replace function public.acknowledge_contract_completion_request(
  p_contract_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role := public.current_user_role();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_role is distinct from 'manager'::public.user_role
     and v_role is distinct from 'admin'::public.user_role then
    raise exception 'Only managers can acknowledge completion requests';
  end if;

  insert into public.contract_changes (
    contract_id,
    field_name,
    previous_value,
    new_value,
    change_reason,
    changed_by,
    source
  ) values (
    p_contract_id,
    'completion_request',
    'requested',
    'acknowledged',
    'Manager acknowledged technician completion request.',
    v_uid,
    'manager'
  );
end;
$$;

grant execute on function public.request_contract_completion(uuid, text) to authenticated;
grant execute on function public.acknowledge_contract_completion_request(uuid) to authenticated;

comment on function public.request_contract_completion(uuid, text) is
  'Technician notifies manager that an active contract is ready to complete (does not change status).';
comment on function public.acknowledge_contract_completion_request(uuid) is
  'Manager acknowledges a technician contract-completion request.';
