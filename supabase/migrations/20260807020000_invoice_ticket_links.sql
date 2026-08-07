-- Link invoices <-> support tickets (many-to-many).
-- Used by Billing → Invoices and by auto-invoice-on-ticket-completion.

CREATE TABLE IF NOT EXISTS public.invoice_tickets (
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  support_ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, support_ticket_id)
);

CREATE INDEX IF NOT EXISTS invoice_tickets_ticket_idx
  ON public.invoice_tickets (support_ticket_id);

ALTER TABLE public.invoice_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_tickets_select ON public.invoice_tickets;
CREATE POLICY invoice_tickets_select
  ON public.invoice_tickets
  FOR SELECT
  USING (
    current_user_role() = ANY (ARRAY['manager'::user_role, 'billing'::user_role, 'executive'::user_role, 'admin'::user_role])
    OR (
      current_user_role() = 'customer'::user_role
      AND EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = invoice_tickets.invoice_id
          AND i.customer_id = current_user_customer_id()
      )
    )
    OR (
      current_user_role() = 'technician'::user_role
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets t
        WHERE t.id = invoice_tickets.support_ticket_id
          AND t.assigned_technician_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS invoice_tickets_write ON public.invoice_tickets;
CREATE POLICY invoice_tickets_write
  ON public.invoice_tickets
  FOR ALL
  USING (current_user_role() = ANY (ARRAY['manager'::user_role, 'billing'::user_role, 'admin'::user_role]))
  WITH CHECK (current_user_role() = ANY (ARRAY['manager'::user_role, 'billing'::user_role, 'admin'::user_role]));

-- Backfill links from billed time entries and direct costs.
INSERT INTO public.invoice_tickets (invoice_id, support_ticket_id)
SELECT DISTINCT te.invoice_id, te.support_ticket_id
FROM public.time_entries te
WHERE te.invoice_id IS NOT NULL
  AND te.support_ticket_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.invoice_tickets (invoice_id, support_ticket_id)
SELECT DISTINCT dc.invoice_id, dc.support_ticket_id
FROM public.direct_costs dc
WHERE dc.invoice_id IS NOT NULL
  AND dc.support_ticket_id IS NOT NULL
ON CONFLICT DO NOTHING;
