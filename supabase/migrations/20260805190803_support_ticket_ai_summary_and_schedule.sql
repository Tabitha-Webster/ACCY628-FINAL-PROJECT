-- AI summary audit metadata + technician visit scheduling on support_tickets.
-- Reuses support_tickets; does not create duplicate ticket tables.
-- RLS policies unchanged — existing assigned-technician update rules apply.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_generated_by uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS summary_source text,
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_mode text,
  ADD COLUMN IF NOT EXISTS service_location text,
  ADD COLUMN IF NOT EXISTS schedule_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_summary_source_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_summary_source_check
      CHECK (
        summary_source IS NULL
        OR summary_source IN ('ai', 'fallback', 'manual')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_service_mode_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_service_mode_check
      CHECK (
        service_mode IS NULL
        OR service_mode IN ('remote', 'onsite')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_schedule_window_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_schedule_window_check
      CHECK (
        scheduled_start_at IS NULL
        OR scheduled_end_at IS NULL
        OR scheduled_end_at >= scheduled_start_at
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS support_tickets_scheduled_start_at_idx
  ON public.support_tickets (scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_assigned_scheduled_idx
  ON public.support_tickets (assigned_technician_id, scheduled_start_at)
  WHERE assigned_technician_id IS NOT NULL AND scheduled_start_at IS NOT NULL;

COMMENT ON COLUMN public.support_tickets.summary_generated_at IS
  'When an AI/fallback customer summary draft was last generated (not approval).';
COMMENT ON COLUMN public.support_tickets.summary_generated_by IS
  'Technician who requested the draft summary.';
COMMENT ON COLUMN public.support_tickets.summary_source IS
  'ai | fallback | manual — how the last draft was produced.';
COMMENT ON COLUMN public.support_tickets.summary_model IS
  'Model id used for AI draft, if any. Does not store prompts or secrets.';
COMMENT ON COLUMN public.support_tickets.scheduled_start_at IS
  'Scheduled visit/work start (not an SLA deadline).';
COMMENT ON COLUMN public.support_tickets.scheduled_end_at IS
  'Scheduled visit/work end (not an SLA deadline).';
COMMENT ON COLUMN public.support_tickets.service_mode IS
  'remote | onsite for the scheduled visit.';
COMMENT ON COLUMN public.support_tickets.service_location IS
  'Address or location note for onsite work; optional for remote.';
COMMENT ON COLUMN public.support_tickets.schedule_notes IS
  'Manager/technician scheduling notes visible to the assigned tech.';
