import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contract } from "@/lib/types";

export type SignaturePacketStatus =
  | "draft"
  | "awaiting_admin" // legacy
  | "awaiting_executive"
  | "awaiting_customer"
  | "fully_executed"
  | "rejected";

export type ContractSignaturePacket = {
  id: string;
  contract_id: string;
  status: SignaturePacketStatus;
  is_current: boolean;
  storage_path: string | null;
  document_id: string | null;
  manager_signed_by: string | null;
  manager_signed_at: string | null;
  manager_signature_data: string | null;
  manager_signer_name: string | null;
  executive_signed_by: string | null;
  executive_signed_at: string | null;
  executive_signature_data: string | null;
  executive_signer_name: string | null;
  admin_signed_by: string | null;
  admin_signed_at: string | null;
  admin_signature_data: string | null;
  admin_signer_name: string | null;
  customer_signed_by: string | null;
  customer_signed_at: string | null;
  customer_signature_data: string | null;
  customer_signer_name: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const SIGNATURE_PACKET_STATUS_LABELS: Record<SignaturePacketStatus, string> = {
  draft: "Draft PDF",
  awaiting_admin: "Awaiting executive signature",
  awaiting_executive: "Awaiting executive signature",
  awaiting_customer: "Awaiting customer signature",
  fully_executed: "Fully executed",
  rejected: "Rejected",
};

export type ContractPdfInput = {
  contract: Pick<
    Contract,
    | "contract_number"
    | "name"
    | "status"
    | "contract_type"
    | "start_date"
    | "end_date"
    | "monthly_recurring_fee"
    | "included_hours_per_month"
    | "additional_hourly_rate"
    | "payment_terms"
    | "billing_frequency"
    | "sla_response_hours"
    | "sla_resolution_hours"
    | "description"
    | "scope"
    | "included_services"
    | "work_location"
  >;  customerName: string;
  managerName: string | null;
  signatures: {
    manager?: { name: string; signedAt: string; imageDataUrl: string } | null;
    executive?: { name: string; signedAt: string; imageDataUrl: string } | null;
    customer?: { name: string; signedAt: string; imageDataUrl: string } | null;
  };
};

export function packetSignaturesForPdf(packet: ContractSignaturePacket | null) {
  if (!packet) {
    return { manager: null, executive: null, customer: null };
  }
  return {
    manager:
      packet.manager_signature_data && packet.manager_signer_name && packet.manager_signed_at
        ? {
            name: packet.manager_signer_name,
            signedAt: packet.manager_signed_at,
            imageDataUrl: packet.manager_signature_data,
          }
        : null,
    executive:
      packet.executive_signature_data && packet.executive_signer_name && packet.executive_signed_at
        ? {
            name: packet.executive_signer_name,
            signedAt: packet.executive_signed_at,
            imageDataUrl: packet.executive_signature_data,
          }
        : null,
    customer:
      packet.customer_signature_data && packet.customer_signer_name && packet.customer_signed_at
        ? {
            name: packet.customer_signer_name,
            signedAt: packet.customer_signed_at,
            imageDataUrl: packet.customer_signature_data,
          }
        : null,
  };
}

export type AwaitingExecutiveSignatureItem = {
  id: string;
  contractId: string;
  contractNumber: string;
  contractName: string;
  customerName: string;
  managerName: string;
  signedAt: string | null;
  readyToSign: boolean;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Contracts currently waiting on the executive (or still pending with no packet). */
export async function listAwaitingExecutiveSignatures(supabase: SupabaseClient) {
  const [
    { data: packets, error: packetsError },
    { data: pendingContracts, error: pendingError },
    { data: customerWaitPackets, error: waitError },
  ] = await Promise.all([
    supabase
      .from("contract_signature_packets")
      .select(
        "id, contract_id, status, manager_signer_name, manager_signed_at, contracts(id, contract_number, name, customers(name))"
      )
      .eq("is_current", true)
      .in("status", ["awaiting_executive", "awaiting_admin"])
      .order("manager_signed_at", { ascending: true }),
    supabase
      .from("contracts")
      .select(
        "id, contract_number, name, customers(name), assigned_manager:profiles!contracts_assigned_manager_id_fkey(full_name)"
      )
      .eq("status", "pending_approval")
      .order("updated_at", { ascending: true }),
    supabase
      .from("contract_signature_packets")
      .select("contract_id")
      .eq("is_current", true)
      .in("status", ["awaiting_customer", "fully_executed"]),
  ]);

  const error = packetsError ?? pendingError ?? waitError;
  if (error) {
    return { data: [] as AwaitingExecutiveSignatureItem[], error };
  }

  const fromPackets: AwaitingExecutiveSignatureItem[] = (packets ?? []).map((row) => {
    const contract = unwrapOne(row.contracts as { contract_number?: string; name?: string; customers?: { name?: string } | { name?: string }[] } | null);
    const customer = unwrapOne(contract?.customers ?? null);
    return {
      id: row.id as string,
      contractId: row.contract_id as string,
      contractNumber: contract?.contract_number ?? "—",
      contractName: contract?.name ?? "Contract",
      customerName: customer?.name ?? "—",
      managerName: (row.manager_signer_name as string | null) ?? "Manager",
      signedAt: (row.manager_signed_at as string | null) ?? null,
      readyToSign: true,
    };
  });

  const alreadyListed = new Set([
    ...fromPackets.map((item) => item.contractId),
    ...(customerWaitPackets ?? []).map((row) => row.contract_id as string),
  ]);

  const fromStatus: AwaitingExecutiveSignatureItem[] = (pendingContracts ?? [])
    .filter((row) => !alreadyListed.has(row.id as string))
    .map((row) => {
      const customer = unwrapOne(row.customers as { name?: string } | { name?: string }[] | null);
      const manager = unwrapOne(
        row.assigned_manager as { full_name?: string } | { full_name?: string }[] | null
      );
      return {
        id: `status-${row.id}`,
        contractId: row.id as string,
        contractNumber: (row.contract_number as string) ?? "—",
        contractName: (row.name as string) ?? "Contract",
        customerName: customer?.name ?? "—",
        managerName: manager?.full_name ?? "Account manager",
        signedAt: null,
        readyToSign: false,
      };
    });

  return { data: [...fromPackets, ...fromStatus], error: null };
}
