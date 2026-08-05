import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import { AdditionalWorkActions } from "@/components/AdditionalWorkActions";

export default async function AdditionalWorkPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("additional_work_requests")
    .select("id, customer_id, support_ticket_id, requested_by, title, description, estimated_hours, estimated_amount, approval_status, reviewed_by, reviewed_at, review_notes, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Additional Work Requests" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = requests ?? [];
  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id)));
  const userIds = Array.from(
    new Set([...rows.map((r) => r.requested_by), ...rows.map((r) => r.reviewed_by).filter((v): v is string => Boolean(v))])
  );

  const [customersRes, usersRes] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const userName = new Map((usersRes.data ?? []).map((u) => [u.id, u.full_name]));

  const pending = rows.filter((r) => r.approval_status === "pending");
  const decided = rows.filter((r) => r.approval_status !== "pending");

  return (
    <div>
      <PageHeader
        title="Additional Work Requests"
        description="Out-of-scope work flagged from tickets, projects, or submitted directly for manager review."
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Awaiting Decision ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" description="All additional work requests have been reviewed." />
        ) : (
          <DataTable headers={["Request", "Customer", "Requested By", "Est. Hours", "Est. Amount", "Submitted", profile.role === "manager" ? "Decision" : "Status"]}>
            {pending.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium">{r.title}</p>
                  <p className="max-w-xs truncate text-xs opacity-60">{r.description}</p>
                </td>
                <td>{customerName.get(r.customer_id) ?? "—"}</td>
                <td>{userName.get(r.requested_by) ?? "—"}</td>
                <td>{r.estimated_hours != null ? <Hours value={Number(r.estimated_hours)} /> : "—"}</td>
                <td>{r.estimated_amount != null ? <Money value={Number(r.estimated_amount)} /> : "—"}</td>
                <td>
                  <DateText value={r.created_at} />
                </td>
                <td>
                  {profile.role === "manager" ? (
                    <AdditionalWorkActions requestId={r.id} supportTicketId={r.support_ticket_id} reviewerId={profile.id} />
                  ) : (
                    <StatusBadge status={r.approval_status} />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Reviewed</h2>
        {decided.length === 0 ? (
          <EmptyState title="No reviewed requests yet" />
        ) : (
          <DataTable headers={["Request", "Customer", "Requested By", "Status", "Reviewed By", "Reviewed"]}>
            {decided.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{customerName.get(r.customer_id) ?? "—"}</td>
                <td>{userName.get(r.requested_by) ?? "—"}</td>
                <td>
                  <StatusBadge status={r.approval_status} />
                </td>
                <td>{r.reviewed_by ? userName.get(r.reviewed_by) ?? "—" : "—"}</td>
                <td>{r.reviewed_at ? <DateText value={r.reviewed_at} /> : "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
