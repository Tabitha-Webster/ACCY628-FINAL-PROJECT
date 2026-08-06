import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, DateText, ErrorState, StatCard } from "@/components/ui";
import { CustomerChangeRequestApprovalCard, CustomerProjectApprovalCard } from "@/components/CustomerApprovals";
import { CustomerProjectNameButton } from "@/components/CustomerProjectSummary";
import { ProjectProgressCard } from "@/components/ProjectProgressCard";
import type { ApprovalStatus, Project, ProjectMilestone } from "@/lib/types";

export default async function MyProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/projects");
  await requireApprovedCustomer(profile);

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, name, status, start_date, target_completion_date, fixed_fee, estimated_billing_amount, amount_billed, amount_collected, description, customer_approval_status, customer_id, contract_id"
    )
    .eq("customer_id", profile.customer_id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Projects" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (projects ?? []) as Pick<
    Project,
    | "id"
    | "name"
    | "status"
    | "start_date"
    | "target_completion_date"
    | "fixed_fee"
    | "estimated_billing_amount"
    | "amount_billed"
    | "amount_collected"
    | "description"
    | "customer_approval_status"
    | "customer_id"
    | "contract_id"
  >[];

  const projectIds = rows.map((p) => p.id);
  const contractIds = Array.from(new Set(rows.map((p) => p.contract_id).filter(Boolean))) as string[];
  const awaitingProjects = rows.filter(
    (p) => p.status === "awaiting_customer_approval" || p.customer_approval_status === "pending"
  );

  const [pendingRequestsRes, milestonesRes, contractsRes] = await Promise.all([
    projectIds.length
      ? supabase
          .from("additional_work_requests")
          .select("id, title, description, project_id, estimated_hours, estimated_amount, approval_status, customer_approval_status")
          .in("project_id", projectIds)
          .eq("customer_approval_status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({
          data: [] as {
            id: string;
            title: string;
            description: string;
            project_id: string | null;
            estimated_hours: number | null;
            estimated_amount: number | null;
            approval_status: ApprovalStatus;
            customer_approval_status: string | null;
          }[],
        }),
    projectIds.length
      ? supabase
          .from("project_milestones")
          .select("id, project_id, name, completed, approval_status, due_date")
          .in("project_id", projectIds)
          .order("due_date", { ascending: true, nullsFirst: false })
      : Promise.resolve({
          data: [] as Pick<
            ProjectMilestone,
            "id" | "project_id" | "name" | "completed" | "approval_status" | "due_date"
          >[],
        }),
    contractIds.length
      ? supabase
          .from("contracts")
          .select("id, contract_number, name, start_date, end_date, status")
          .in("id", contractIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            contract_number: string;
            name: string;
            start_date: string | null;
            end_date: string | null;
            status: string | null;
          }[],
        }),
  ]);

  const pendingRequests = pendingRequestsRes.data;

  const costRequests = (pendingRequests ?? []).filter(
    (r) => Number(r.estimated_hours ?? 0) > 0 || Number(r.estimated_amount ?? 0) > 0
  );
  const projectName = new Map(rows.map((p) => [p.id, p.name]));
  const contractById = new Map((contractsRes.data ?? []).map((c) => [c.id, c]));

  const milestonesByProject = new Map<
    string,
    Pick<ProjectMilestone, "id" | "name" | "completed" | "approval_status" | "due_date">[]
  >();
  for (const m of milestonesRes.data ?? []) {
    const list = milestonesByProject.get(m.project_id) ?? [];
    list.push(m);
    milestonesByProject.set(m.project_id, list);
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Approve proposed projects and additional hours/price requests, then track delivery."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Your Projects" value={String(rows.length)} />
        <StatCard
          label="Projects Awaiting Approval"
          value={String(awaitingProjects.length)}
          tone={awaitingProjects.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Additional Cost Requests"
          value={String(costRequests.length)}
          tone={costRequests.length > 0 ? "warning" : "success"}
          hint="Out-of-scope hours/price needing your OK"
        />
      </div>

      {(awaitingProjects.length > 0 || costRequests.length > 0) ? (
        <div className="mb-8 space-y-4">
          <h2 className="text-sm font-semibold">Your Approval Queue</h2>
          {awaitingProjects.map((p) => (
            <CustomerProjectApprovalCard
              key={p.id}
              currentUserId={profile.id}
              project={{
                id: p.id,
                name: p.name,
                description: p.description,
                fixed_fee: p.fixed_fee,
                estimated_billing_amount: p.estimated_billing_amount,
              }}
            />
          ))}
          {costRequests.map((r) => (
            <CustomerChangeRequestApprovalCard
              key={r.id}
              currentUserId={profile.id}
              request={{
                id: r.id,
                title: r.title,
                description: r.description,
                project_id: r.project_id,
                project_name: r.project_id ? projectName.get(r.project_id) : undefined,
                estimated_hours: r.estimated_hours,
                estimated_amount: r.estimated_amount,
                approval_status: r.approval_status,
                customer_approval_status: r.customer_approval_status,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mb-8">
          <EmptyState
            title="Nothing waiting on you"
            description="When a project is sent for approval or additional hours/price are requested, they will appear here."
          />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Any projects scoped for your organization will appear here." />
      ) : (
        <DataTable
          headers={["Project", "Status", "Completion", "Your Approval", "Target Completion", "Amount", "Billed", "Collected"]}
        >
          {rows.map((p) => {
            const needsYou =
              p.status === "awaiting_customer_approval" || p.customer_approval_status === "pending";
            const milestones = milestonesByProject.get(p.id) ?? [];
            const contract = p.contract_id ? contractById.get(p.contract_id) ?? null : null;
            return (
              <tr key={p.id}>
                <td>
                  <CustomerProjectNameButton
                    project={{
                      id: p.id,
                      name: p.name,
                      description: p.description,
                      status: p.status,
                      customer_approval_status: p.customer_approval_status,
                      start_date: p.start_date,
                      target_completion_date: p.target_completion_date,
                      fixed_fee: p.fixed_fee,
                      estimated_billing_amount: p.estimated_billing_amount,
                      amount_billed: p.amount_billed,
                      amount_collected: p.amount_collected,
                      contract: contract
                        ? {
                            contract_number: contract.contract_number,
                            name: contract.name,
                            start_date: contract.start_date,
                            end_date: contract.end_date,
                            status: contract.status,
                          }
                        : null,
                    }}
                  />
                  {p.description ? <p className="mt-1 max-w-sm truncate text-xs opacity-60">{p.description}</p> : null}
                  {needsYou ? (
                    <p className="mt-1 text-xs text-warning">Action needed in the approval queue above.</p>
                  ) : null}
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  <ProjectProgressCard
                    compact
                    status={p.status}
                    startDate={p.start_date}
                    targetCompletionDate={p.target_completion_date}
                    projectManagerName={null}
                    milestones={milestones.map((m) => ({
                      id: m.id,
                      name: m.name,
                      completed: m.completed,
                      approval_status: m.approval_status,
                      due_date: m.due_date,
                    }))}
                  />
                </td>
                <td>
                  {needsYou ? (
                    <StatusBadge status="pending" />
                  ) : p.customer_approval_status ? (
                    <StatusBadge status={p.customer_approval_status} />
                  ) : (
                    "—"
                  )}
                </td>
                <td>{p.target_completion_date ? <DateText value={p.target_completion_date} /> : "—"}</td>
                <td>
                  <Money value={Number(p.fixed_fee ?? 0) || Number(p.estimated_billing_amount ?? 0)} />
                </td>
                <td>
                  <Money value={Number(p.amount_billed ?? 0)} />
                </td>
                <td>
                  <Money value={Number(p.amount_collected ?? 0)} />
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
