import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Contract,
  ContractDocument,
  ContractModification,
  ContractService,
  ContractStatus,
  ContractVersion,
} from "@/lib/types";

export type ContractListRow = Pick<
  Contract,
  | "id"
  | "contract_number"
  | "name"
  | "status"
  | "contract_type"
  | "start_date"
  | "end_date"
  | "renewal_type"
  | "payment_terms"
  | "billing_frequency"
  | "monthly_recurring_fee"
  | "customer_id"
  | "assigned_manager_id"
> & {
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
  assigned_manager: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
};

export type ContractCustomerJoin = {
  id: string;
  name: string;
  primary_contact: string | null;
  contact_email: string | null;
  service_address: string | null;
  status: string;
};

export type ProfileNameJoin = {
  id?: string;
  full_name: string;
  email?: string;
};

export type ContractDetailRow = Contract & {
  customers: ContractCustomerJoin | ContractCustomerJoin[] | null;
  assigned_manager: ProfileNameJoin | ProfileNameJoin[] | null;
  sales_representative: ProfileNameJoin | ProfileNameJoin[] | null;
  created_by_profile: ProfileNameJoin | ProfileNameJoin[] | null;
  updated_by_profile: ProfileNameJoin | ProfileNameJoin[] | null;
};

const LIST_SELECT =
  "id, customer_id, contract_number, name, status, contract_type, start_date, end_date, renewal_type, payment_terms, billing_frequency, monthly_recurring_fee, assigned_manager_id, customers(id, name), assigned_manager:profiles!contracts_assigned_manager_id_fkey(id, full_name)";

const DETAIL_SELECT =
  "*, customers(id, name, primary_contact, contact_email, service_address, status), assigned_manager:profiles!contracts_assigned_manager_id_fkey(id, full_name, email), sales_representative:profiles!contracts_sales_representative_id_fkey(id, full_name, email), created_by_profile:profiles!contracts_created_by_fkey(id, full_name, email), updated_by_profile:profiles!contracts_updated_by_fkey(id, full_name, email)";

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function unwrapCustomer(row: {
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
}) {
  return unwrapOne(row.customers);
}

export function unwrapAssignedManager<T extends { full_name: string }>(row: {
  assigned_manager: T | T[] | null;
}) {
  return unwrapOne(row.assigned_manager);
}

export function unwrapProfile<T>(value: T | T[] | null | undefined): T | null {
  return unwrapOne(value);
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
      "id, contract_id, modification_summary, effective_date, approval_status, approved_by, created_by, created_at, updated_at, created_by_profile:profiles!contract_modifications_created_by_fkey(full_name), approved_by_profile:profiles!contract_modifications_approved_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("effective_date", { ascending: false });
}

export async function listContractDocuments(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_documents")
    .select(
      "id, contract_id, document_name, document_type, storage_path, file_url, uploaded_by, uploaded_at, notes, uploaded_by_profile:profiles!contract_documents_uploaded_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("uploaded_at", { ascending: false });
}

export async function listContractVersions(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_versions")
    .select(
      "id, contract_id, version_number, change_summary, snapshot, created_by, created_at, created_by_profile:profiles!contract_versions_created_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("version_number", { ascending: false });
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

export type {
  Contract,
  ContractService,
  ContractModification,
  ContractDocument,
  ContractVersion,
  ContractDetailRow as ContractDetail,
};
