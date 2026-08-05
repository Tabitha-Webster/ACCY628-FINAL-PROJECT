ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS completion_notes text;
COMMENT ON COLUMN public.support_tickets.completion_notes IS 'Internal completion notes (not customer-visible)';
