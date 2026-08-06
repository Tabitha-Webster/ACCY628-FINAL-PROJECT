import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import type { HrDepartment, HrPosition } from "@/lib/types";
import {
  aggregateContractHours,
  contractHoursFromRpc,
  rankDemoApplicants,
  type ContractHoursRow,
} from "@/lib/hr-applicants";

function StarRating({ stars }: { stars: number }) {
  const filled = Math.max(1, Math.min(5, stars));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${filled} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-sm ${i < filled ? "text-warning" : "opacity-25"}`}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

async function loadContractHoursForMatch(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ContractHoursRow[]> {
  const { data, error } = await supabase.rpc("hr_active_contract_hours");
  if (!error && data) {
    return contractHoursFromRpc(
      data as { contract_id: string; hours_worked: number | string | null }[]
    );
  }

  // Secondary fallback if RPC missing and service role is configured.
  try {
    const admin = createServiceClient();
    const [{ data: contracts }, { data: timeEntries }] = await Promise.all([
      admin.from("contracts").select("id, name").eq("status", "active"),
      admin.from("time_entries").select("contract_id, hours_worked"),
    ]);
    return aggregateContractHours(contracts ?? [], timeEntries ?? []);
  } catch {
    return [];
  }
}

export default async function HrApplicantsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hr") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: departments, error: deptError },
    { data: positions, error: posError },
    contractHours,
  ] = await Promise.all([
    supabase.from("hr_departments").select("id, name").order("name"),
    supabase
      .from("hr_positions")
      .select("id, department_id, title, status")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    loadContractHoursForMatch(supabase),
  ]);

  const error = deptError || posError;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Applicants" description="Prioritize who to hire." />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as Pick<HrDepartment, "id" | "name">[];
  const openPositions = (positions ?? []) as Pick<
    HrPosition,
    "id" | "department_id" | "title" | "status"
  >[];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const openTitles = openPositions.map((p) => p.title);

  const rankedApplicants = rankDemoApplicants({
    contractHours,
    openPositionTitles: openTitles,
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Applicants" />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Open roles ({openPositions.length})
        </h2>
        {openPositions.length === 0 ? (
          <p className="text-sm opacity-70">No open roles right now.</p>
        ) : (
          <DataTable headers={["Role", "Department"]}>
            {openPositions.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.title}</td>
                <td>{deptName.get(p.department_id) ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Who to hire</h2>

        {rankedApplicants.length === 0 ? (
          <EmptyState title="No applicants" />
        ) : (
          <DataTable headers={["Name", "Applied for", "Match", "Stars"]}>
            {rankedApplicants.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.fullName}</td>
                <td>{a.appliedFor}</td>
                <td>
                  <span className="font-semibold tabular-nums">{a.matchPercent}%</span>
                </td>
                <td>
                  <StarRating stars={a.stars} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
