-- Two additional Chad Corp contracts awaiting executive signature.

do $$
declare
  v_manager uuid := '11111111-1111-1111-1111-111111111101';
  v_chad uuid := '22222222-2222-2222-2222-222222222201';
  v_sig text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC';
  v_signed_at timestamptz := now() - interval '6 hours';
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
      '33333333-3333-3333-3333-333333333325',
      v_chad,
      'CTR-1008',
      'Chad Corp. Endpoint Protection Suite',
      'pending_approval',
      'managed_plus_project',
      '2026-11-01',
      '2027-10-31',
      '2026-11-01',
      'manual',
      v_manager,
      v_manager,
      v_manager,
      'Managed endpoint protection rollout awaiting executive signature.',
      'EDR licensing, onboarding, and quarterly threat reviews for Chad Corporation.',
      2750,
      15,
      185,
      'monthly',
      'in_advance',
      'Net 30',
      'invoice',
      true,
      true
    ),
    (
      '33333333-3333-3333-3333-333333333326',
      v_chad,
      'CTR-1009',
      'Chad Corp. Identity & Access Governance',
      'pending_approval',
      'included_hours',
      '2026-11-15',
      '2027-11-14',
      '2026-11-15',
      'auto',
      v_manager,
      v_manager,
      v_manager,
      'Identity lifecycle and access review services awaiting executive signature.',
      'SSO support, quarterly access certifications, and privileged account reviews.',
      1950,
      12,
      175,
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
      '44444444-4444-4444-4444-444444444425',
      '33333333-3333-3333-3333-333333333325',
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
      '44444444-4444-4444-4444-444444444426',
      '33333333-3333-3333-3333-333333333326',
      'awaiting_executive',
      true,
      v_manager,
      v_manager,
      v_signed_at + interval '1 hour',
      v_sig,
      'Emilie Pierson',
      v_signed_at + interval '1 hour',
      v_signed_at + interval '1 hour'
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
