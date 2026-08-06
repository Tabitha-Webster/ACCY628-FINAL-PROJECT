import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/constants";
import {
  PageHeader,
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  Money,
  StatusBadge,
} from "@/components/ui";
import type { HrContractor, HrDepartment, HrPosition } from "@/lib/types";

/** Compact display id (#1, #2, …) instead of full UUIDs. */
function ShortId({ n }: { n: number }) {
  return (
    <span className="font-mono text-xs tabular-nums opacity-70" title={`Row ${n}`}>
      #{n}
    </span>
  );
}

export default async function AdminHrPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role) && profile.role !== "hr") redirect("/dashboard");

  const supabase = await createClient();
  const [departmentsRes, positionsRes, contractorsRes] = await Promise.all([
    supabase.from("hr_departments").select("id, name, annual_budget, created_at").order("name"),
    supabase
      .from("hr_positions")
      .select("id, department_id, title, status, budgeted_cost, opened_at, filled_at, notes")
      .order("title"),
    supabase
      .from("hr_contractors")
      .select(
        "id, department_id, position_id, full_name, status, annual_cost, hired_at, ended_at, notes"
      )
      .order("full_name"),
  ]);

  const errors = [departmentsRes.error, positionsRes.error, contractorsRes.error]
    .filter(Boolean)
    .map((e) => e!.message);

  const departments = (departmentsRes.data ?? []) as Pick<
    HrDepartment,
    "id" | "name" | "annual_budget" | "created_at"
  >[];
  const positions = (positionsRes.data ?? []) as Pick<
    HrPosition,
    "id" | "department_id" | "title" | "status" | "budgeted_cost" | "opened_at" | "filled_at" | "notes"
  >[];
  const contractors = (contractorsRes.data ?? []) as Pick<
    HrContractor,
    | "id"
    | "department_id"
    | "position_id"
    | "full_name"
    | "status"
    | "annual_cost"
    | "hired_at"
    | "ended_at"
    | "notes"
  >[];

  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const deptNum = new Map(departments.map((d, i) => [d.id, i + 1]));
  const positionTitle = new Map(positions.map((p) => [p.id, p.title]));
  const positionNum = new Map(positions.map((p, i) => [p.id, i + 1]));

  return (
    <div>
      <PageHeader
        title="HR Directory"
        description="Departments, open roles, and contractors."
        actions={
          isAdminRole(profile.role) ? (
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Admin Console
            </Link>
          ) : null
        }
      />

      {errors.length > 0 ? (
        <div className="mb-4 space-y-2">
          {errors.map((message) => (
            <ErrorState key={message} message={message} />
          ))}
          <p className="text-sm opacity-70">
            If these are permission errors, run <code>scripts/admin-access-policies.sql</code> in
            Supabase.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Departments ({departments.length})</h2>
          {departments.length === 0 ? (
            <EmptyState title="No departments" description="hr_departments has no rows yet." />
          ) : (
            <DataTable headers={["#", "Name", "Annual budget", "Created"]}>
              {departments.map((row, idx) => (
                <tr key={row.id}>
                  <td>
                    <ShortId n={idx + 1} />
                  </td>
                  <td className="font-medium">{row.name}</td>
                  <td>
                    <Money value={Number(row.annual_budget)} />
                  </td>
                  <td>
                    <DateText value={row.created_at} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Positions ({positions.length})</h2>
          {positions.length === 0 ? (
            <EmptyState title="No positions" description="hr_positions has no rows yet." />
          ) : (
            <DataTable
              headers={["#", "Title", "Department", "Status", "Budget", "Opened", "Filled", "Notes"]}
            >
              {positions.map((row, idx) => (
                <tr key={row.id}>
                  <td>
                    <ShortId n={idx + 1} />
                  </td>
                  <td className="font-medium">{row.title}</td>
                  <td>
                    <span className="mr-1.5">
                      {deptName.get(row.department_id) ?? "—"}
                    </span>
                    {deptNum.has(row.department_id) ? (
                      <ShortId n={deptNum.get(row.department_id)!} />
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <Money value={Number(row.budgeted_cost)} />
                  </td>
                  <td>
                    <DateText value={row.opened_at} />
                  </td>
                  <td>
                    <DateText value={row.filled_at} />
                  </td>
                  <td className="max-w-[12rem] truncate text-sm opacity-70">{row.notes ?? "—"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Contractors ({contractors.length})</h2>
          {contractors.length === 0 ? (
            <EmptyState title="No contractors" description="hr_contractors has no rows yet." />
          ) : (
            <DataTable
              headers={[
                "#",
                "Name",
                "Department",
                "Role",
                "Status",
                "Annual cost",
                "Started",
                "Ended",
                "Notes",
              ]}
            >
              {contractors.map((row, idx) => (
                <tr key={row.id}>
                  <td>
                    <ShortId n={idx + 1} />
                  </td>
                  <td className="font-medium">{row.full_name}</td>
                  <td>
                    <span className="mr-1.5">
                      {deptName.get(row.department_id) ?? "—"}
                    </span>
                    {deptNum.has(row.department_id) ? (
                      <ShortId n={deptNum.get(row.department_id)!} />
                    ) : null}
                  </td>
                  <td>
                    {row.position_id ? (
                      <>
                        <span className="mr-1.5">
                          {positionTitle.get(row.position_id) ?? "—"}
                        </span>
                        {positionNum.has(row.position_id) ? (
                          <ShortId n={positionNum.get(row.position_id)!} />
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <Money value={Number(row.annual_cost)} />
                  </td>
                  <td>
                    <DateText value={row.hired_at} />
                  </td>
                  <td>
                    <DateText value={row.ended_at} />
                  </td>
                  <td className="max-w-[12rem] truncate text-sm opacity-70">{row.notes ?? "—"}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      </div>
    </div>
  );
}
