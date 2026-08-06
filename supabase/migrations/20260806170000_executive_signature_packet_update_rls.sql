-- Allow executive to update signature packets after signing
-- (status becomes awaiting_customer) so storage_path can be saved.
-- Previously USING only allowed status = awaiting_executive, so the
-- follow-up storage_path update returned 0 rows and PostgREST .single()
-- failed with "Cannot coerce the result to a single JSON object".

drop policy if exists "signature_packets_update" on public.contract_signature_packets;
create policy "signature_packets_update"
on public.contract_signature_packets
for update
to authenticated
using (
  public.current_profile_role() in ('admin', 'manager')
  or (
    public.current_profile_role() = 'executive'
    and status in ('awaiting_executive', 'awaiting_admin', 'awaiting_customer')
  )
  or (
    public.customer_owns_contract(contract_id)
    and status = 'awaiting_customer'
  )
)
with check (
  public.current_profile_role() in ('admin', 'manager', 'executive')
  or (
    public.customer_owns_contract(contract_id)
    and status in ('awaiting_customer', 'fully_executed', 'rejected')
  )
);
