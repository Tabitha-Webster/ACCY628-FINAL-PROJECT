-- Contracts become active from the signature workflow only (except reactivation).

create or replace function public.enforce_contract_activation_via_signatures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'active'
     and old.status is distinct from 'active' then
    -- Reactivation / renewals may return to active without a new signature packet.
    if old.status in ('on_hold', 'renewed', 'expired') then
      return new;
    end if;

    if not exists (
      select 1
      from public.contract_signature_packets p
      where p.contract_id = new.id
        and p.is_current = true
        and p.manager_signature_data is not null
        and p.executive_signature_data is not null
        and p.customer_signature_data is not null
    ) then
      raise exception
        'Contract becomes Active only after manager, executive, and customer signatures.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists contracts_enforce_activation_via_signatures on public.contracts;

create trigger contracts_enforce_activation_via_signatures
before update of status on public.contracts
for each row
execute function public.enforce_contract_activation_via_signatures();
