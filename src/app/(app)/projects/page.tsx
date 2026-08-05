import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, DateText, ErrorState, StatCard } from "@/components/ui";
import { grossMarginPct, marginBand } from "@/lib/calculations";
import type { ApprovalStatus, Project, ProjectMilestone, ProjectStatus } from "@/lib/types";
import { ProjectActions, ProjectChangeRequestPanel } from "@/components/ProjectActions";
import { ProjectProgressCard, projectCompletionPercent } from "@/components/ProjectProgressCard";
import { ManagerApprovalQueue } from "@/components/ManagerApprovals";

type ProjectRow = Pick<
  Project,
  | "id"
  | "customer_id"
  | "contract_id"
  | "project_manager_id"
  | "name"
  | "status"
  | "fixed_fee"
  | "estimated_billing_amount"
  | "labor_budget"
  | "equipment_budget"
  | "software_budget"
  | "vendor_budget"
  | "amount_billed"
  | "amount_collected"
  | "target_completion_date"
  | "customer_approval_status"
  | "description"
  | "start_date"
>;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const { selected } = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "customer") redirect("/my-projects");

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, customer_id, contract_id, project_manager_id, name, status, fixed_fee, estimated_billing_amount, labor_budget, equipment_budget, software_budget, vendor_budget, amount_billed, amount_collected, target_completion_date, customer_approval_status, description, start_date"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Projects" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (projects ?? []) as ProjectRow[];
  const customerIds = Array.from(new Set(rows.map((p) => p.customer_id)));
  const projectIds = rows.map((p) => p.id);
  const managerIds = Array.from(new Set(rows.map((p) => p.project_manager_id).filter(Boolean))) as string[];

  const [customersRes, timeRes, costsRes, changeRes, milestonesAllRes, managersRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    projectIds.length
      ? supabase.from("time_entries").select("project_id, labor_cost, hours_worked").in("project_id", projectIds)
      : Promise.resolve({ data: [] as { project_id: string | null; labor_cost: number | null; hours_worked: number }[] }),
    projectIds.length
      ? supabase.from("direct_costs").select("project_id, internal_cost").in("project_id", projectIds)
      : Promise.resolve({ data: [] as { project_id: string | null; internal_cost: number }[] }),
    projectIds.length
      ? supabase
          .from("additional_work_requests")
          .select("id, project_id, approval_status")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as { id: string; project_id: string | null; approval_status: ApprovalStatus }[] }),
    projectIds.length
      ? supabase.from("project_milestones").select("id, project_id, name, completed, approval_status, due_date").in("project_id", projectIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            project_id: string;
            name: string;
            completed: boolean;
            approval_status: ApprovalStatus | null;
            due_date: string | null;
          }[],
        }),
    managerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", managerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const managerName = new Map((managersRes.data ?? []).map((m) => [m.id, m.full_name]));

  const actualByProject = new Map<string, number>();
  const hoursByProject = new Map<string, number>();
  for (const t of timeRes.data ?? []) {
    if (!t.project_id) continue;
    actualByProject.set(t.project_id, (actualByProject.get(t.project_id) ?? 0) + Number(t.labor_cost ?? 0));
    hoursByProject.set(t.project_id, (hoursByProject.get(t.project_id) ?? 0) + Number(t.hours_worked ?? 0));
  }

  const materialsByProject = new Map<string, number>();
  for (const c of costsRes.data ?? []) {
    if (!c.project_id) continue;
    actualByProject.set(c.project_id, (actualByProject.get(c.project_id) ?? 0) + Number(c.internal_cost));
    materialsByProject.set(c.project_id, (materialsByProject.get(c.project_id) ?? 0) + Number(c.internal_cost));
  }

  const pendingCrByProject = new Map<string, number>();
  for (const cr of changeRes.data ?? []) {
    if (!cr.project_id || cr.approval_status !== "pending") continue;
    pendingCrByProject.set(cr.project_id, (pendingCrByProject.get(cr.project_id) ?? 0) + 1);
  }

  const milestonesByProject = new Map<string, ProjectMilestone[]>();
  for (const m of milestonesAllRes.data ?? []) {
    const list = milestonesByProject.get(m.project_id) ?? [];
    list.push(m as ProjectMilestone);
    milestonesByProject.set(m.project_id, list);
  }

  const awaitingApproval = rows.filter(
    (p) => p.status === "awaiting_customer_approval" || p.customer_approval_status === "pending"
  ).length;
  const pendingChangeRequests = Array.from(pendingCrByProject.values()).reduce((sum, n) => sum + n, 0);
  const inProgress = rows.filter((p) => p.status === "in_progress").length;

  const isInternal = profile.role === "manager" || profile.role === "billing";
  const selectedId = selected && rows.some((p) => p.id === selected) ? selected : rows[0]?.id;
  const selectedProject = rows.find((p) => p.id === selectedId) ?? null;

  let selectedChangeRequests: {
    id: string;
    title: string;
    description: string;
    estimated_hours: number | null;
    estimated_amount: number | null;
    approval_status: ApprovalStatus;
    created_at: string;
    requested_by: string;
    project_id: string | null;
    contract_id: string | null;
  }[] = [];
  let requesterNames: Record<string, string> = {};
  let selectedContract: {
    id: string;
    name: string;
    contract_number: string;
    contract_type: string | null;
    included_hours_per_month: number | null;
    additional_hourly_rate: number | null;
    change_request_procedure: string | null;
  } | null = null;
  let customerContracts: { id: string; label: string }[] = [];

  if (selectedProject) {
    const [crsRes, contractRes, customerContractsRes] = await Promise.all([
      supabase
        .from("additional_work_requests")
        .select(
          "id, title, description, estimated_hours, estimated_amount, approval_status, created_at, requested_by, project_id, contract_id"
        )
        .eq("project_id", selectedProject.id)
        .order("created_at", { ascending: false }),
      selectedProject.contract_id
        ? supabase
            .from("contracts")
            .select(
              "id, name, contract_number, contract_type, included_hours_per_month, additional_hourly_rate, change_request_procedure"
            )
            .eq("id", selectedProject.contract_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("contracts")
        .select("id, name, contract_number")
        .eq("customer_id", selectedProject.customer_id)
        .order("created_at", { ascending: false }),
    ]);
    selectedChangeRequests = crsRes.data ?? [];
    selectedContract = contractRes.data;
    customerContracts = (customerContractsRes.data ?? []).map((c) => ({
      id: c.id,
      label: `${c.contract_number} · ${c.name}`,
    }));
    const requesterIds = Array.from(new Set(selectedChangeRequests.map((r) => r.requested_by)));
    if (requesterIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", requesterIds);
      requesterNames = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
    }
  }

  const selectedMilestones = selectedProject ? milestonesByProject.get(selectedProject.id) ?? [] : [];
  const contractLabels = Object.fromEntries(customerContracts.map((c) => [c.id, c.label]));
  if (selectedContract) {
    contractLabels[selectedContract.id] = `${selectedContract.contract_number} · ${selectedContract.name}`;
  }
  const projectNamesForPanel = selectedProject ? { [selectedProject.id]: selectedProject.name } : {};

  const proposedProjects =
    profile.role === "manager"
      ? rows
          .filter((p) => p.status === "proposed")
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            customer_name: customerName.get(p.customer_id) ?? "—",
            customer_approval_status: p.customer_approval_status,
          }))
      : [];
  const projectsAwaitingCustomer =
    profile.role === "manager"
      ? rows
          .filter((p) => p.status === "awaiting_customer_approval" || p.customer_approval_status === "pending")
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            customer_name: customerName.get(p.customer_id) ?? "—",
            customer_approval_status: p.customer_approval_status,
          }))
      : [];

  let managerPendingCrs: {
    id: string;
    title: string;
    project_id: string | null;
    project_name: string;
    estimated_hours: number | null;
    estimated_amount: number | null;
  }[] = [];
  let managerPendingMilestones: {
    id: string;
    name: string;
    project_id: string;
    project_name: string;
  }[] = [];

  if (profile.role === "manager" && projectIds.length) {
    const [mgrCrRes, mgrMsRes] = await Promise.all([
      supabase
        .from("additional_work_requests")
        .select("id, title, project_id, estimated_hours, estimated_amount, approval_status")
        .in("project_id", projectIds)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("project_milestones")
        .select("id, name, project_id, approval_status, completed")
        .in("project_id", projectIds)
        .eq("approval_status", "pending"),
    ]);
    managerPendingCrs = (mgrCrRes.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      project_id: r.project_id,
      project_name: rows.find((p) => p.id === r.project_id)?.name ?? "Project",
      estimated_hours: r.estimated_hours,
      estimated_amount: r.estimated_amount,
    }));
    managerPendingMilestones = (mgrMsRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      project_id: m.project_id,
      project_name: rows.find((p) => p.id === m.project_id)?.name ?? "Project",
    }));
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Track delivery progress, approvals, change requests, time, and materials."
      />

      {profile.role === "manager" ? (
        <ManagerApprovalQueue
          currentUserId={profile.id}
          proposedProjects={proposedProjects}
          projectsAwaitingCustomer={projectsAwaitingCustomer}
          pendingChangeRequests={managerPendingCrs}
          pendingMilestones={managerPendingMilestones}
        />
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={String(rows.length)} />
        <StatCard label="In Progress" value={String(inProgress)} tone="default" />
        <StatCard
          label="Awaiting Approval"
          value={String(awaitingApproval)}
          tone={awaitingApproval > 0 ? "warning" : "default"}
          hint="Customer or scope approval pending"
        />
        <StatCard
          label="Open Out-of-Scope"
          value={String(pendingChangeRequests)}
          tone={pendingChangeRequests > 0 ? "warning" : "success"}
          hint="Pending manager approval"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Projects created for customers will appear here." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <DataTable
              headers={
                isInternal
                  ? ["Project", "Customer", "Status", "Completion", "Approvals", "Out of Scope", "Margin", "Target"]
                  : ["Project", "Customer", "Status", "Completion", "Approvals", "Out of Scope", "Target"]
              }
            >
              {rows.map((p) => {
                const budget =
                  Number(p.labor_budget ?? 0) +
                  Number(p.equipment_budget ?? 0) +
                  Number(p.software_budget ?? 0) +
                  Number(p.vendor_budget ?? 0);
                const actual = actualByProject.get(p.id) ?? 0;
                const revenue = Number(p.fixed_fee ?? 0) || Number(p.estimated_billing_amount ?? 0);
                const margin = grossMarginPct(revenue, actual);
                const pendingCr = pendingCrByProject.get(p.id) ?? 0;
                const needsApproval =
                  p.status === "awaiting_customer_approval" || p.customer_approval_status === "pending";
                const isSelected = p.id === selectedId;
                const ms = milestonesByProject.get(p.id) ?? [];
                const done = ms.filter((m) => m.completed).length;
                const pct = projectCompletionPercent(p.status, done, ms.length);

                return (
                  <tr key={p.id} className={isSelected ? "bg-base-200/60" : undefined}>
                    <td>
                      <Link className="link link-hover font-medium" href={`/projects?selected=${p.id}`}>
                        {p.name}
                      </Link>
                      <div className="mt-1 text-xs opacity-60">
                        PM: {p.project_manager_id ? managerName.get(p.project_manager_id) ?? "—" : "Unassigned"}
                      </div>
                      <div className="mt-1">
                        <Link className="text-xs opacity-60 hover:opacity-100" href={`/projects/${p.id}`}>
                          Open full detail →
                        </Link>
                      </div>
                    </td>
                    <td>{customerName.get(p.customer_id) ?? "—"}</td>
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
                        milestones={ms.map((m) => ({
                          id: m.id,
                          name: m.name,
                          completed: m.completed,
                          approval_status: m.approval_status,
                          due_date: m.due_date,
                        }))}
                      />
                      <span className="sr-only">{pct}% complete</span>
                    </td>
                    <td>
                      {needsApproval ? (
                        <StatusBadge status="pending" />
                      ) : p.customer_approval_status ? (
                        <StatusBadge status={p.customer_approval_status} />
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                    <td>
                      {pendingCr > 0 ? (
                        <span className="badge badge-warning">{pendingCr} flagged</span>
                      ) : (
                        <span className="opacity-50">0</span>
                      )}
                    </td>
                    {isInternal ? (
                      <td>
                        <StatusBadge status={marginBand(margin)} />
                        <span className="sr-only">
                          budget {budget} actual {actual}
                        </span>
                      </td>
                    ) : null}
                    <td>{p.target_completion_date ? <DateText value={p.target_completion_date} /> : "—"}</td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          <div className="space-y-4 xl:col-span-2">
            {selectedProject ? (
              <>
                <div className="rounded-box border border-base-300 bg-base-100 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedProject.name}</h2>
                      <p className="text-sm opacity-70">{customerName.get(selectedProject.customer_id) ?? "—"}</p>
                    </div>
                    <Link href={`/projects/${selectedProject.id}`} className="btn btn-sm btn-outline">
                      Full Detail
                    </Link>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <StatusBadge status={selectedProject.status} />
                    {selectedProject.customer_approval_status ? (
                      <StatusBadge status={selectedProject.customer_approval_status} />
                    ) : null}
                    {selectedContract ? <span className="badge badge-ghost">{selectedContract.contract_number}</span> : null}
                  </div>
                  {selectedProject.description ? (
                    <p className="mb-2 text-sm leading-relaxed opacity-80">{selectedProject.description}</p>
                  ) : (
                    <p className="mb-2 text-sm opacity-60">No description provided.</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide opacity-60">Est. Billing</p>
                      <p className="font-semibold">
                        <Money
                          value={
                            Number(selectedProject.fixed_fee ?? 0) ||
                            Number(selectedProject.estimated_billing_amount ?? 0)
                          }
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide opacity-60">Billed / Collected</p>
                      <p className="font-semibold">
                        <Money value={Number(selectedProject.amount_billed ?? 0)} /> /{" "}
                        <Money value={Number(selectedProject.amount_collected ?? 0)} />
                      </p>
                    </div>
                  </div>
                </div>

                <ProjectProgressCard
                  status={selectedProject.status}
                  startDate={selectedProject.start_date}
                  targetCompletionDate={selectedProject.target_completion_date}
                  projectManagerName={
                    selectedProject.project_manager_id
                      ? managerName.get(selectedProject.project_manager_id) ?? null
                      : null
                  }
                  milestones={selectedMilestones.map((m) => ({
                    id: m.id,
                    name: m.name,
                    completed: m.completed,
                    approval_status: m.approval_status,
                    due_date: m.due_date,
                  }))}
                  contract={selectedContract}
                  laborHours={hoursByProject.get(selectedProject.id) ?? 0}
                  materialsCost={materialsByProject.get(selectedProject.id) ?? 0}
                  pendingChangeRequests={pendingCrByProject.get(selectedProject.id) ?? 0}
                  pendingRequestedHours={selectedChangeRequests
                    .filter((r) => r.approval_status === "pending")
                    .reduce((sum, r) => sum + Number(r.estimated_hours ?? 0), 0)}
                  pendingRequestedPrice={selectedChangeRequests
                    .filter((r) => r.approval_status === "pending")
                    .reduce((sum, r) => sum + Number(r.estimated_amount ?? 0), 0)}
                />

                <ProjectActions
                  projectId={selectedProject.id}
                  projectName={selectedProject.name}
                  customerId={selectedProject.customer_id}
                  contractId={selectedProject.contract_id}
                  contractOptions={customerContracts}
                  status={selectedProject.status as ProjectStatus}
                  customerApprovalStatus={selectedProject.customer_approval_status}
                  currentUserId={profile.id}
                  role={profile.role}
                  milestones={selectedMilestones.map((m) => ({
                    id: m.id,
                    name: m.name,
                    completed: m.completed,
                    approval_status: m.approval_status,
                  }))}
                />

                <div>
                  <h2 className="mb-2 text-sm font-semibold">Out of Scope & Change Requests</h2>
                  <ProjectChangeRequestPanel
                    requests={selectedChangeRequests}
                    requesterNames={requesterNames}
                    projectNames={projectNamesForPanel}
                    contractLabels={contractLabels}
                    role={profile.role}
                    currentUserId={profile.id}
                  />
                </div>
              </>
            ) : (
              <EmptyState title="Select a project" description="Choose a row to review detail, approvals, and change requests." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
