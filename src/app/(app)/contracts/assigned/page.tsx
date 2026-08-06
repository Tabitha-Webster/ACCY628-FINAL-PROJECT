import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canViewContractsModule } from "@/lib/contracts";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import {
  AssignedContractsClient,
  type AssignedContractRow,
} from "@/components/AssignedContractsClient";
import type { TechnicianSkillProfile } from "@/lib/technicians/skills";

export default async function AssignedContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");
  // Only managers manage staffing from this screen.
  if (profile.role !== "manager") redirect("/contracts");

  const supabase = await createClient();
  const [{ data: contractRows, error: contractsError }, { data: techRows, error: techError }] =
    await Promise.all([
      supabase
        .from("contracts")
        .select(
          "id, contract_number, name, status, contract_type, work_location, included_services, assigned_technician_id, customers(name)"
        )
        .order("contract_number"),
      supabase
        .from("profiles")
        .select("id, full_name, primary_specialty, skill_level, skill_tags")
        .eq("role", "technician")
        .eq("is_active", true)
        .order("full_name"),
    ]);

  if (contractsError || techError) {
    return (
      <ErrorState message={contractsError?.message ?? techError?.message ?? "Could not load assignments."} />
    );
  }

  const contracts: AssignedContractRow[] = (contractRows ?? []).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return {
      id: row.id as string,
      contract_number: row.contract_number as string,
      name: row.name as string,
      status: row.status as string,
      contract_type: row.contract_type as string,
      work_location: (row.work_location as string | null) ?? null,
      included_services: (row.included_services as string | null) ?? null,
      assigned_technician_id: (row.assigned_technician_id as string | null) ?? null,
      customer_name: (customer as { name?: string } | null)?.name ?? "—",
    };
  });

  const technicians = (techRows ?? []) as TechnicianSkillProfile[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assigned Contracts"
        description="See which technician owns each agreement, review skill levels, and reassign work without changing contract status."
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Create a contract and assign a technician to manage staffing here."
        />
      ) : (
        <AssignedContractsClient contracts={contracts} technicians={technicians} canAssign />
      )}
    </div>
  );
}
