import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contract, ContractModification, ContractService, ContractStatus } from "@/lib/types";

export type ContractListRow = Pick<
  Contract,
  | "id"
  | "contract_number"
  | "name"
  | "status"
  | "contract_type"
  | "start_date"
  | "end_date"
  | "payment_terms"
  | "billing_frequency"
  | "monthly_recurring_fee"
  | "customer_id"
> & {
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
};

export type ContractDetailRow = Contract & {
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
  assigned_manager: { full_name: string } | { full_name: string }[] | null;
};

const LIST_SELECT =
  "id, customer_id, contract_number, name, status, contract_type, start_date, end_date, payment_terms, billing_frequency, monthly_recurring_fee, customers(id, name)";

const DETAIL_SELECT =
  "*, customers(id, name), assigned_manager:profiles!contracts_assigned_manager_id_fkey(full_name)";

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function unwrapCustomer(row: {
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
}) {
  return unwrapOne(row.customers);
}

export function unwrapAssignedManager(row: {
  assigned_manager: { full_name: string } | { full_name: string }[] | null;
}) {
  return unwrapOne(row.assigned_manager);
}

/** Internal Contracts & Agreements list (manager / billing / technician). */
export async function listContracts(supabase: SupabaseClient) {
  return supabase.from("contracts").select(LIST_SELECT).order("start_date", { ascending: false });
}

/** Customer-facing agreements for a single customer account. */
export async function listCustomerContracts(supabase: SupabaseClient, customerId: string) {
  return supabase
    .from("contracts")
    .select("*")
    .eq("customer_id", customerId)
    .order("start_date", { ascending: false });
}

/** Active contracts only — for technicians, billing generation, usage, tickets. */
export async function listActiveContracts(
  supabase: SupabaseClient,
  options?: { customerId?: string }
) {
  let query = supabase
    .from("contracts")
    .select("id, customer_id, contract_number, name, status, included_hours_per_month, monthly_recurring_fee")
    .eq("status", "active" satisfies ContractStatus)
    .order("name");

  if (options?.customerId) {
    query = query.eq("customer_id", options.customerId);
  }

  return query;
}

export async function getContractById(supabase: SupabaseClient, id: string) {
  return supabase.from("contracts").select(DETAIL_SELECT).eq("id", id).maybeSingle();
}

export async function listContractServices(supabase: SupabaseClient, contractIds: string[]) {
  if (contractIds.length === 0) {
    return { data: [] as ContractService[], error: null };
  }
  return supabase
    .from("contract_services")
    .select("id, contract_id, service_name, service_description, is_included, created_at")
    .in("contract_id", contractIds)
    .order("service_name");
}

export async function listContractModifications(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_modifications")
    .select(
      "id, contract_id, modification_summary, effective_date, approval_status, approved_by, created_by, created_at, updated_at"
    )
    .eq("contract_id", contractId)
    .order("effective_date", { ascending: false });
}

/** Related operational records for the contract detail view / future reporting. */
export async function getContractRelatedWork(supabase: SupabaseClient, contractId: string) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const [monthEntries, tickets, projects, invoices] = await Promise.all([
    supabase
      .from("time_entries")
      .select("hours_worked")
      .eq("contract_id", contractId)
      .eq("classification", "included")
      .gte("work_date", monthStart)
      .lt("work_date", monthEnd),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, submitted_at")
      .eq("contract_id", contractId)
      .order("submitted_at", { ascending: false })
      .limit(5),
    supabase
      .from("projects")
      .select("id, name, status, fixed_fee, target_completion_date")
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, remaining_balance, invoice_date")
      .eq("contract_id", contractId)
      .order("invoice_date", { ascending: false })
      .limit(5),
  ]);

  return {
    monthEntries: monthEntries.data ?? [],
    monthEntriesError: monthEntries.error,
    tickets: tickets.data ?? [],
    ticketsError: tickets.error,
    projects: projects.data ?? [],
    projectsError: projects.error,
    invoices: invoices.data ?? [],
    invoicesError: invoices.error,
  };
}

export type { Contract, ContractService, ContractModification, ContractDetailRow as ContractDetail };
