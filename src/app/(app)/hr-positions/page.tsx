import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PositionStatusActions } from "@/components/PositionStatusActions";
import {
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import type { HrContractor, HrDepartment, HrPosition, HrPositionStatus } from "@/lib/types";

type SearchParams = Promise<{ status?: string; department?: string }>;

export default async function HrPositionsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hr") redirect("/dashboard");

  const params = await searchParams;
  const statusFilter = (params.status ?? "all").toLowerCase();
  const departmentFilter = params.department ?? "all";

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
      .order("opened_at", { ascending: false }),
    supabase.from("hr_contractors").select("id, position_id, full_name, status").eq("status", "active"),
  ]);

  const error = deptError || posError || contrError;
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Positions" description="Open and filled contractor roles by department." />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as Pick<HrDepartment, "id" | "name">[];
  const allPositions = (positions ?? []) as HrPosition[];
  const contr = (contractors ?? []) as Pick<HrContractor, "id" | "position_id" | "full_name" | "status">[];

  const contractorByPosition = new Map<string, string>();
  for (const c of contr) {
    if (c.position_id) contractorByPosition.set(c.position_id, c.full_name);
  }

  const deptName = new Map(depts.map((d) => [d.id, d.name]));

  const filtered = allPositions.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (departmentFilter !== "all" && p.department_id !== departmentFilter) return false;
    return true;
  });

  function hrefFor(nextStatus: string, nextDept: string) {
    const q = new URLSearchParams();
    if (nextStatus !== "all") q.set("status", nextStatus);
    if (nextDept !== "all") q.set("department", nextDept);
    const s = q.toString();
    return s ? `/hr-positions?${s}` : "/hr-positions";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Positions"
        description="Contractor roles by department — filter by status and update open/filled for demos."
      />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="form-control w-full max-w-xs">
          <span className="label-text text-xs">Status</span>
          <select
            name="status"
            className="select select-bordered select-sm"
            defaultValue={statusFilter}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="filled">Filled</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="form-control w-full max-w-xs">
          <span className="label-text text-xs">Department</span>
          <select
            name="department"
            className="select select-bordered select-sm"
            defaultValue={departmentFilter}
          >
            <option value="all">All departments</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-sm btn-primary">
          Apply filters
        </button>
        {(statusFilter !== "all" || departmentFilter !== "all") && (
          <a href="/hr-positions" className="btn btn-sm btn-ghost">
            Clear
          </a>
        )}
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        {(["all", "open", "filled"] as const).map((s) => (
          <a
            key={s}
            href={hrefFor(s, departmentFilter)}
            className={`badge badge-lg ${statusFilter === s ? "badge-primary" : "badge-outline"}`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </a>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No positions match" description="Try a different status or department filter." />
      ) : (
        <DataTable
          headers={[
            "Title",
            "Department",
            "Status",
            "Budgeted cost",
            "Opened",
            "Filled",
            "Contractor",
            "Actions",
          ]}
        >
          {filtered.map((p) => (
            <tr key={p.id}>
              <td className="font-medium">{p.title}</td>
              <td>{deptName.get(p.department_id) ?? "—"}</td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td>
                <Money value={Number(p.budgeted_cost)} />
              </td>
              <td>
                <DateText value={p.opened_at} />
              </td>
              <td>
                <DateText value={p.filled_at} />
              </td>
              <td>{contractorByPosition.get(p.id) ?? "—"}</td>
              <td>
                <PositionStatusActions positionId={p.id} status={p.status as HrPositionStatus} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
