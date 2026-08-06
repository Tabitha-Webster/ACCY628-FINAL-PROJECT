-- Add Executive role and Manager → Executive → Customer signature workflow.

-- 1) Enum value (safe if re-run)
do $$
begin
  alter type public.user_role add value 'executive';
exception
  when duplicate_object then null;
end $$;
