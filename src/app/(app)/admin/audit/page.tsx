import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/constants";
import { PageHeader, DataTable, EmptyState, ErrorState, DateText } from "@/components/ui";

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return String(row[key]);
  }
  return "—";
}

export default async function AdminAuditPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_logs").select("*").limit(100);

  if (error) {
    return (
      <div>
        <PageHeader
          title="Audit Logs"
          actions={
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Admin Console
            </Link>
          }
        />
        <ErrorState message={error.message} />
        <p className="mt-3 text-sm opacity-70">
          If this is a permissions error, run <code>scripts/admin-access-policies.sql</code> in Supabase.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Recent system activity records from the audit_logs table."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          description="The audit_logs table is empty or not populated by triggers yet. The Admin Console is ready to display events when they appear."
        />
      ) : (
        <DataTable headers={["When", "Actor", "Action", "Entity", "Details"]}>
          {rows.map((row, idx) => (
            <tr key={String(row.id ?? idx)}>
              <td>
                <DateText value={pick(row, ["created_at", "event_at", "logged_at", "timestamp"])} />
              </td>
              <td>{pick(row, ["actor_email", "actor_id", "user_id", "performed_by"])}</td>
              <td>{pick(row, ["action", "event_type", "activity"])}</td>
              <td>
                {pick(row, ["entity_type", "table_name", "resource"])}
                {row.entity_id ? ` · ${String(row.entity_id)}` : ""}
              </td>
              <td className="max-w-sm truncate opacity-70">
                {pick(row, ["details", "description", "summary", "changes"])}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
