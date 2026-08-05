import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/constants";
import { PageHeader, DataTable, EmptyState, ErrorState, StatusBadge } from "@/components/ui";

export default async function AdminHrPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role) && profile.role !== "hr") redirect("/dashboard");

  const supabase = await createClient();
  const [departmentsRes, positionsRes, contractorsRes] = await Promise.all([
    supabase.from("hr_departments").select("*").limit(100),
    supabase.from("hr_positions").select("*").limit(100),
    supabase.from("hr_contractors").select("*").limit(100),
  ]);

  const errors = [departmentsRes.error, positionsRes.error, contractorsRes.error]
    .filter(Boolean)
    .map((e) => e!.message);

  const departments = departmentsRes.data ?? [];
  const positions = positionsRes.data ?? [];
  const contractors = contractorsRes.data ?? [];

  return (
    <div>
      <PageHeader
        title="HR Directory"
        description="Departments, positions, and contractors from the HR tables."
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
            If these are permission errors, run <code>scripts/admin-access-policies.sql</code> in Supabase.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Departments ({departments.length})</h2>
          {departments.length === 0 ? (
            <EmptyState title="No departments" description="hr_departments has no rows yet." />
          ) : (
            <DataTable headers={Object.keys(departments[0])}>
              {departments.map((row, idx) => (
                <tr key={String((row as { id?: string }).id ?? idx)}>
                  {Object.values(row).map((value, cellIdx) => (
                    <td key={cellIdx}>{value == null ? "—" : String(value)}</td>
                  ))}
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
            <DataTable headers={Object.keys(positions[0])}>
              {positions.map((row, idx) => (
                <tr key={String((row as { id?: string }).id ?? idx)}>
                  {Object.values(row).map((value, cellIdx) => (
                    <td key={cellIdx}>
                      {typeof value === "boolean" ? (
                        <StatusBadge status={value ? "active" : "inactive"} />
                      ) : value == null ? (
                        "—"
                      ) : (
                        String(value)
                      )}
                    </td>
                  ))}
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
            <DataTable headers={Object.keys(contractors[0])}>
              {contractors.map((row, idx) => (
                <tr key={String((row as { id?: string }).id ?? idx)}>
                  {Object.values(row).map((value, cellIdx) => (
                    <td key={cellIdx}>{value == null ? "—" : String(value)}</td>
                  ))}
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      </div>
    </div>
  );
}
