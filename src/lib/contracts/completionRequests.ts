import type { SupabaseClient } from "@supabase/supabase-js";

/** Stored on contract_changes.field_name for technician → manager handoff. */
export const COMPLETION_REQUEST_FIELD = "completion_request";

export type CompletionRequestSnapshot = {
  id: string;
  contract_id: string;
  new_value: string | null;
  change_reason: string;
  changed_at: string;
  changed_by: string | null;
};

export function latestCompletionRequest(
  changes: Array<{
    id: string;
    contract_id: string;
    field_name: string;
    new_value: string | null;
    change_reason: string;
    changed_at: string;
    changed_by: string | null;
  }>
): CompletionRequestSnapshot | null {
  const match = changes.find((c) => c.field_name === COMPLETION_REQUEST_FIELD);
  if (!match) return null;
  return {
    id: match.id,
    contract_id: match.contract_id,
    new_value: match.new_value,
    change_reason: match.change_reason,
    changed_at: match.changed_at,
    changed_by: match.changed_by,
  };
}

export function isCompletionRequestOpen(request: CompletionRequestSnapshot | null): boolean {
  return request?.new_value === "requested";
}

/** Open technician completion requests on active contracts (for manager dashboard). */
export async function listOpenContractCompletionRequests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("contract_changes")
    .select(
      "id, contract_id, new_value, change_reason, changed_at, changed_by, contracts!inner(id, name, contract_number, status, customer_id)"
    )
    .eq("field_name", COMPLETION_REQUEST_FIELD)
    .eq("contracts.status", "active")
    .order("changed_at", { ascending: false })
    .limit(80);

  if (error || !data) return { data: [] as OpenCompletionRequestRow[], error };

  // Latest change per contract; keep only those still "requested".
  const seen = new Set<string>();
  const rows: OpenCompletionRequestRow[] = [];
  for (const row of data) {
    if (seen.has(row.contract_id)) continue;
    seen.add(row.contract_id);
    if (row.new_value !== "requested") continue;
    const contract = Array.isArray(row.contracts) ? row.contracts[0] : row.contracts;
    if (!contract || contract.status !== "active") continue;
    rows.push({
      id: row.id,
      contract_id: row.contract_id,
      change_reason: row.change_reason,
      changed_at: row.changed_at,
      changed_by: row.changed_by,
      contract_number: contract.contract_number,
      contract_name: contract.name,
      customer_id: contract.customer_id,
    });
  }

  return { data: rows, error: null };
}

export type OpenCompletionRequestRow = {
  id: string;
  contract_id: string;
  change_reason: string;
  changed_at: string;
  changed_by: string | null;
  contract_number: string | null;
  contract_name: string;
  customer_id: string;
};
