-- Link every support ticket to the best-matching project for its customer.
-- Matching priority:
--   1) same customer (required)
--   2) same contract as the project
--   3) title keywords that fit the project theme
--   4) prefer active project statuses
-- Creates missing customer projects when a ticket customer has none.

-- ---------------------------------------------------------------------------
-- Ensure customers with tickets have at least one project
-- ---------------------------------------------------------------------------
INSERT INTO public.projects (
  id, customer_id, contract_id, name, status, description, start_date
)
SELECT
  '44444444-4444-4444-4444-444444444409'::uuid,
  '22222222-2222-2222-2222-222222222201'::uuid,
  '33333333-3333-3333-3333-333333333301'::uuid,
  'Chad Corporation Help Desk',
  'in_progress'::project_status,
  'Ongoing help-desk and break/fix work for Chad Corporation.',
  current_date - 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = '44444444-4444-4444-4444-444444444409'::uuid
);

INSERT INTO public.projects (
  id, customer_id, contract_id, name, status, description, start_date
)
SELECT
  '44444444-4444-4444-4444-444444444410'::uuid,
  '22222222-2222-2222-2222-222222222205'::uuid,
  '33333333-3333-3333-3333-333333333307'::uuid,
  'Square Books Floor IT Support',
  'in_progress'::project_status,
  'Floor support, workstation, and ERP/help-desk work for Square Books.',
  current_date - 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects p WHERE p.id = '44444444-4444-4444-4444-444444444410'::uuid
);

-- ---------------------------------------------------------------------------
-- Score each ticket ↔ same-customer project and pick the best match
-- ---------------------------------------------------------------------------
WITH scored AS (
  SELECT
    t.id AS ticket_id,
    p.id AS project_id,
    (
      -- Contract alignment
      CASE
        WHEN t.contract_id IS NOT NULL AND t.contract_id = p.contract_id THEN 100
        ELSE 0
      END
      -- Theme / keyword fit
      + CASE
          WHEN p.name ILIKE '%M365%' OR p.name ILIKE '%Cloud Migration%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(email|mailbox|outlook|m365|migration|phishing|conference room)'
                THEN 50
              ELSE 0
            END
          WHEN p.name ILIKE '%Cybersecurity%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(security|phishing|firewall|vpn|wifi|wi-fi|critical)'
                THEN 50
              ELSE 0
            END
          WHEN p.name ILIKE '%Server%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(server|wan|clinic|emr|network|password|laptop)'
                THEN 50
              ELSE 0
            END
          WHEN p.name ILIKE '%Network%' OR p.name ILIKE '%Dock%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(printer|warehouse|dock|network|keyboard|mfa|password)'
                THEN 50
              ELSE 0
            END
          WHEN p.name ILIKE '%Wi-Fi%' OR p.name ILIKE '%WiFi%' OR p.name ILIKE '%Wifi%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(wifi|wi-fi|vpn|network|printer|password)'
                THEN 50
              ELSE 0
            END
          WHEN p.name ILIKE '%Software%' OR p.name ILIKE '%POS%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(software|pos|implementation|security|email|vpn|printer|password|laptop|user)'
                THEN 40
              ELSE 5
            END
          WHEN p.name ILIKE '%Relocation%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(relocation|laptop|user setup|vpn|printer|password|security)'
                THEN 50
              ELSE 5
            END
          WHEN p.name ILIKE '%Help Desk%' OR p.name ILIKE '%Floor%' OR p.name ILIKE '%IT Support%' THEN
            CASE
              WHEN coalesce(t.title, '') ~* '(password|printer|laptop|user|sla|e2e|smoke|fix|firewall|schedule|workflow|control)'
                THEN 45
              ELSE 15
            END
          ELSE 0
        END
      -- Prefer live / open projects over completed/billed
      + CASE
          WHEN p.status::text IN ('in_progress', 'proposed', 'awaiting_customer_approval') THEN 10
          WHEN p.status::text IN ('completed', 'billed') THEN 2
          ELSE 0
        END
      -- Tiny stable tie-breaker preference for older fixed demo UUIDs
      + CASE WHEN p.id::text LIKE '44444444%' THEN 1 ELSE 0 END
    ) AS score
  FROM public.support_tickets t
  INNER JOIN public.projects p ON p.customer_id = t.customer_id
),
best AS (
  SELECT DISTINCT ON (ticket_id)
    ticket_id,
    project_id,
    score
  FROM scored
  ORDER BY ticket_id, score DESC, project_id
)
UPDATE public.support_tickets t
SET
  project_id = best.project_id,
  updated_at = now()
FROM best
WHERE t.id = best.ticket_id
  AND t.project_id IS DISTINCT FROM best.project_id;
