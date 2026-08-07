-- Seed three Chad Corporation draft contracts for demo (View and Edit → Draft filter).
-- Idempotent on fixed UUIDs.

INSERT INTO public.contracts (
  id,
  customer_id,
  contract_number,
  name,
  status,
  contract_type,
  start_date,
  end_date,
  effective_date,
  monthly_recurring_fee,
  included_hours_per_month,
  additional_hourly_rate,
  work_location,
  renewal_type,
  billing_frequency,
  billing_timing,
  payment_terms,
  assigned_manager_id,
  scope,
  description,
  included_services,
  version_number,
  overages_allowed
)
VALUES
(
  '33333333-3333-3333-3333-3333333333d1'::uuid,
  '22222222-2222-2222-2222-222222222201'::uuid,
  'CTR-1010',
  'Chad Corp. Demo Draft — Help Desk Expansion',
  'draft'::contract_status,
  'managed_support'::contract_type,
  current_date,
  current_date + 365,
  current_date,
  4200,
  40,
  150,
  'remote',
  'manual'::renewal_type,
  'monthly'::billing_frequency,
  'in_advance'::billing_timing,
  'Net 30',
  '11111111-1111-1111-1111-111111111101'::uuid,
  'Expand weekday help-desk coverage and remote endpoint support for Chad Corporation.',
  'Demo draft for tomorrow — complete and send for signatures from View and Edit Contracts.',
  'Help desk / service desk support
Remote monitoring and management (RMM)
Password resets and account administration',
  1,
  true
),
(
  '33333333-3333-3333-3333-3333333333d2'::uuid,
  '22222222-2222-2222-2222-222222222201'::uuid,
  'CTR-1011',
  'Chad Corp. Demo Draft — Network Assessment',
  'draft'::contract_status,
  'project_only'::contract_type,
  current_date,
  current_date + 90,
  current_date,
  0,
  0,
  175,
  'on_site',
  'none'::renewal_type,
  'one_time'::billing_frequency,
  'in_arrears'::billing_timing,
  'Net 15',
  '11111111-1111-1111-1111-111111111101'::uuid,
  'On-site network health check, switch inventory, and remediation recommendations.',
  'Demo draft for tomorrow — project-only agreement ready to finish in New Contract / Edit.',
  'Network monitoring
Documentation and runbooks
Vendor coordination',
  1,
  false
),
(
  '33333333-3333-3333-3333-3333333333d3'::uuid,
  '22222222-2222-2222-2222-222222222201'::uuid,
  'CTR-1012',
  'Chad Corp. Demo Draft — M365 Onboarding Pack',
  'draft'::contract_status,
  'included_hours'::contract_type,
  current_date,
  current_date + 365,
  current_date,
  3600,
  25,
  160,
  'remote',
  'auto'::renewal_type,
  'monthly'::billing_frequency,
  'in_advance'::billing_timing,
  'Net 30',
  '11111111-1111-1111-1111-111111111101'::uuid,
  'Microsoft 365 tenant onboarding, mailbox migration assist, and included support hours.',
  'Demo draft for tomorrow — included-hours managed agreement for signature walkthrough.',
  'Email / Microsoft 365 administration
User onboarding and offboarding
Help desk / service desk support',
  1,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = 'draft'::contract_status,
  updated_at = now();
