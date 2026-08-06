-- Seed 4 contracts awaiting executive signature (manager already signed).
-- 2 for Chad Corporation, 1 for The Lyric Oxford, 1 for Square Books.

do $$
declare
  v_manager uuid := '11111111-1111-1111-1111-111111111101';
  v_chad uuid := '22222222-2222-2222-2222-222222222201';
  v_lyric uuid := '22222222-2222-2222-2222-222222222203';
  v_square uuid := '22222222-2222-2222-2222-222222222205';
  v_sig text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC';
  v_signed_at timestamptz := now() - interval '1 day';
begin
  insert into public.contracts (
    id, customer_id, contract_number, name, status, contract_type,
    start_date, end_date, effective_date, renewal_type,
    assigned_manager_id, created_by, updated_by,
    description, scope,
    monthly_recurring_fee, included_hours_per_month, additional_hourly_rate,
    billing_frequency, billing_timing, payment_terms, billing_method,
    requires_customer_approval, requires_manager_approval
  )
  values
    (
      '33333333-3333-3333-3333-333333333321',
      v_chad,
      'CTR-1006',
      'Chad Corp. Security Monitoring Add-On',
      'pending_approval',
      'managed_plus_project',
      '2026-09-01',
      '2027-08-31',
      '2026-09-01',
      'manual',
      v_manager,
      v_manager,
      v_manager,
      'SOC-style monitoring and alerting add-on awaiting executive signature.',
      '24x7 monitoring for Chad Corporation endpoints and identity systems.',
      2200,
      10,
      185,
      'monthly',
      'in_advance',
      'Net 30',
      'invoice',
      true,
      true
    ),
    (
      '33333333-3333-3333-3333-333333333322',
      v_chad,
      'CTR-1007',
      'Chad Corp. Backup & DR Expansion',
      'pending_approval',
      'included_hours',
      '2026-10-01',
      '2028-09-30',
      '2026-10-01',
      'auto',
      v_manager,
      v_manager,
      v_manager,
      'Expanded backup retention and DR runbooks awaiting executive signature.',
      'Cloud backup, quarterly DR tests, and documented recovery procedures.',
      3100,
      20,
      180,
      'monthly',
      'in_advance',
      'Net 30',
      'invoice',
      true,
      true
    ),
    (
      '33333333-3333-3333-3333-333333333323',
      v_lyric,
      'CTR-3003',
      'The Lyric Oxford AV Support Renewal',
      'pending_approval',
      'managed_support',
      '2026-10-01',
      '2027-09-30',
      '2026-10-01',
      'manual',
      v_manager,
      v_manager,
      v_manager,
      'Venue AV and network support renewal awaiting executive signature.',
      'On-call AV support for show nights plus monthly network health checks.',
      2600,
      25,
      165,
      'monthly',
      'in_advance',
      'Net 15',
      'invoice',
      true,
      true
    ),
    (
      '33333333-3333-3333-3333-333333333324',
      v_square,
      'CTR-5002',
      'Square Books Point-of-Sale Support',
      'pending_approval',
      'included_hours',
      '2026-09-15',
      '2027-09-14',
      '2026-09-15',
      'manual',
      v_manager,
      v_manager,
      v_manager,
      'POS and storefront Wi-Fi support agreement awaiting executive signature.',
      'Included hours for POS troubleshooting, printer support, and guest Wi-Fi.',
      1450,
      12,
      150,
      'monthly',
      'in_advance',
      'Net 30',
      'invoice',
      true,
      true
    )
  on conflict (id) do update
  set
    status = excluded.status,
    name = excluded.name,
    updated_at = now(),
    updated_by = excluded.updated_by;

  insert into public.contract_signature_packets (
    id, contract_id, status, is_current, created_by,
    manager_signed_by, manager_signed_at, manager_signature_data, manager_signer_name,
    created_at, updated_at
  )
  values
    (
      '44444444-4444-4444-4444-444444444421',
      '33333333-3333-3333-3333-333333333321',
      'awaiting_executive',
      true,
      v_manager,
      v_manager,
      v_signed_at,
      v_sig,
      'Emilie Pierson',
      v_signed_at,
      v_signed_at
    ),
    (
      '44444444-4444-4444-4444-444444444422',
      '33333333-3333-3333-3333-333333333322',
      'awaiting_executive',
      true,
      v_manager,
      v_manager,
      v_signed_at + interval '2 hours',
      v_sig,
      'Emilie Pierson',
      v_signed_at + interval '2 hours',
      v_signed_at + interval '2 hours'
    ),
    (
      '44444444-4444-4444-4444-444444444423',
      '33333333-3333-3333-3333-333333333323',
      'awaiting_executive',
      true,
      v_manager,
      v_manager,
      v_signed_at + interval '4 hours',
      v_sig,
      'Emilie Pierson',
      v_signed_at + interval '4 hours',
      v_signed_at + interval '4 hours'
    ),
    (
      '44444444-4444-4444-4444-444444444424',
      '33333333-3333-3333-3333-333333333324',
      'awaiting_executive',
      true,
      v_manager,
      v_manager,
      v_signed_at + interval '6 hours',
      v_sig,
      'Emilie Pierson',
      v_signed_at + interval '6 hours',
      v_signed_at + interval '6 hours'
    )
  on conflict (id) do update
  set
    status = excluded.status,
    is_current = true,
    manager_signed_by = excluded.manager_signed_by,
    manager_signed_at = excluded.manager_signed_at,
    manager_signature_data = excluded.manager_signature_data,
    manager_signer_name = excluded.manager_signer_name,
    updated_at = now();

  -- Also attach a packet to existing Chad pending renewal so it appears in the executive queue.
  insert into public.contract_signature_packets (
    id, contract_id, status, is_current, created_by,
    manager_signed_by, manager_signed_at, manager_signature_data, manager_signer_name,
    created_at, updated_at
  )
  values (
    '44444444-4444-4444-4444-444444444417',
    '33333333-3333-3333-3333-333333333317',
    'awaiting_executive',
    true,
    v_manager,
    v_manager,
    v_signed_at - interval '3 hours',
    v_sig,
    'Emilie Pierson',
    v_signed_at - interval '3 hours',
    v_signed_at - interval '3 hours'
  )
  on conflict (id) do update
  set
    status = 'awaiting_executive',
    is_current = true,
    manager_signed_by = excluded.manager_signed_by,
    manager_signed_at = excluded.manager_signed_at,
    manager_signature_data = excluded.manager_signature_data,
    manager_signer_name = excluded.manager_signer_name,
    updated_at = now();
end;
$$;
