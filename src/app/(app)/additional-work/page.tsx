import Link from "next/link";
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
    .select(
      "id, customer_id, contract_id, project_id, support_ticket_id, requested_by, title, description, estimated_hours, estimated_amount, approval_status, customer_approval_status, reviewed_by, reviewed_at, review_notes, created_at"
    )
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
  const contractIds = Array.from(new Set(rows.map((r) => r.contract_id).filter((v): v is string => Boolean(v))));
  const projectIds = Array.from(new Set(rows.map((r) => r.project_id).filter((v): v is string => Boolean(v))));
  const userIds = Array.from(
    new Set([...rows.map((r) => r.requested_by), ...rows.map((r) => r.reviewed_by).filter((v): v is string => Boolean(v))])
  );

  const [customersRes, usersRes, contractsRes, projectsRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    contractIds.length
      ? supabase.from("contracts").select("id, name, contract_number").in("id", contractIds)
      : Promise.resolve({ data: [] as { id: string; name: string; contract_number: string }[] }),
    projectIds.length
      ? supabase.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const userName = new Map((usersRes.data ?? []).map((u) => [u.id, u.full_name]));
  const contractLabel = new Map(
    (contractsRes.data ?? []).map((c) => [c.id, `${c.contract_number} · ${c.name}`])
  );
  const projectName = new Map((projectsRes.data ?? []).map((p) => [p.id, p.name]));

  const pending = rows.filter((r) => r.approval_status === "pending");
  const decided = rows.filter((r) => r.approval_status !== "pending");

  return (
    <div>
      <PageHeader
        title="Additional Work Requests"
        description="Out-of-scope work flagged from tickets or projects, connected to contracts for manager review."
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Awaiting Decision ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" description="All additional work requests have been reviewed." />
        ) : (
          <DataTable
            headers={[
              "Request",
              "Customer",
              "Project",
              "Contract",
              "Requested By",
              "Additional Hours",
              "Additional Price",
              "Submitted",
              profile.role === "manager" ? "Decision" : "Status",
            ]}
          >
            {pending.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium">{r.title}</p>
                  <p className="max-w-xs truncate text-xs opacity-60">{r.description}</p>
                </td>
                <td>{customerName.get(r.customer_id) ?? "—"}</td>
                <td>
                  {r.project_id ? (
                    <Link href={`/projects/${r.project_id}`} className="link link-hover text-sm">
                      {projectName.get(r.project_id) ?? "View"}
                    </Link>
                  ) : (
                    <span className="opacity-50">—</span>
                  )}
                </td>
                <td>
                  {r.contract_id ? (
                    <Link href={`/contracts/${r.contract_id}`} className="link link-hover text-sm">
                      {contractLabel.get(r.contract_id) ?? "View"}
                    </Link>
                  ) : (
                    <span className="opacity-50">—</span>
                  )}
                </td>
                <td>{userName.get(r.requested_by) ?? "—"}</td>
                <td>{r.estimated_hours != null ? <Hours value={Number(r.estimated_hours)} /> : "—"}</td>
                <td>{r.estimated_amount != null ? <Money value={Number(r.estimated_amount)} /> : "—"}</td>
                <td>
                  <DateText value={r.created_at} />
                </td>
                <td>
                  {profile.role === "manager" ? (
                    <AdditionalWorkActions
                      requestId={r.id}
                      supportTicketId={r.support_ticket_id}
                      reviewerId={profile.id}
                      projectId={r.project_id}
                      customerApprovalStatus={r.customer_approval_status}
                    />
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
          <DataTable headers={["Request", "Customer", "Project", "Contract", "Requested By", "Status", "Reviewed By", "Reviewed"]}>
            {decided.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{customerName.get(r.customer_id) ?? "—"}</td>
                <td>
                  {r.project_id ? (
                    <Link href={`/projects/${r.project_id}`} className="link link-hover text-sm">
                      {projectName.get(r.project_id) ?? "View"}
                    </Link>
                  ) : (
                    <span className="opacity-50">—</span>
                  )}
                </td>
                <td>
                  {r.contract_id ? (
                    <Link href={`/contracts/${r.contract_id}`} className="link link-hover text-sm">
                      {contractLabel.get(r.contract_id) ?? "View"}
                    </Link>
                  ) : (
                    <span className="opacity-50">—</span>
                  )}
                </td>
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
