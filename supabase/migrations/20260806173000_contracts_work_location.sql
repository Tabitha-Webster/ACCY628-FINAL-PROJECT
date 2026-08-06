-- Work location drives remote vs on-site pricing for contract billing.
alter table public.contracts
  add column if not exists work_location text;

alter table public.contracts
  drop constraint if exists contracts_work_location_check;

alter table public.contracts
  add constraint contracts_work_location_check
  check (
    work_location is null
    or work_location in ('remote', 'on_site')
  );

comment on column public.contracts.work_location is
  'Primary delivery mode: remote (lower fee) or on_site (higher fee for travel). monthly_recurring_fee is the base amount; billing applies a location multiplier.';
