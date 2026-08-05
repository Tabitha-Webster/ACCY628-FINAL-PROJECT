-- Support-ticket / technician-workspace module seed data (fictional).
-- Idempotent: removes only prior "Module seed:" rows, then re-inserts.
-- Does not delete other teams' seed data (including "SLA demo:" tickets).

-- ---------------------------------------------------------------------------
-- Cleanup prior module seeds only
-- ---------------------------------------------------------------------------
DELETE FROM public.additional_work_requests
WHERE support_ticket_id IN (
  SELECT id FROM public.support_tickets WHERE title LIKE 'Module seed:%'
);

DELETE FROM public.time_entries
WHERE support_ticket_id IN (
  SELECT id FROM public.support_tickets WHERE title LIKE 'Module seed:%'
)
OR description LIKE 'Module seed:%';

DELETE FROM public.direct_costs
WHERE support_ticket_id IN (
  SELECT id FROM public.support_tickets WHERE title LIKE 'Module seed:%'
)
OR description LIKE 'Module seed:%';

DELETE FROM public.support_tickets
WHERE title LIKE 'Module seed:%';

-- ---------------------------------------------------------------------------
-- Fixed UUIDs for linked child rows
-- ---------------------------------------------------------------------------
-- Customers / contracts (existing)
-- Apex CTR-1001, Northwind CTR-2001, Harbor CTR-3001, Brightpath CTR-4001,
-- Summit CTR-5001 (20 included hrs), Cedar Grove CTR-6001, Lumen CTR-7001
-- Technicians: Taylor, Riley, Sam, Alex, Jamie, Chris
-- Manager: Morgan Hale | Customer submitter: Casey Ortiz (Apex)

WITH seeded AS (
  INSERT INTO public.support_tickets (
    id, customer_id, contract_id, created_by, assigned_technician_id,
    title, description, priority, status, service_category,
    submitted_at, target_response_at, target_resolution_at,
    actual_response_at, completed_at, completed_by,
    technician_notes, completion_notes, customer_resolution_summary,
    no_time_explanation, classification, billable_approval_status,
    customer_confirmed
  )
  VALUES
  -- 1) New unassigned
  (
    'a1111111-1111-4111-8111-000000000001',
    '22222222-2222-2222-2222-222222222201',
    '33333333-3333-3333-3333-333333333301',
    '11111111-1111-1111-1111-111111111109',
    NULL,
    'Module seed: New unassigned mailbox sync',
    'Fictional Apex user reports Outlook is stuck on "Updating Inbox" since this morning. No error code shown.',
    'medium', 'new', 'Email',
    now() - interval '35 minutes',
    now() + interval '3 hours 25 minutes',
    now() + interval '7 hours 25 minutes',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 2) Assigned
  (
    'a1111111-1111-4111-8111-000000000002',
    '22222222-2222-2222-2222-222222222202',
    '33333333-3333-3333-3333-333333333303',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111102',
    'Module seed: Assigned clinic WAN flap',
    'Fictional Northwind clinic reports intermittent WAN drops on the front-desk VLAN during peak hours.',
    'high', 'assigned', 'Network',
    now() - interval '50 minutes',
    now() + interval '10 minutes',
    now() + interval '3 hours 10 minutes',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 3) In progress
  (
    'a1111111-1111-4111-8111-000000000003',
    '22222222-2222-2222-2222-222222222203',
    '33333333-3333-3333-3333-333333333304',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111103',
    'Module seed: In progress warehouse printer',
    'Fictional Harbor Freight dock printer queues jobs but never prints packing labels.',
    'medium', 'in_progress', 'Printer',
    now() - interval '2 hours',
    now() + interval '6 hours',
    now() + interval '14 hours',
    now() - interval '90 minutes', NULL, NULL,
    '[Mar 1] Cleared spooler and reinstalled driver. Testing label stock next.',
    NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 4) Waiting on customer
  (
    'a1111111-1111-4111-8111-000000000004',
    '22222222-2222-2222-2222-222222222204',
    '33333333-3333-3333-3333-333333333306',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111104',
    'Module seed: Waiting on customer license key',
    'Fictional Brightpath lab software needs a renewed license key from the vendor portal (customer owns the account).',
    'low', 'waiting_on_customer', 'Software',
    now() - interval '1 day',
    now() - interval '8 hours',
    now() + interval '16 hours',
    now() - interval '20 hours', NULL, NULL,
    '[Yesterday] Sent instructions to campus IT contact for license download.',
    NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 5) Waiting on approval (OOS ticket shell — details in twin below too)
  (
    'a1111111-1111-4111-8111-000000000005',
    '22222222-2222-2222-2222-222222222201',
    '33333333-3333-3333-3333-333333333301',
    '11111111-1111-1111-1111-111111111109',
    '11111111-1111-1111-1111-111111111105',
    'Module seed: Waiting approval custom report',
    'Fictional Apex request for a one-off litigation hold export not covered by the managed support package.',
    'high', 'waiting_on_approval', 'Other',
    now() - interval '6 hours',
    now() - interval '2 hours',
    now() + interval '2 hours',
    now() - interval '5 hours', NULL, NULL,
    '[Today] Confirmed work is outside included services. Pending manager approval before continuing.',
    NULL, NULL, NULL,
    'out_of_scope', 'pending', false
  ),
  -- 6) Resolved — SLA Met
  (
    'a1111111-1111-4111-8111-000000000006',
    '22222222-2222-2222-2222-222222222202',
    '33333333-3333-3333-3333-333333333303',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111106',
    'Module seed: Resolved Met SLA password reset',
    'Fictional Northwind nurse locked out of the EHR workstation before morning clinic.',
    'medium', 'resolved', 'Password Reset',
    now() - interval '5 hours',
    now() - interval '3 hours',
    now() - interval '1 hour',
    now() - interval '4 hours 30 minutes',
    now() - interval '3 hours 45 minutes',
    '11111111-1111-1111-1111-111111111106',
    '[Today] Verified identity, reset password, confirmed EHR login.',
    'Password reset completed and verified with the nurse on site.',
    'Your EHR password was reset and you should be able to sign in normally.',
    NULL,
    'included', 'not_required', false
  ),
  -- 7) Closed
  (
    'a1111111-1111-4111-8111-000000000007',
    '22222222-2222-2222-2222-222222222203',
    '33333333-3333-3333-3333-333333333304',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111107',
    'Module seed: Closed keyboard replacement',
    'Fictional Harbor office keyboard failed; swapped from spare inventory.',
    'low', 'closed', 'Hardware',
    now() - interval '3 days',
    now() - interval '2 days 16 hours',
    now() - interval '2 days',
    now() - interval '2 days 20 hours',
    now() - interval '2 days 18 hours',
    '11111111-1111-1111-1111-111111111107',
    '[Mon] Replaced keyboard and confirmed typing in shipping app.',
    'Replaced faulty keyboard from on-hand spare stock.',
    'A replacement keyboard was installed and tested.',
    NULL,
    'included', 'not_required', true
  ),
  -- 8) Overdue Critical (response missed)
  (
    'a1111111-1111-4111-8111-000000000008',
    '22222222-2222-2222-2222-222222222205',
    '33333333-3333-3333-3333-333333333307',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111102',
    'Module seed: Overdue Critical ERP outage',
    'Fictional Summit plant ERP is unreachable for shipping clerks. Production labels cannot print.',
    'critical', 'assigned', 'Server',
    now() - interval '4 hours',
    now() - interval '2 hours',
    now() + interval '44 hours',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 9) At Risk (≈85% of 4h medium response on Apex)
  (
    'a1111111-1111-4111-8111-000000000009',
    '22222222-2222-2222-2222-222222222206',
    '33333333-3333-3333-3333-333333333308',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111103',
    'Module seed: At Risk mailbox quota warning',
    'Fictional Cedar Grove branch mailbox is at 98% quota; send is failing for two users.',
    'medium', 'in_progress', 'Email',
    now() - interval '51 minutes',
    now() + interval '9 minutes',
    now() + interval '69 minutes',
    now() - interval '40 minutes', NULL, NULL,
    '[Today] Checking archive policy; waiting on disk cleanup.',
    NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 10) Missed SLA (non-critical)
  (
    'a1111111-1111-4111-8111-000000000010',
    '22222222-2222-2222-2222-222222222204',
    '33333333-3333-3333-3333-333333333306',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111104',
    'Module seed: Missed SLA campus wifi outage',
    'Fictional Brightpath student wing lost Wi-Fi after a switch reboot overnight.',
    'high', 'assigned', 'Network',
    now() - interval '8 hours',
    now() - interval '4 hours',
    now() + interval '16 hours',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 11) Approved billable work (resolved + eligible notes)
  (
    'a1111111-1111-4111-8111-000000000011',
    '22222222-2222-2222-2222-222222222201',
    '33333333-3333-3333-3333-333333333301',
    '11111111-1111-1111-1111-111111111109',
    '11111111-1111-1111-1111-111111111106',
    'Module seed: Approved billable migration assist',
    'Fictional Apex after-hours mailbox migration assist approved as billable project support.',
    'medium', 'resolved', 'Cloud Services',
    now() - interval '2 days',
    now() - interval '1 day 20 hours',
    now() - interval '1 day 16 hours',
    now() - interval '1 day 22 hours',
    now() - interval '1 day 18 hours',
    '11111111-1111-1111-1111-111111111106',
    '[Sat] Migrated 12 shared mailboxes and validated Outlook profiles.',
    'Billable migration assist completed after manager approval. Cutover validated with Apex IT.',
    'Shared mailboxes were migrated and Outlook profiles were verified.',
    NULL,
    'billable', 'approved', false
  ),
  -- 12) Unapproved out-of-scope work
  (
    'a1111111-1111-4111-8111-000000000012',
    '22222222-2222-2222-2222-222222222202',
    '33333333-3333-3333-3333-333333333303',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111105',
    'Module seed: Unapproved OOS EMR plugin',
    'Fictional Northwind request to install a third-party EMR plugin that is outside the clinical support contract.',
    'high', 'waiting_on_approval', 'Software',
    now() - interval '10 hours',
    now() - interval '8 hours',
    now() - interval '6 hours',
    now() - interval '9 hours', NULL, NULL,
    '[Today] Identified vendor plugin as out of scope. No further billable work until approved.',
    NULL, NULL, NULL,
    'out_of_scope', 'pending', false
  ),
  -- 13) Completed with valid completion notes
  (
    'a1111111-1111-4111-8111-000000000013',
    '22222222-2222-2222-2222-222222222203',
    '33333333-3333-3333-3333-333333333304',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111107',
    'Module seed: Completed with notes MFA rollout',
    'Fictional Harbor admin MFA enrollment for three warehouse supervisors.',
    'medium', 'resolved', 'Security',
    now() - interval '12 hours',
    now() - interval '4 hours',
    now() + interval '4 hours',
    now() - interval '10 hours',
    now() - interval '2 hours',
    '11111111-1111-1111-1111-111111111107',
    '[Today] Enrolled MFA for three supervisors and documented recovery codes in the secure vault.',
    'MFA enrollment finished for all requested Harbor supervisors. Recovery codes stored per policy.',
    'Multi-factor authentication is now enabled for the requested supervisors.',
    NULL,
    'included', 'not_required', false
  ),
  -- 14) Cannot complete yet — missing notes / effort
  (
    'a1111111-1111-4111-8111-000000000014',
    '22222222-2222-2222-2222-222222222204',
    '33333333-3333-3333-3333-333333333306',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111102',
    'Module seed: Incomplete notes cannot complete',
    'Fictional Brightpath Chromebook will not join campus Wi-Fi. Technician started triage but has not recorded notes or time yet.',
    'medium', 'in_progress', 'Other',
    now() - interval '70 minutes',
    now() + interval '6 hours 50 minutes',
    now() + interval '22 hours 50 minutes',
    now() - interval '55 minutes', NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 15) Time entries + direct costs
  (
    'a1111111-1111-4111-8111-000000000015',
    '22222222-2222-2222-2222-222222222205',
    '33333333-3333-3333-3333-333333333307',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111103',
    'Module seed: Time and costs workstation rebuild',
    'Fictional Summit floor PC failed; rebuild in progress with replacement SSD and imaging labor.',
    'high', 'in_progress', 'Hardware',
    now() - interval '1 day',
    now() - interval '16 hours',
    now() + interval '1 day 8 hours',
    now() - interval '20 hours', NULL, NULL,
    '[Yesterday] Diagnosed failing disk. Ordered SSD. Imaging underway.',
    NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 16) Near / over included monthly hours (ticket shell; hours loaded below)
  (
    'a1111111-1111-4111-8111-000000000016',
    '22222222-2222-2222-2222-222222222205',
    '33333333-3333-3333-3333-333333333307',
    '11111111-1111-1111-1111-111111111101',
    '11111111-1111-1111-1111-111111111104',
    'Module seed: Hours near limit patch window',
    'Fictional Summit monthly patch window that pushes included hours near or over the 20-hour monthly allotment.',
    'medium', 'assigned', 'Other',
    now() - interval '3 hours',
    now() + interval '13 hours',
    now() + interval '45 hours',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 17) Low priority unassigned (extra category coverage)
  (
    'a1111111-1111-4111-8111-000000000017',
    '22222222-2222-2222-2222-222222222207',
    '33333333-3333-3333-3333-333333333309',
    '11111111-1111-1111-1111-111111111101',
    NULL,
    'Module seed: Low priority label printer jam',
    'Fictional Lumen studio label printer jams on every third label. Non-urgent.',
    'low', 'new', 'Printer',
    now() - interval '15 minutes',
    now() + interval '15 hours 45 minutes',
    now() + interval '15 hours 45 minutes',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  ),
  -- 18) Critical assigned but not yet overdue (visible critical alert)
  (
    'a1111111-1111-4111-8111-000000000018',
    '22222222-2222-2222-2222-222222222201',
    '33333333-3333-3333-3333-333333333301',
    '11111111-1111-1111-1111-111111111109',
    '11111111-1111-1111-1111-111111111102',
    'Module seed: Critical phishing triage in window',
    'Fictional Apex users reported a convincing payroll phishing wave. Response deadline still ahead.',
    'critical', 'assigned', 'Security',
    now() - interval '10 minutes',
    now() + interval '20 minutes',
    now() + interval '7 hours 50 minutes',
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'included', 'not_required', false
  )
  RETURNING id
)
SELECT count(*) AS tickets_seeded FROM seeded;

-- ---------------------------------------------------------------------------
-- Time entries (linked)
-- ---------------------------------------------------------------------------
INSERT INTO public.time_entries (
  technician_id, customer_id, contract_id, support_ticket_id,
  work_date, hours_worked, work_category, description,
  classification, internal_cost_rate, billing_rate,
  approval_status, billing_status, approved_by, approved_at
) VALUES
-- In-progress printer
(
  '11111111-1111-1111-1111-111111111103',
  '22222222-2222-2222-2222-222222222203',
  '33333333-3333-3333-3333-333333333304',
  'a1111111-1111-4111-8111-000000000003',
  current_date, 1.25, 'Troubleshooting',
  'Module seed: Cleared print queue and reinstalled warehouse label driver.',
  'included', 65, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Waiting on customer
(
  '11111111-1111-1111-1111-111111111104',
  '22222222-2222-2222-2222-222222222204',
  '33333333-3333-3333-3333-333333333306',
  'a1111111-1111-4111-8111-000000000004',
  current_date - 1, 0.75, 'Support',
  'Module seed: Walked campus IT through license portal steps; awaiting key.',
  'included', 65, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Waiting approval custom report (OOS pending)
(
  '11111111-1111-1111-1111-111111111105',
  '22222222-2222-2222-2222-222222222201',
  '33333333-3333-3333-3333-333333333301',
  'a1111111-1111-4111-8111-000000000005',
  current_date, 1.00, 'Other',
  'Module seed: Scoped litigation hold export; paused pending approval.',
  'out_of_scope', 65, NULL, 'pending', 'unbilled', NULL, NULL
),
-- Resolved Met
(
  '11111111-1111-1111-1111-111111111106',
  '22222222-2222-2222-2222-222222222202',
  '33333333-3333-3333-3333-333333333303',
  'a1111111-1111-4111-8111-000000000006',
  current_date, 0.50, 'Support',
  'Module seed: Password reset and EHR login verification.',
  'included', 70, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Closed
(
  '11111111-1111-1111-1111-111111111107',
  '22222222-2222-2222-2222-222222222203',
  '33333333-3333-3333-3333-333333333304',
  'a1111111-1111-4111-8111-000000000007',
  current_date - 2, 0.50, 'On-site',
  'Module seed: Keyboard swap and application smoke test.',
  'included', 65, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Approved billable (ready to bill)
(
  '11111111-1111-1111-1111-111111111106',
  '22222222-2222-2222-2222-222222222201',
  '33333333-3333-3333-3333-333333333301',
  'a1111111-1111-4111-8111-000000000011',
  current_date - 2, 3.00, 'Remote',
  'Module seed: Billable shared mailbox migration cutover and validation.',
  'billable', 65, 175.00, 'approved', 'ready',
  '11111111-1111-1111-1111-111111111101', now() - interval '1 day'
),
-- Unapproved OOS EMR plugin
(
  '11111111-1111-1111-1111-111111111105',
  '22222222-2222-2222-2222-222222222202',
  '33333333-3333-3333-3333-333333333303',
  'a1111111-1111-4111-8111-000000000012',
  current_date, 1.50, 'Software',
  'Module seed: Evaluated third-party EMR plugin; not approved for billing.',
  'out_of_scope', 70, NULL, 'pending', 'unbilled', NULL, NULL
),
-- Completed MFA
(
  '11111111-1111-1111-1111-111111111107',
  '22222222-2222-2222-2222-222222222203',
  '33333333-3333-3333-3333-333333333304',
  'a1111111-1111-4111-8111-000000000013',
  current_date, 2.00, 'Security',
  'Module seed: MFA enrollment sessions for three supervisors.',
  'included', 65, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Workstation rebuild labor
(
  '11111111-1111-1111-1111-111111111103',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000015',
  current_date - 1, 2.50, 'On-site',
  'Module seed: Disk diagnosis and image prep for Summit floor PC.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111103',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000015',
  current_date, 1.75, 'On-site',
  'Module seed: Imaging and application restore on rebuilt Summit PC.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
-- Summit included hours push (~22 hrs this month across tickets 15+16)
(
  '11111111-1111-1111-1111-111111111104',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  date_trunc('month', current_date)::date + 1, 4.00, 'Maintenance',
  'Module seed: Summit patch window — server batch A.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111104',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  date_trunc('month', current_date)::date + 2, 4.00, 'Maintenance',
  'Module seed: Summit patch window — server batch B.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111104',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  date_trunc('month', current_date)::date + 3, 4.00, 'Maintenance',
  'Module seed: Summit patch window — workstation ring 1.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111104',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  date_trunc('month', current_date)::date + 4, 4.00, 'Maintenance',
  'Module seed: Summit patch window — workstation ring 2.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111103',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  date_trunc('month', current_date)::date + 5, 3.00, 'Maintenance',
  'Module seed: Summit patch window — validation and rollback checks.',
  'included', 60, NULL, 'not_required', 'unbilled', NULL, NULL
),
(
  '11111111-1111-1111-1111-111111111102',
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000016',
  current_date, 2.50, 'Maintenance',
  'Module seed: Summit patch window — overtime catch-up (over included hours).',
  'included', 65, NULL, 'not_required', 'unbilled', NULL, NULL
);

-- ---------------------------------------------------------------------------
-- Direct costs
-- ---------------------------------------------------------------------------
INSERT INTO public.direct_costs (
  customer_id, contract_id, support_ticket_id, cost_category, vendor,
  cost_date, internal_cost, markup_pct, billable_amount, description,
  entered_by, approval_status, billing_status, approved_by, approved_at
) VALUES
(
  '22222222-2222-2222-2222-222222222205',
  '33333333-3333-3333-3333-333333333307',
  'a1111111-1111-4111-8111-000000000015',
  'equipment', 'Fictional Parts Depot',
  current_date - 1, 89.99, 0, 0,
  'Module seed: Replacement 1TB SSD for Summit floor PC rebuild.',
  '11111111-1111-1111-1111-111111111103',
  'pending', 'unbilled', NULL, NULL
),
(
  '22222222-2222-2222-2222-222222222201',
  '33333333-3333-3333-3333-333333333301',
  'a1111111-1111-4111-8111-000000000011',
  'software', 'Fictional Cloud Tools Co',
  current_date - 2, 120.00, 10, 132.00,
  'Module seed: One-time migration utility license (approved billable).',
  '11111111-1111-1111-1111-111111111106',
  'approved', 'ready',
  '11111111-1111-1111-1111-111111111101', now() - interval '1 day'
),
(
  '22222222-2222-2222-2222-222222222202',
  '33333333-3333-3333-3333-333333333303',
  'a1111111-1111-4111-8111-000000000012',
  'software', 'Fictional EMR Plugins LLC',
  current_date, 250.00, 0, 0,
  'Module seed: Unapproved OOS plugin evaluation fee (not billable yet).',
  '11111111-1111-1111-1111-111111111105',
  'pending', 'unbilled', NULL, NULL
);

-- ---------------------------------------------------------------------------
-- Additional work requests for OOS tickets
-- ---------------------------------------------------------------------------
INSERT INTO public.additional_work_requests (
  customer_id, contract_id, support_ticket_id, requested_by,
  title, description, estimated_hours, estimated_amount, approval_status
) VALUES
(
  '22222222-2222-2222-2222-222222222201',
  '33333333-3333-3333-3333-333333333301',
  'a1111111-1111-4111-8111-000000000005',
  '11111111-1111-1111-1111-111111111105',
  'Module seed: Litigation hold export (OOS)',
  'One-off litigation hold mailbox export outside Apex managed support. Requires manager approval before billing.',
  4.0, 700.00, 'pending'
),
(
  '22222222-2222-2222-2222-222222222202',
  '33333333-3333-3333-3333-333333333303',
  'a1111111-1111-4111-8111-000000000012',
  '11111111-1111-1111-1111-111111111105',
  'Module seed: Third-party EMR plugin (OOS)',
  'Install and configure a third-party EMR plugin that is outside the Northwind clinical support contract.',
  6.0, 1140.00, 'pending'
);

-- Mark ticket billable approval metadata for approved billable seed
UPDATE public.support_tickets
SET
  billable_approved_by = '11111111-1111-1111-1111-111111111101',
  billable_approved_at = now() - interval '1 day'
WHERE id = 'a1111111-1111-4111-8111-000000000011';
