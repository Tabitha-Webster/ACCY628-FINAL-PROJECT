import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState } from "@/components/ui";
import { ContractPdfViewer } from "@/components/ContractPdfViewer";
import {
  canEditContracts,
  canViewContractsModule,
  getContractById,
  unwrapAssignedManager,
  unwrapCustomer,
  type ContractDetailRow,
} from "@/lib/contracts";
import type { ContractSignaturePacket } from "@/lib/contracts/signature-packets";

export default async function ContractPdfViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const [{ data: contractData, error }, packetRes] = await Promise.all([
    getContractById(supabase, id),
    supabase
      .from("contract_signature_packets")
      .select("*")
      .eq("contract_id", id)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  if (!error && !contractData) notFound();
  if (error || !contractData) {
    return <ErrorState message={error?.message ?? "Contract not found."} />;
  }

  const contract = contractData as ContractDetailRow;
  const customer = unwrapCustomer(contract);
  const manager = unwrapAssignedManager(contract);
  const packet = (packetRes.data as ContractSignaturePacket | null) ?? null;
  const canEdit = canEditContracts(profile.role);
  const backHref =
    profile.role === "manager" || profile.role === "admin"
      ? "/contracts/view-edit"
      : `/contracts/${id}`;

  return (
    <ContractPdfViewer
      contract={{
        id: contract.id,
        customer_id: contract.customer_id,
        contract_number: contract.contract_number,
        name: contract.name,
        status: contract.status,
        contract_type: contract.contract_type,
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_recurring_fee: contract.monthly_recurring_fee,
        included_hours_per_month: contract.included_hours_per_month,
        additional_hourly_rate: contract.additional_hourly_rate,
        payment_terms: contract.payment_terms,
        billing_frequency: contract.billing_frequency,
        sla_response_hours: contract.sla_response_hours,
        sla_resolution_hours: contract.sla_resolution_hours,
        description: contract.description,
        scope: contract.scope,
        included_services: contract.included_services,
        work_location: contract.work_location,
      }}
      customerName={customer?.name ?? "Customer"}
      managerName={manager?.full_name ?? null}
      packet={packet}
      backHref={backHref}
      editHref={canEdit ? `/contracts/${id}/edit` : null}
    />
  );
}
