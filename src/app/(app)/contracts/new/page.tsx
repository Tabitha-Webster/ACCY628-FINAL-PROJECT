import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ContractForm } from "@/components/ContractForm";
import { ErrorState } from "@/components/ui";
import { canCreateContracts, suggestNextContractNumber } from "@/lib/contracts";

export default async function NewContractPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canCreateContracts(profile.role)) redirect("/contracts/reports");

  const supabase = await createClient();
  const [{ data: customers, error: customersError }, { data: managers }, { data: numbers }] =
    await Promise.all([
      supabase.from("customers").select("id, name").order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "manager")
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("contracts").select("contract_number"),
    ]);

  if (customersError) {
    return <ErrorState message={customersError.message} />;
  }

  const suggestedNumber = suggestNextContractNumber(
    (numbers ?? []).map((row) => row.contract_number as string)
  );

  return (
    <div>
      <div className="mb-4">
        <Link href="/contracts/reports" className="btn btn-ghost btn-sm">
          ← Back to dashboard
        </Link>
      </div>
      <ContractForm
        mode="create"
        profileId={profile.id}
        customers={(customers ?? []).map((c) => ({ id: c.id, label: c.name }))}
        managers={(managers ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
        initialValues={{
          contract_number: suggestedNumber,
          assigned_manager_id: profile.id,
          start_date: new Date().toISOString().slice(0, 10),
          effective_date: new Date().toISOString().slice(0, 10),
          additional_hourly_rate: "150",
          overages_allowed: true,
        }}
      />
    </div>
  );
}
