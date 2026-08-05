import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Contract,
  ContractDocument,
  ContractModification,
  ContractService,
  ContractStatus,
  ContractVersion,
} from "@/lib/types";
import { CONTRACT_BILLING_SELECT } from "./billing";

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
  | "billing_method"
  | "billing_status"
  | "next_invoice_date"
  | "last_invoice_date"
  | "monthly_recurring_fee"
  | "included_hours_per_month"
  | "additional_hourly_rate"
  | "overages_allowed"
  | "overage_charges"
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
  "id, customer_id, contract_number, name, status, contract_type, start_date, end_date, renewal_type, payment_terms, billing_frequency, billing_method, billing_status, next_invoice_date, last_invoice_date, monthly_recurring_fee, included_hours_per_month, additional_hourly_rate, overages_allowed, overage_charges, assigned_manager_id, customers(id, name), assigned_manager:profiles!contracts_assigned_manager_id_fkey(id, full_name)";

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

/** Full billing terms for Ready to Bill / invoice generation (contract-to-cash). */
export async function listContractsForBilling(
  supabase: SupabaseClient,
  options?: { status?: ContractStatus; customerId?: string }
) {
  let query = supabase
    .from("contracts")
    .select(`${CONTRACT_BILLING_SELECT}, customers(id, name)`)
    .order("next_invoice_date", { ascending: true });

  if (options?.status) {
    query = query.eq("status", options.status);
  } else {
    query = query.eq("status", "active" satisfies ContractStatus);
  }
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
      "id, contract_id, modification_summary, effective_date, approval_status, approved_by, created_by, created_at, updated_at, proposed_changes, created_by_profile:profiles!contract_modifications_created_by_fkey(full_name), approved_by_profile:profiles!contract_modifications_approved_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("effective_date", { ascending: false });
}

export async function listContractDocuments(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_documents")
    .select(
      "id, contract_id, document_name, document_type, storage_path, file_url, uploaded_by, uploaded_at, notes, document_group_id, version_number, is_current, file_size, mime_type, replace_reason, replaced_at, uploaded_by_profile:profiles!contract_documents_uploaded_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("uploaded_at", { ascending: false });
}

export async function listContractDocumentHistory(
  supabase: SupabaseClient,
  documentGroupId: string
) {
  return supabase
    .from("contract_documents")
    .select(
      "id, contract_id, document_name, document_type, storage_path, file_url, uploaded_by, uploaded_at, notes, document_group_id, version_number, is_current, file_size, mime_type, replace_reason, replaced_at, uploaded_by_profile:profiles!contract_documents_uploaded_by_fkey(full_name)"
    )
    .eq("document_group_id", documentGroupId)
    .order("version_number", { ascending: false });
}

export async function listContractChanges(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_changes")
    .select(
      "id, contract_id, field_name, previous_value, new_value, change_reason, changed_by, changed_at, source, changed_by_profile:profiles!contract_changes_changed_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("changed_at", { ascending: false });
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

export async function listContractRenewalReminders(
  supabase: SupabaseClient,
  contractId: string,
  options?: { openOnly?: boolean }
) {
  let query = supabase
    .from("contract_renewal_reminders")
    .select(
      "id, contract_id, reminder_kind, anchor_date, days_before, status, message, generated_at, acknowledged_at, acknowledged_by"
    )
    .eq("contract_id", contractId)
    .order("days_before", { ascending: false });

  if (options?.openOnly) {
    query = query.eq("status", "open");
  }

  return query;
}

export async function listOpenRenewalReminders(supabase: SupabaseClient) {
  return supabase
    .from("contract_renewal_reminders")
    .select(
      "id, contract_id, reminder_kind, anchor_date, days_before, status, message, generated_at, contracts(id, contract_number, name, status, end_date, renewal_type, customers(id, name))"
    )
    .eq("status", "open")
    .order("days_before", { ascending: true });
}

export async function listContractRenewals(supabase: SupabaseClient, contractId: string) {
  return supabase
    .from("contract_renewals")
    .select(
      "id, contract_id, previous_start_date, previous_end_date, new_start_date, new_end_date, renewal_method, previous_status, resulting_status, notes, renewed_by, renewed_at, renewed_by_profile:profiles!contract_renewals_renewed_by_fkey(full_name)"
    )
    .eq("contract_id", contractId)
    .order("renewed_at", { ascending: false });
}

export async function listRecentContractRenewals(supabase: SupabaseClient, limit = 25) {
  return supabase
    .from("contract_renewals")
    .select(
      "id, contract_id, previous_start_date, previous_end_date, new_start_date, new_end_date, renewal_method, previous_status, resulting_status, notes, renewed_by, renewed_at, contracts(id, contract_number, name, customers(id, name)), renewed_by_profile:profiles!contract_renewals_renewed_by_fkey(full_name)"
    )
    .order("renewed_at", { ascending: false })
    .limit(limit);
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
