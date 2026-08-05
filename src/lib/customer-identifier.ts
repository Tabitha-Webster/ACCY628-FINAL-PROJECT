import type { SupabaseClient } from "@supabase/supabase-js";

/** Project standard: CUST-00001, CUST-00002, … (5-digit sequence). */
export function formatCustomerIdentifier(sequence: number) {
  return `CUST-${String(sequence).padStart(5, "0")}`;
}

function sequenceFromIdentifier(value: string | null | undefined) {
  if (!value) return 0;
  const match = value.match(/(\d+)\s*$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Allocate the next unique customer identifier.
 * Prefers the DB function/sequence when available; otherwise derives from existing rows.
 */
export async function allocateNextCustomerIdentifier(
  supabase: SupabaseClient
): Promise<{ identifier: string | null; error: string | null }> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("generate_customer_identifier");
  if (!rpcError && typeof rpcData === "string" && rpcData.trim()) {
    return { identifier: rpcData.trim(), error: null };
  }

  const { data, error } = await supabase.from("customers").select("customer_identifier");
  if (error) {
    if (/customer_identifier/i.test(error.message)) {
      return {
        identifier: null,
        error:
          "Customer identifiers are not available on the database yet. Ask a teammate to run the customer_identifier migration (CUST-00001 format).",
      };
    }
    return { identifier: null, error: error.message };
  }

  let max = 0;
  for (const row of data ?? []) {
    max = Math.max(max, sequenceFromIdentifier(row.customer_identifier as string | null));
  }
  return { identifier: formatCustomerIdentifier(max + 1), error: null };
}
