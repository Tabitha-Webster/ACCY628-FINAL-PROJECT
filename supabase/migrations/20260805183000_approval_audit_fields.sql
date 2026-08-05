-- Record who approved projects / milestones and when.
-- Additional work requests already use reviewed_by / reviewed_at.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS customer_approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS customer_approved_at timestamptz;

ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMENT ON COLUMN public.projects.customer_approved_by IS 'Customer (or acting manager) who approved or rejected the project.';
COMMENT ON COLUMN public.projects.customer_approved_at IS 'When the project customer approval decision was recorded.';
COMMENT ON COLUMN public.project_milestones.approved_by IS 'Manager who approved or rejected the milestone for billing.';
COMMENT ON COLUMN public.project_milestones.approved_at IS 'When the milestone approval decision was recorded.';
