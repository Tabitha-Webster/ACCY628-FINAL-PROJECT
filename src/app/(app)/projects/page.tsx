import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, StatusBadge, Money, DateText, ErrorState } from "@/components/ui";
import { grossMarginPct, marginBand } from "@/lib/calculations";
import type { ApprovalStatus, Project, ProjectMilestone, ProjectStatus } from "@/lib/types";
import { ProjectActions, ProjectChangeRequestPanel } from "@/components/ProjectActions";
import { projectCompletionPercent } from "@/components/ProjectProgressCard";
import { ProjectsHomeVisuals } from "@/components/ProjectsHomeVisuals";
import { ProjectSelectDropdown } from "@/components/ProjectSelectDropdown";

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
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {profile.role === "technician" ? "Project Tasks" : "Projects"}
        </h1>
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rowsAll = (projects ?? []) as ProjectRow[];

  let assignedProjectIds: Set<string> | null = null;
  if (profile.role === "technician") {
    const { data: assignments } = await supabase
      .from("technician_assignments")
      .select("project_id")
      .eq("technician_id", profile.id)
      .not("project_id", "is", null);
    assignedProjectIds = new Set(
      (assignments ?? []).map((a) => a.project_id).filter((id): id is string => Boolean(id))
    );
  }

  const rows =
    assignedProjectIds != null ? rowsAll.filter((p) => assignedProjectIds!.has(p.id)) : rowsAll;
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
  const proposedCount = rows.filter((p) => p.status === "proposed").length;
  const completedCount = rows.filter((p) =>
    ["completed", "billed", "closed"].includes(p.status)
  ).length;

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
    customer_approval_status?: string | null;
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
          "id, title, description, estimated_hours, estimated_amount, approval_status, customer_approval_status, created_at, requested_by, project_id, contract_id"
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

  return (
    <ProjectsHomeVisuals
      title={profile.role === "technician" ? "Project Tasks" : "Projects"}
      subtitle={
        profile.role === "technician"
          ? "Your assigned projects — progress, out-of-scope flags, and actions."
          : "Track delivery progress, approvals, change requests, time, and materials."
      }
      metrics={[
        { label: "Projects", value: String(rows.length), tone: "sky" },
        { label: "In progress", value: String(inProgress), tone: "violet" },
        {
          label: "Awaiting approval",
          value: String(awaitingApproval),
          tone: awaitingApproval > 0 ? "amber" : "emerald",
          hint: "Customer or scope pending",
        },
        {
          label: "Out of scope",
          value: String(pendingChangeRequests),
          tone: pendingChangeRequests > 0 ? "rose" : "emerald",
          hint: "Pending manager approval",
        },
      ]}
      statusCounts={{
        proposed: proposedCount,
        inProgress,
        awaiting: awaitingApproval,
        completed: completedCount,
      }}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={profile.role === "technician" ? "No assigned projects" : "No projects yet"}
          description={
            profile.role === "technician"
              ? "When a manager assigns you to a project, it will show up here."
              : "Projects created for customers will appear here."
          }
        />
      ) : (
        <div className="space-y-3">
          <section className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <ProjectSelectDropdown
                label={profile.role === "technician" ? "Choose an assigned project" : "Choose a project to view"}
                selectedId={selectedId ?? null}
                projects={rows.map((p) => ({
                  id: p.id,
                  name: p.name,
                  customerName: customerName.get(p.customer_id) ?? "—",
                  status: p.status,
                }))}
              />
              {selectedProject ? (
                <Link href={`/projects/${selectedProject.id}`} className="btn btn-outline btn-sm">
                  Open full detail page
                </Link>
              ) : null}
            </div>

            {selectedProject ? (
              (() => {
                const budget =
                  Number(selectedProject.labor_budget ?? 0) +
                  Number(selectedProject.equipment_budget ?? 0) +
                  Number(selectedProject.software_budget ?? 0) +
                  Number(selectedProject.vendor_budget ?? 0);
                const actual = actualByProject.get(selectedProject.id) ?? 0;
                const revenue =
                  Number(selectedProject.fixed_fee ?? 0) ||
                  Number(selectedProject.estimated_billing_amount ?? 0);
                const margin = grossMarginPct(revenue, actual);
                const pendingCr = pendingCrByProject.get(selectedProject.id) ?? 0;
                const needsApproval =
                  selectedProject.status === "awaiting_customer_approval" ||
                  selectedProject.customer_approval_status === "pending";
                const ms = milestonesByProject.get(selectedProject.id) ?? [];
                const done = ms.filter((m) => m.completed).length;
                const pct = projectCompletionPercent(selectedProject.status, done, ms.length);

                return (
                  <div className="mt-4 rounded-xl border border-base-300 bg-base-200/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-base-content">{selectedProject.name}</h2>
                        <p className="mt-1 text-sm text-base-content/80">
                          {customerName.get(selectedProject.customer_id) ?? "—"}
                          {" · "}
                          PM:{" "}
                          {selectedProject.project_manager_id
                            ? managerName.get(selectedProject.project_manager_id) ?? "—"
                            : "Unassigned"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={selectedProject.status} />
                        {needsApproval ? <StatusBadge status="pending" /> : null}
                        {pendingCr > 0 ? (
                          <span className="badge badge-warning badge-sm">{pendingCr} OOS</span>
                        ) : null}
                        {isInternal ? <StatusBadge status={marginBand(margin)} /> : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex justify-between gap-2 text-xs font-medium text-base-content/80">
                        <span>Completion</span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-base-300">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Project ${pct}% complete`}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="text-sm text-base-content/90">
                        <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                          Target
                        </span>
                        <p className="font-medium">
                          {selectedProject.target_completion_date ? (
                            <DateText value={selectedProject.target_completion_date} />
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                      {isInternal ? (
                        <div className="text-sm text-base-content/90">
                          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                            Cost vs budget
                          </span>
                          <p className="font-medium tabular-nums">
                            <Money value={actual} /> / <Money value={budget} />
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()
            ) : null}
          </section>

          {selectedProject ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-base-content">
                        {selectedProject.name}
                      </h2>
                      <p className="text-sm text-base-content/80">
                        {customerName.get(selectedProject.customer_id) ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selectedProject.status} />
                      {selectedProject.customer_approval_status ? (
                        <StatusBadge status={selectedProject.customer_approval_status} />
                      ) : null}
                      {selectedContract ? (
                        <span className="badge badge-outline">{selectedContract.contract_number}</span>
                      ) : null}
                    </div>
                  </div>
                  {selectedProject.description ? (
                    <p className="mb-3 text-sm leading-relaxed text-base-content/90">
                      {selectedProject.description}
                    </p>
                  ) : (
                    <p className="mb-3 text-sm text-base-content/60">No description provided.</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-base-300 bg-base-200/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                        Est. Billing
                      </p>
                      <p className="font-semibold tabular-nums text-base-content">
                        <Money
                          value={
                            Number(selectedProject.fixed_fee ?? 0) ||
                            Number(selectedProject.estimated_billing_amount ?? 0)
                          }
                        />
                      </p>
                    </div>
                    <div className="rounded-xl border border-base-300 bg-base-200/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                        Billed / Collected
                      </p>
                      <p className="font-semibold tabular-nums text-base-content">
                        <Money value={Number(selectedProject.amount_billed ?? 0)} /> /{" "}
                        <Money value={Number(selectedProject.amount_collected ?? 0)} />
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
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
                </div>

                <div className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/70">
                    Out of Scope & Change Requests
                  </h2>
                  <ProjectChangeRequestPanel
                    requests={selectedChangeRequests}
                    requesterNames={requesterNames}
                    projectNames={projectNamesForPanel}
                    contractLabels={contractLabels}
                    role={profile.role}
                    currentUserId={profile.id}
                  />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Select a project"
              description="Use the dropdown above to review detail, approvals, and change requests."
            />
          )}
        </div>
      )}
    </ProjectsHomeVisuals>
  );
}
