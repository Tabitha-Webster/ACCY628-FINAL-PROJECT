import { unstable_noStore as noStore } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/constants";
import type { CustomerStatus } from "@/lib/types";

/** Internal roles that share one live customer list / profile. */
export const CUSTOMER_VIEW_ROLES: UserRole[] = ["admin", "manager", "billing", "technician"];

/** Roles that can add and edit customer master data (Admin matches Manager). */
export const CUSTOMER_MANAGE_ROLES: UserRole[] = ["admin", "manager"];

/** Roles allowed to export the customer list to Excel (Admin matches Manager). */
export const CUSTOMER_EXPORT_ROLES: UserRole[] = ["admin", "manager", "billing"];

export function canViewCustomers(role: UserRole) {
  return CUSTOMER_VIEW_ROLES.includes(role);
}

export function canEditCustomers(role: UserRole) {
  return CUSTOMER_MANAGE_ROLES.includes(role);
}

export function canExportCustomers(role: UserRole) {
  return CUSTOMER_EXPORT_ROLES.includes(role);
}

export type CustomerListRow = {
  id: string;
  name: string | null;
  status: string | null;
  industry: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  customer_identifier: string | null;
};

export type CustomerDetailRow = {
  id: string;
  name: string | null;
  status: string | null;
  industry: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  primary_contact_phone: string | null;
  customer_identifier: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  service_address: string | null;
  credit_terms: string | null;
  notes: string | null;
  updated_at: string | null;
};

const LIST_SELECT =
  "id, name, status, industry, primary_contact, contact_email, customer_identifier";
const LIST_CORE_SELECT = "id, name, status, industry, primary_contact, contact_email";

const DETAIL_SELECT =
  "id, name, status, industry, primary_contact, contact_email, primary_contact_phone, customer_identifier, billing_contact_name, billing_contact_email, billing_address, city, state, postal_code, service_address, credit_terms, notes, updated_at";

const DETAIL_CORE_SELECT =
  "id, name, status, industry, primary_contact, contact_email, service_address, credit_terms, notes";

const MISSING_COLUMN_PATTERN =
  /column|does not exist|customer_identifier|billing_|primary_contact_phone|city|state|postal|updated_at/i;

function noteValue(notes: string | null | undefined, label: string) {
  if (!notes) return null;
  const line = notes
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (!line) return null;
  return line.slice(label.length + 1).trim() || null;
}

/** Fill billing/client fields from structured notes when dedicated columns are missing or blank. */
function withBillingFromNotes<T extends { notes?: string | null }>(row: T): T & {
  primary_contact_phone: string | null;
  customer_identifier: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  service_address: string | null;
  credit_terms: string | null;
  updated_at: string | null;
} {
  const current = row as T & Partial<CustomerDetailRow>;
  return {
    ...row,
    primary_contact_phone:
      current.primary_contact_phone ?? noteValue(row.notes, "Primary phone"),
    customer_identifier: current.customer_identifier ?? null,
    billing_contact_name:
      current.billing_contact_name ?? noteValue(row.notes, "Billing contact"),
    billing_contact_email:
      current.billing_contact_email ?? noteValue(row.notes, "Billing email"),
    billing_address: current.billing_address ?? noteValue(row.notes, "Billing address"),
    city: current.city ?? noteValue(row.notes, "City"),
    state: current.state ?? noteValue(row.notes, "State"),
    postal_code: current.postal_code ?? noteValue(row.notes, "Postal code"),
    service_address: current.service_address ?? null,
    credit_terms: current.credit_terms ?? null,
    updated_at: current.updated_at ?? null,
  };
}

/** Same customer list for manager, technician, billing, and HR — always fresh from Supabase. */
export async function listCustomersForInternalRoles(supabase: SupabaseClient) {
  noStore();

  let { data, error } = await supabase
    .from("customers")
    .select(LIST_SELECT)
    .order("name", { ascending: true });

  if (error && MISSING_COLUMN_PATTERN.test(error.message)) {
    const fallback = await supabase
      .from("customers")
      .select(LIST_CORE_SELECT)
      .order("name", { ascending: true });
    const rows = (fallback.data ?? []) as Array<Omit<CustomerListRow, "customer_identifier">>;
    return {
      customers: rows.map((row) => ({ ...row, customer_identifier: null })),
      error: fallback.error,
      /** True when customer_identifier (and usually billing columns) are missing on live DB. */
      schemaIncomplete: true,
    };
  }

  return {
    customers: (data ?? []) as CustomerListRow[],
    error,
    schemaIncomplete: false,
  };
}

/** Same customer profile for every internal role — always fresh from Supabase. */
export async function getCustomerDetailForInternalRoles(supabase: SupabaseClient, id: string) {
  noStore();

  let { data, error } = await supabase.from("customers").select(DETAIL_SELECT).eq("id", id).maybeSingle();

  if (error && MISSING_COLUMN_PATTERN.test(error.message)) {
    // Retry without optional columns that may not exist on the live table yet.
    const withoutUpdated = await supabase
      .from("customers")
      .select(
        "id, name, status, industry, primary_contact, contact_email, primary_contact_phone, customer_identifier, billing_contact_name, billing_contact_email, billing_address, city, state, postal_code, notes"
      )
      .eq("id", id)
      .maybeSingle();

    if (withoutUpdated.error && MISSING_COLUMN_PATTERN.test(withoutUpdated.error.message)) {
      const core = await supabase.from("customers").select(DETAIL_CORE_SELECT).eq("id", id).maybeSingle();
      const coreRow = core.data as {
        id: string;
        name: string | null;
        status: string | null;
        industry: string | null;
        primary_contact: string | null;
        contact_email: string | null;
        service_address: string | null;
        credit_terms: string | null;
        notes: string | null;
      } | null;
      data = coreRow ? (withBillingFromNotes(coreRow) as CustomerDetailRow) : null;
      error = core.error;
    } else {
      const row = withoutUpdated.data as Omit<CustomerDetailRow, "updated_at"> | null;
      data = row ? (withBillingFromNotes({ ...row, updated_at: null }) as CustomerDetailRow) : null;
      error = withoutUpdated.error;
    }
  } else if (data) {
    data = withBillingFromNotes(data as CustomerDetailRow) as CustomerDetailRow;
  }

  return {
    customer: (data as CustomerDetailRow | null) ?? null,
    error,
  };
}

export function asCustomerStatus(value: string | null | undefined): CustomerStatus {
  const allowed: CustomerStatus[] = [
    "active",
    "inactive",
    "prospect",
    "on_hold",
    "pending_approval",
    "rejected",
  ];
  if (value && (allowed as string[]).includes(value)) return value as CustomerStatus;
  return "prospect";
}
