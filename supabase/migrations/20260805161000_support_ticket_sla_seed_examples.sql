-- Backfill missing SLA deadlines and seed Met / At Risk / Missed / Critical demo tickets.
-- Requires set_support_ticket_sla_deadlines trigger (20260805160000).

UPDATE public.support_tickets
SET priority = priority
WHERE contract_id IS NOT NULL
  AND (target_response_at IS NULL OR target_resolution_at IS NULL);

DELETE FROM public.support_tickets
WHERE title LIKE 'SLA demo:%';

WITH tech AS (
  SELECT '11111111-1111-1111-1111-111111111102'::uuid AS id
),
base AS (
  SELECT
    '22222222-2222-2222-2222-222222222201'::uuid AS customer_id,
    '33333333-3333-3333-3333-333333333301'::uuid AS contract_id,
    '11111111-1111-1111-1111-111111111109'::uuid AS created_by
)
INSERT INTO public.support_tickets (
  customer_id, contract_id, created_by, assigned_technician_id,
  title, description, priority, status, service_category,
  submitted_at, target_response_at, target_resolution_at,
  actual_response_at, completed_at, classification
)
SELECT
  b.customer_id, b.contract_id, b.created_by, t.id,
  v.title, v.description, v.priority::ticket_priority, v.status::ticket_status, v.service_category,
  v.submitted_at, v.target_response_at, v.target_resolution_at,
  v.actual_response_at, v.completed_at, 'included'::work_classification
FROM base b
CROSS JOIN tech t
CROSS JOIN (
  VALUES
    (
      'SLA demo: Met — password reset completed on time',
      'Demo ticket showing Met SLA. Responded and resolved within contract targets.',
      'medium', 'resolved', 'Password Reset',
      now() - interval '6 hours',
      now() - interval '2 hours',
      now() + interval '2 hours',
      now() - interval '5 hours',
      now() - interval '3 hours'
    ),
    (
      'SLA demo: At Risk — response window nearly exhausted',
      'Demo ticket showing At Risk SLA. At least 80% of the response SLA window has elapsed with no actual response recorded.',
      'medium', 'assigned', 'Email',
      now() - interval '198 minutes',
      now() + interval '42 minutes',
      now() + interval '282 minutes',
      NULL::timestamptz,
      NULL::timestamptz
    ),
    (
      'SLA demo: Missed — response overdue',
      'Demo ticket showing Missed / overdue SLA. Response deadline has passed and no actual response time is recorded.',
      'high', 'assigned', 'Network',
      now() - interval '5 hours',
      now() - interval '3 hours',
      now() + interval '11 hours',
      NULL::timestamptz,
      NULL::timestamptz
    ),
    (
      'SLA demo: Critical — VPN outage for partners',
      'Demo critical ticket. Critical priority must show a highly visible alert. Response target is the contract critical response hours.',
      'critical', 'in_progress', 'Security',
      now() - interval '20 minutes',
      now() + interval '10 minutes',
      now() + interval '7 hours 40 minutes',
      NULL::timestamptz,
      NULL::timestamptz
    )
) AS v(title, description, priority, status, service_category, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at);
