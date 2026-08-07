-- Fill incomplete contract commercial / coverage fields without changing status.
-- Project: ACCY628-FINAL-PROJECT (icymsjpkfddfrbbazxss)
-- Safe-ish to re-run: mostly fills nulls/blanks; expands thin service lists; fills sparse draft MRR/hours.

with techs as (
  select id, row_number() over (order by full_name) as rn
  from public.profiles
  where role = 'technician'::user_role
    and is_active = true
    and email not like 'test%'
),
tech_count as (
  select greatest(count(*)::int, 1) as n from techs
),
mgr as (
  select id from public.profiles where email = 'manager@servicesync.demo' limit 1
),
mgr2 as (
  select id from public.profiles where email = 'manager2@servicesync.demo' limit 1
),
ranked as (
  select
    c.id,
    c.contract_number,
    c.contract_type,
    c.status,
    c.start_date,
    c.end_date,
    c.effective_date,
    c.billing_frequency,
    c.work_location,
    c.remote_support,
    c.onsite_support,
    c.monthly_recurring_fee,
    c.included_hours_per_month,
    c.one_time_setup_fee,
    c.deposit_amount,
    c.additional_hourly_rate,
    c.renewal_type,
    cu.name as customer_name,
    cu.billing_contact_name,
    cu.billing_contact_email,
    cu.primary_contact,
    cu.contact_email,
    cu.service_address,
    cu.city,
    cu.state,
    cu.credit_terms,
    row_number() over (order by c.contract_number) as rn,
    case
      when c.monthly_recurring_fee = 0
        and c.contract_type not in ('project_only', 'unlimited_remote')
        and c.one_time_setup_fee = 0
        and c.status in ('draft', 'pending_approval')
      then case c.contract_number
        when 'CTR-9003' then 3500::numeric
        when 'CTR-9005' then 2800::numeric
        else 2500::numeric
      end
      else c.monthly_recurring_fee
    end as target_mrr,
    case
      when c.included_hours_per_month = 0
        and c.contract_type not in ('project_only', 'unlimited_remote')
        and c.status in ('draft', 'pending_approval')
      then case c.contract_number
        when 'CTR-9003' then 30::numeric
        when 'CTR-9005' then 25::numeric
        else 20::numeric
      end
      else c.included_hours_per_month
    end as target_hours,
    coalesce(
      nullif(btrim(c.work_location), ''),
      case
        when c.onsite_support is true and coalesce(c.remote_support, false) is false then 'on_site'
        when c.contract_type = 'project_only' then 'on_site'
        when c.contract_type = 'unlimited_remote' then 'remote'
        else 'remote'
      end
    ) as target_location
  from public.contracts c
  join public.customers cu on cu.id = c.customer_id
)
update public.contracts c
set
  work_location = r.target_location,
  remote_support = case when r.target_location = 'remote' then true else coalesce(c.remote_support, true) end,
  onsite_support = case when r.target_location = 'on_site' then true else coalesce(c.onsite_support, true) end,
  assigned_manager_id = coalesce(c.assigned_manager_id, (select id from mgr), (select id from mgr2)),
  assigned_technician_id = coalesce(
    c.assigned_technician_id,
    (select t.id from techs t, tech_count tc where t.rn = ((r.rn - 1) % tc.n) + 1 limit 1)
  ),
  sales_representative_id = coalesce(c.sales_representative_id, (select id from mgr2), (select id from mgr)),
  description = case
    when c.description is null or btrim(c.description) = '' then
      format('%s agreement for %s covering managed IT operations aligned to the contracted service model.',
        initcap(replace(c.contract_type::text, '_', ' ')), r.customer_name)
    else c.description
  end,
  scope = case
    when c.scope is null or btrim(c.scope) = '' then
      case c.contract_type
        when 'project_only' then format('Scoped project delivery for %s including discovery, implementation, testing, and handoff.', r.customer_name)
        when 'unlimited_remote' then format('Unlimited remote help desk and monitoring for %s during contracted coverage hours.', r.customer_name)
        when 'pass_through' then format('Pass-through vendor coordination and MSP oversight for %s with billed reimbursables.', r.customer_name)
        else format('Ongoing support for %s including help desk, RMM, patching, backups, and scheduled reviews.', r.customer_name)
      end
    else c.scope
  end,
  billing_contact = case
    when c.billing_contact is null or btrim(c.billing_contact) = '' then
      coalesce(
        nullif(btrim(concat_ws(' — ', nullif(r.billing_contact_name, ''), nullif(r.billing_contact_email, ''))), ''),
        nullif(btrim(concat_ws(' — ', nullif(r.primary_contact, ''), nullif(r.contact_email, ''))), ''),
        format('Accounts Payable — billing@%s.example', lower(regexp_replace(r.customer_name, '[^a-zA-Z0-9]+', '', 'g')))
      )
    else c.billing_contact
  end,
  end_date = coalesce(c.end_date, (coalesce(c.effective_date, c.start_date) + interval '1 year')::date),
  effective_date = coalesce(c.effective_date, c.start_date),
  renewal_type = coalesce(c.renewal_type, case when c.contract_type = 'project_only' then 'none'::renewal_type else 'manual'::renewal_type end),
  renewal_terms = case
    when c.renewal_terms is null or btrim(c.renewal_terms) = '' then
      case coalesce(c.renewal_type, case when c.contract_type = 'project_only' then 'none'::renewal_type else 'manual'::renewal_type end)
        when 'auto' then 'Auto-renews for successive 12-month terms unless canceled with written notice.'
        when 'none' then 'Does not auto-renew. Extension requires a new statement of work or agreement.'
        else 'Renews by mutual written agreement prior to the end date.'
      end
    else c.renewal_terms
  end,
  cancellation_terms = case
    when c.cancellation_terms is null or btrim(c.cancellation_terms) = '' then
      'Either party may cancel with written notice per the notice period; prepaid fees are non-refundable except as required by law.'
    else c.cancellation_terms
  end,
  cancellation_notice_days = coalesce(c.cancellation_notice_days, 30),
  monthly_recurring_fee = r.target_mrr,
  included_hours_per_month = r.target_hours,
  one_time_setup_fee = case
    when c.contract_type in ('project_only', 'managed_plus_project')
      and coalesce(c.one_time_setup_fee, 0) = 0
      and c.monthly_recurring_fee = 0
      then greatest(coalesce(c.deposit_amount, 0), 2500)
    else c.one_time_setup_fee
  end,
  deposit_amount = coalesce(c.deposit_amount, 0),
  additional_hourly_rate = case when coalesce(c.additional_hourly_rate, 0) <= 0 then 150 else c.additional_hourly_rate end,
  overages_allowed = coalesce(c.overages_allowed, true),
  overage_charges = coalesce(c.overage_charges, 0),
  billing_frequency = coalesce(c.billing_frequency, case when c.contract_type = 'project_only' then 'one_time'::billing_frequency else 'monthly'::billing_frequency end),
  billing_method = coalesce(nullif(btrim(c.billing_method), ''), 'invoice'),
  billing_timing = coalesce(c.billing_timing, 'in_advance'::billing_timing),
  payment_terms = coalesce(nullif(btrim(c.payment_terms), ''), nullif(btrim(r.credit_terms), ''), 'Net 30'),
  billing_status = coalesce(c.billing_status, 'unbilled'::billing_status),
  next_invoice_date = case
    when c.next_invoice_date is not null then c.next_invoice_date
    when c.status in ('expired', 'canceled') then null
    when coalesce(c.billing_frequency, 'monthly') = 'one_time' then coalesce(c.effective_date, c.start_date)
    when c.status in ('active', 'pending_approval', 'draft') then (date_trunc('month', current_date) + interval '1 month')::date
    else c.next_invoice_date
  end,
  software_markup_pct = coalesce(c.software_markup_pct, 0.15),
  equipment_markup_pct = coalesce(c.equipment_markup_pct, 0.20),
  reimbursable_cost_policy = coalesce(nullif(btrim(c.reimbursable_cost_policy), ''), 'Pre-approved reimbursables billed at cost plus contracted markup.'),
  late_fee_terms = coalesce(nullif(btrim(c.late_fee_terms), ''), '1.5% per month on past-due balances.'),
  tax_status = coalesce(nullif(btrim(c.tax_status), ''), 'taxable'),
  change_request_procedure = coalesce(nullif(btrim(c.change_request_procedure), ''), 'Submit a written change request through the ServiceSync portal for manager review.'),
  included_services = case
    when c.included_services is null or btrim(c.included_services) = '' or length(btrim(c.included_services)) < 40 then
      case c.contract_type
        when 'project_only' then
          E'Workstation setup and imaging\nDocumentation and runbooks\nVendor coordination\nNetwork monitoring'
        when 'unlimited_remote' then
          E'Help desk / service desk support\nRemote monitoring and management (RMM)\nPatch management\nAntivirus / endpoint protection\nPassword resets and account administration\nEmail / Microsoft 365 administration'
        when 'pass_through' then
          E'Vendor coordination\nHelp desk / service desk support\nRemote monitoring and management (RMM)\nQuarterly business / IT reviews'
        else
          E'Help desk / service desk support\nRemote monitoring and management (RMM)\nPatch management\nAntivirus / endpoint protection\nBackup monitoring and restore assistance\nNetwork monitoring\nEmail / Microsoft 365 administration\nQuarterly business / IT reviews'
      end
    else c.included_services
  end,
  excluded_services = case
    when c.excluded_services is null or btrim(c.excluded_services) = '' or length(btrim(c.excluded_services)) < 20 then
      E'New hardware purchases\nApplication development / custom software\nMajor project work (migrations, refreshes)\nThird-party SaaS licensing costs'
    else c.excluded_services
  end,
  supported_locations = case
    when c.supported_locations is null or btrim(c.supported_locations) = '' then
      coalesce(
        nullif(btrim(concat_ws(', ', nullif(r.service_address, ''), nullif(r.city, ''), nullif(r.state, ''))), ''),
        format('%s primary location', r.customer_name)
      )
    else c.supported_locations
  end,
  supported_users_devices = case
    when c.supported_users_devices is null or btrim(c.supported_users_devices) = '' then
      case
        when r.target_hours >= 50 then '60 users / 75 endpoints'
        when r.target_hours >= 30 then '40 users / 50 endpoints'
        when r.target_hours >= 15 then '25 users / 30 endpoints'
        when c.contract_type = 'unlimited_remote' then '20 users / 25 endpoints'
        when c.contract_type = 'project_only' then 'Project-scoped devices only'
        else '15 users / 20 endpoints'
      end
    else c.supported_users_devices
  end,
  after_hours_terms = case
    when c.after_hours_terms is null or btrim(c.after_hours_terms) = '' then
      'Critical (P1) incidents covered after hours; all other priorities handled next business day unless pre-approved.'
    else c.after_hours_terms
  end,
  sla_critical_response_hours = coalesce(c.sla_critical_response_hours, 1),
  sla_high_response_hours = coalesce(c.sla_high_response_hours, 4),
  sla_medium_response_hours = coalesce(c.sla_medium_response_hours, 8),
  sla_low_response_hours = coalesce(c.sla_low_response_hours, 24),
  sla_response_hours = coalesce(c.sla_response_hours, 4),
  sla_resolution_hours = coalesce(c.sla_resolution_hours, 24),
  updated_at = now()
from ranked r
where c.id = r.id;
