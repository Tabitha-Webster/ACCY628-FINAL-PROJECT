import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import type { HrContractor, HrDepartment, HrPosition } from "@/lib/types";

/**
 * HR Applicants — open roles and people in the hiring pipeline.
 * Uses existing hr_positions (open) + hr_contractors as applicant/hire records.
 */
export default async function HrApplicantsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hr") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: departments, error: deptError },
    { data: positions, error: posError },
    { data: contractors, error: contrError },
  ] = await Promise.all([
    supabase.from("hr_departments").select("id, name").order("name"),
    supabase
      .from("hr_positions")
      .select("*")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    supabase
      .from("hr_contractors")
      .select("*")
      .order("hired_at", { ascending: false }),
  ]);

  const error = deptError || posError || contrError;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Applicants"
          description="Review open roles and contractor applicants in the hiring pipeline."
        />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as Pick<HrDepartment, "id" | "name">[];
  const openPositions = (positions ?? []) as HrPosition[];
  const applicants = (contractors ?? []) as HrContractor[];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const positionTitle = new Map(openPositions.map((p) => [p.id, p.title]));

  // Also load all positions so filled applicants show their role title
  const { data: allPositions } = await supabase.from("hr_positions").select("id, title");
  for (const p of allPositions ?? []) {
    positionTitle.set(p.id, p.title);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Applicants"
        description="Open roles waiting to be filled, plus contractor hires in your workforce pipeline."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open roles</h2>
        {openPositions.length === 0 ? (
          <EmptyState
            title="No open roles"
            description="When a position is marked open, it appears here for hiring."
          />
        ) : (
          <DataTable headers={["Role", "Department", "Budgeted cost", "Opened", "Notes"]}>
            {openPositions.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.title}</td>
                <td>{deptName.get(p.department_id) ?? "—"}</td>
                <td>
                  <Money value={Number(p.budgeted_cost)} />
                </td>
                <td>
                  <DateText value={p.opened_at} />
                </td>
                <td className="max-w-xs truncate text-sm opacity-70">{p.notes ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Pipeline (contractors)</h2>
          <a href="/hr-positions" className="btn btn-outline btn-sm">
            Manage positions
          </a>
        </div>
        {applicants.length === 0 ? (
          <EmptyState
            title="No applicants yet"
            description="Contractor records linked to departments and positions will show here."
          />
        ) : (
          <DataTable
            headers={["Name", "Department", "Role", "Status", "Annual cost", "Started"]}
          >
            {applicants.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.full_name}</td>
                <td>{deptName.get(c.department_id) ?? "—"}</td>
                <td>{(c.position_id && positionTitle.get(c.position_id)) || "—"}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>
                  <Money value={Number(c.annual_cost)} />
                </td>
                <td>
                  <DateText value={c.hired_at} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
