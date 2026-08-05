-- Two-step cost approval: manager → awaiting_billing → billing → approved
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'awaiting_billing';
