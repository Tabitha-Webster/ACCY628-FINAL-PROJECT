import type { SupabaseClient } from "@supabase/supabase-js";

export type DuplicateCustomerMatch = {
  id: string;
  name: string;
  status: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  customer_identifier: string | null;
  matchedOn: Array<"name" | "email">;
};

/** Collapse case/spacing so "Acme  Corp" matches "acme corp". */
export function normalizeCustomerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeContactEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Find likely duplicate customers by normalized name and/or primary contact email.
 * Does not merge or delete anything — read-only check.
 */
export async function findLikelyDuplicateCustomers(
  supabase: SupabaseClient,
  customerName: string,
  contactEmail: string
): Promise<{ matches: DuplicateCustomerMatch[]; error: string | null }> {
  const normalizedName = normalizeCustomerName(customerName);
  const normalizedEmail = normalizeContactEmail(contactEmail);

  if (!normalizedName && !normalizedEmail) {
    return { matches: [], error: null };
  }

  let { data, error } = await supabase
    .from("customers")
    .select("id, name, status, primary_contact, contact_email, customer_identifier");

  // Live DB may not have customer_identifier yet.
  if (error && /customer_identifier/i.test(error.message)) {
    const retry = await supabase
      .from("customers")
      .select("id, name, status, primary_contact, contact_email");
    data = (retry.data ?? []).map((row) => ({ ...row, customer_identifier: null }));
    error = retry.error;
  }

  if (error) {
    return { matches: [], error: error.message };
  }

  const matches: DuplicateCustomerMatch[] = [];

  for (const row of data ?? []) {
    const matchedOn: Array<"name" | "email"> = [];
    if (normalizedName && normalizeCustomerName(row.name ?? "") === normalizedName) {
      matchedOn.push("name");
    }
    if (
      normalizedEmail &&
      normalizeContactEmail(row.contact_email ?? "") === normalizedEmail
    ) {
      matchedOn.push("email");
    }
    if (matchedOn.length === 0) continue;

    matches.push({
      id: row.id as string,
      name: (row.name as string) ?? "—",
      status: (row.status as string | null) ?? null,
      primary_contact: (row.primary_contact as string | null) ?? null,
      contact_email: (row.contact_email as string | null) ?? null,
      customer_identifier: (row.customer_identifier as string | null) ?? null,
      matchedOn,
    });
  }

  return { matches, error: null };
}
