import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ContractForm } from "@/components/ContractForm";
import { ErrorState } from "@/components/ui";
import { canEditContracts, getContractById, type ContractDetailRow } from "@/lib/contracts";

function str(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value);
}

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canEditContracts(profile.role)) redirect("/contracts/reports");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: contractData, error }, { data: customers }, { data: managers }, { data: technicians }] =
    await Promise.all([
      getContractById(supabase, id),
      supabase.from("customers").select("id, name").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "manager")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "technician")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  if (!error && !contractData) notFound();
  if (error || !contractData) {
    return <ErrorState message={error?.message ?? "Contract not found."} />;
  }

  if (!customers || customers.length === 0) {
    return (
      <div className="space-y-4">
        <ErrorState message="Customer must exist before editing a contract. Add a customer first." />
        <Link href="/customers" className="btn btn-primary">
          Go to customers
        </Link>
      </div>
    );
  }

  const contract = contractData as ContractDetailRow;
  const overagesAllowed =
    contract.overages_allowed ?? Number(contract.additional_hourly_rate ?? 0) > 0;
  const isDraft = contract.status === "draft";

  return (
    <div>
      <div className="mb-4">
        <Link
          href={isDraft ? "/contracts?status=draft" : "/contracts/view-edit"}
          className="btn btn-ghost btn-sm"
        >
          {isDraft ? "← Back to drafts" : "← Back to view and edit"}
        </Link>
      </div>
      <ContractForm
        mode="edit"
        profileId={profile.id}
        profileName={profile.full_name}
        contractId={id}
        currentVersion={Number(contract.version_number ?? 1)}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        managers={(managers ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
        technicians={(technicians ?? []).map((t) => ({ id: t.id, label: t.full_name }))}
        initialValues={{
          contract_number: contract.contract_number,
          name: contract.name,
          description: contract.description ?? "",
          customer_id: contract.customer_id,
          assigned_manager_id: contract.assigned_manager_id ?? "",
          assigned_technician_id: contract.assigned_technician_id ?? "",
          sales_representative_id: contract.sales_representative_id ?? "",
          contract_type: contract.contract_type,
          status: contract.status,
          work_location:
            contract.work_location === "on_site" || contract.work_location === "remote"
              ? contract.work_location
              : contract.onsite_support
                ? "on_site"
                : "remote",
          start_date: contract.start_date,
          end_date: contract.end_date ?? "",
          effective_date: contract.effective_date ?? "",
          signed_date: contract.signed_date ?? "",
          renewal_type: contract.renewal_type ?? "manual",
          renewal_terms: contract.renewal_terms ?? "",
          cancellation_terms: contract.cancellation_terms ?? "",
          cancellation_notice_days: str(contract.cancellation_notice_days),
          monthly_recurring_fee: str(contract.monthly_recurring_fee),
          one_time_setup_fee: str(contract.one_time_setup_fee ?? 0),
          included_hours_per_month: str(contract.included_hours_per_month),
          additional_hourly_rate: str(contract.additional_hourly_rate),
          overages_allowed: overagesAllowed,
          overage_charges: str(contract.overage_charges ?? 0),
          billing_frequency: contract.billing_frequency ?? "monthly",
          billing_method: contract.billing_method ?? "invoice",
          billing_timing: contract.billing_timing ?? "in_advance",
          payment_terms: contract.payment_terms ?? "",
          next_invoice_date: contract.next_invoice_date ?? "",
          last_invoice_date: contract.last_invoice_date ?? "",
          billing_status: String(contract.billing_status ?? "unbilled"),
          included_services: contract.included_services ?? "",
          excluded_services: contract.excluded_services ?? "",
          supported_locations: contract.supported_locations ?? "",
          supported_users_devices: contract.supported_users_devices ?? "",
          sla_critical_response_hours: str(contract.sla_critical_response_hours),
          sla_high_response_hours: str(contract.sla_high_response_hours),
          sla_medium_response_hours: str(contract.sla_medium_response_hours),
          sla_low_response_hours: str(contract.sla_low_response_hours),
          sla_response_hours: str(contract.sla_response_hours),
          sla_resolution_hours: str(contract.sla_resolution_hours),
        }}
      />
    </div>
  );
}
