import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canUseBillingTools } from "@/lib/constants";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import { grossMarginPct, marginBand } from "@/lib/calculations";
import { ProjectActions, ProjectChangeRequestPanel } from "@/components/ProjectActions";
import { ProjectProgressCard } from "@/components/ProjectProgressCard";
import type { Project, ProjectMilestone } from "@/lib/types";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();

  if (error) {
    return (
      <div>
        <PageHeader title="Project" />
        <ErrorState message={error.message} />
      </div>
    );
  }
  if (!project) {
    return (
      <div>
        <PageHeader title="Project" />
        <EmptyState title="Project not found" description="It may have been removed, or you may not have access to it." />
      </div>
    );
  }
  const p = project as Project;

  if (profile.role === "customer" && profile.customer_id && p.customer_id !== profile.customer_id) {
    return (
      <div>
        <PageHeader title="Project" />
        <EmptyState title="Project not found" description="You may not have access to this project." />
      </div>
    );
  }

  const [customerRes, contractRes, milestonesRes, timeRes, costsRes, changeRes, assignmentsRes, customerContractsRes] =
    await Promise.all([
    supabase.from("customers").select("id, name").eq("id", p.customer_id).maybeSingle(),
    p.contract_id
      ? supabase
          .from("contracts")
          .select(
            "id, name, contract_number, contract_type, included_hours_per_month, additional_hourly_rate, change_request_procedure"
          )
          .eq("id", p.contract_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("project_milestones").select("*").eq("project_id", p.id).order("due_date", { ascending: true }),
    supabase
      .from("time_entries")
      .select(
        "id, technician_id, work_date, hours_worked, classification, description, labor_cost, approval_status, billing_status, work_category"
      )
      .eq("project_id", p.id)
      .order("work_date", { ascending: false }),
    supabase.from("direct_costs").select("cost_category, internal_cost, billable_amount").eq("project_id", p.id),
    supabase
      .from("additional_work_requests")
      .select(
        "id, title, description, estimated_hours, estimated_amount, approval_status, customer_approval_status, created_at, requested_by, reviewed_by, reviewed_at, project_id, contract_id"
      )
      .eq("project_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("technician_assignments")
      .select("id, technician_id, assigned_at, due_at, notes")
      .eq("project_id", p.id)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, name, contract_number")
      .eq("customer_id", p.customer_id)
      .order("created_at", { ascending: false }),
  ]);

  const milestones = (milestonesRes.data ?? []) as ProjectMilestone[];
  const timeEntries = timeRes.data ?? [];
  const directCosts = costsRes.data ?? [];
  const changeRequests = changeRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const customerContracts = (customerContractsRes.data ?? []).map((c) => ({
    id: c.id,
    label: `${c.contract_number} · ${c.name}`,
  }));
  const contractLabels = Object.fromEntries(customerContracts.map((c) => [c.id, c.label]));
  if (contractRes.data) {
    contractLabels[contractRes.data.id] = `${contractRes.data.contract_number} · ${contractRes.data.name}`;
  }

  const requesterIds = Array.from(
    new Set([
      ...changeRequests.map((r) => r.requested_by),
      ...changeRequests.map((r) => r.reviewed_by).filter((id): id is string => Boolean(id)),
      ...(p.customer_approved_by ? [p.customer_approved_by] : []),
    ])
  );
  const technicianIds = Array.from(
    new Set([
      ...assignments.map((a) => a.technician_id),
      ...timeEntries.map((t) => t.technician_id).filter((id): id is string => Boolean(id)),
    ])
  );
  const profileIds = Array.from(
    new Set([...requesterIds, ...technicianIds, p.project_manager_id].filter(Boolean))
  ) as string[];
  const profilesRes = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] as { id: string; full_name: string }[] };
  const profileName = new Map((profilesRes.data ?? []).map((u) => [u.id, u.full_name]));
  const requesterNames = Object.fromEntries(
    Array.from(new Set([...requesterIds, ...Array.from(profileName.keys())])).map((id) => [
      id,
      profileName.get(id) ?? "—",
    ])
  );

  const laborActual = timeEntries.reduce((sum, t) => sum + Number(t.labor_cost ?? 0), 0);
  const laborHours = timeEntries.reduce((sum, t) => sum + Number(t.hours_worked), 0);
  const materialsCost = directCosts.reduce((sum, c) => sum + Number(c.internal_cost), 0);
  const costsByCategory = (category: string) =>
    directCosts.filter((c) => c.cost_category === category).reduce((sum, c) => sum + Number(c.internal_cost), 0);
  const equipmentActual = costsByCategory("equipment");
  const softwareActual = costsByCategory("software");
  const vendorActual = costsByCategory("vendor");
  const otherActual = directCosts
    .filter((c) => !["equipment", "software", "vendor"].includes(c.cost_category))
    .reduce((sum, c) => sum + Number(c.internal_cost), 0);

  const budgetRows = [
    { label: "Labor", budget: Number(p.labor_budget ?? 0), actual: laborActual },
    { label: "Equipment", budget: Number(p.equipment_budget ?? 0), actual: equipmentActual },
    { label: "Software", budget: Number(p.software_budget ?? 0), actual: softwareActual },
    { label: "Vendor / Other", budget: Number(p.vendor_budget ?? 0), actual: vendorActual + otherActual },
  ];
  const totalBudget = budgetRows.reduce((sum, r) => sum + r.budget, 0);
  const totalActual = budgetRows.reduce((sum, r) => sum + r.actual, 0);
  const revenue = Number(p.fixed_fee ?? 0) || Number(p.estimated_billing_amount ?? 0);
  const isInternal = canUseBillingTools(profile.role);

  const completedMilestoneAmount = milestones.filter((m) => m.completed).reduce((sum, m) => sum + Number(m.amount), 0);
  const totalMilestoneAmount = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
  const pendingChangeCount = changeRequests.filter(
    (r) => r.approval_status === "pending" || r.customer_approval_status === "pending"
  ).length;

  const backHref = profile.role === "customer" ? "/my-projects" : "/projects";

  return (
    <div>
      <PageHeader
        title={p.name}
        description={customerRes.data?.name ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={profile.role === "customer" ? backHref : `${backHref}?selected=${p.id}`}
              className="btn btn-sm btn-outline"
            >
              Back to Projects
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} />
              {p.customer_approval_status ? <StatusBadge status={p.customer_approval_status} /> : null}
              {contractRes.data ? (
                <Link href={`/contracts/${contractRes.data.id}`} className="badge badge-ghost">
                  {contractRes.data.contract_number}
                </Link>
              ) : null}
              {pendingChangeCount > 0 ? (
                <span className="badge badge-warning">{pendingChangeCount} out-of-scope / CR pending</span>
              ) : null}
            </div>
            {p.customer_approved_at ? (
              <p className="mb-3 text-xs opacity-70">
                Customer approval recorded
                {p.customer_approved_by ? ` by ${profileName.get(p.customer_approved_by) ?? "user"}` : ""} on{" "}
                <DateText value={p.customer_approved_at} />
              </p>
            ) : null}
            {p.description ? <p className="text-sm leading-relaxed opacity-80">{p.description}</p> : <p className="text-sm opacity-60">No description provided.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <p className="text-xs uppercase tracking-wide opacity-60">Fixed Fee / Est. Billing</p>
              <p className="mt-1 text-xl font-semibold">
                <Money value={revenue} />
              </p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <p className="text-xs uppercase tracking-wide opacity-60">Amount Billed</p>
              <p className="mt-1 text-xl font-semibold">
                <Money value={Number(p.amount_billed ?? 0)} />
              </p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <p className="text-xs uppercase tracking-wide opacity-60">Amount Collected</p>
              <p className="mt-1 text-xl font-semibold">
                <Money value={Number(p.amount_collected ?? 0)} />
              </p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <p className="text-xs uppercase tracking-wide opacity-60">Hours Logged</p>
              <p className="mt-1 text-xl font-semibold">
                <Hours value={laborHours} />
              </p>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <p className="text-xs uppercase tracking-wide opacity-60">Materials / Direct Costs</p>
              <p className="mt-1 text-xl font-semibold">
                <Money value={materialsCost} />
              </p>
            </div>
          </div>

          {isInternal ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Budget vs. Actual</h2>
              <DataTable headers={["Category", "Budget", "Actual", "Variance"]}>
                {budgetRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      <Money value={row.budget} />
                    </td>
                    <td>
                      <Money value={row.actual} />
                    </td>
                    <td className={row.budget - row.actual < 0 ? "text-error" : "text-success"}>
                      <Money value={row.budget - row.actual} />
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>Total</td>
                  <td>
                    <Money value={totalBudget} />
                  </td>
                  <td>
                    <Money value={totalActual} />
                  </td>
                  <td className={totalBudget - totalActual < 0 ? "text-error" : "text-success"}>
                    <Money value={totalBudget - totalActual} />
                  </td>
                </tr>
              </DataTable>
              <p className="mt-2 text-xs opacity-60">
                Gross margin: <StatusBadge status={marginBand(grossMarginPct(revenue, totalActual))} /> (
                {grossMarginPct(revenue, totalActual).toFixed(1)}%)
              </p>
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-sm font-semibold">
              Milestones{" "}
              {totalMilestoneAmount > 0 ? (
                <span className="opacity-60">
                  (
                  <Money value={completedMilestoneAmount} /> of <Money value={totalMilestoneAmount} /> billed)
                </span>
              ) : null}
            </h2>
            {milestones.length === 0 ? (
              <EmptyState title="No milestones defined" description="This project bills as a whole rather than by milestone." />
            ) : (
              <DataTable headers={["Milestone", "Amount", "Due", "Status", "Approval", "Billing"]}>
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>
                      <Money value={Number(m.amount)} />
                    </td>
                    <td>{m.due_date ? <DateText value={m.due_date} /> : "—"}</td>
                    <td>
                      <StatusBadge status={m.completed ? "completed" : "in_progress"} />
                    </td>
                    <td>{m.approval_status ? <StatusBadge status={m.approval_status} /> : "—"}</td>
                    <td>{m.billing_status ? <StatusBadge status={m.billing_status} /> : "—"}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          {assignments.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Technician Assignments</h2>
              <DataTable headers={["Technician", "Assigned", "Due", "Notes"]}>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{profileName.get(a.technician_id) ?? "—"}</td>
                    <td>
                      <DateText value={a.assigned_at} />
                    </td>
                    <td>{a.due_at ? <DateText value={a.due_at} /> : "—"}</td>
                    <td className="max-w-xs truncate">{a.notes ?? "—"}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : null}

          {isInternal ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Technician time entries</h2>
              {timeEntries.length === 0 ? (
                <EmptyState
                  title="No time entries yet"
                  description="When technicians submit hours for this project, they will appear here."
                />
              ) : (
                <DataTable
                  headers={[
                    "Technician",
                    "Work date",
                    "Hours",
                    "Classification",
                    "Category",
                    "Labor cost",
                    "Approval",
                    "Billing",
                    "Description",
                  ]}
                >
                  {timeEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap font-medium">
                        {profileName.get(entry.technician_id) ?? "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        <DateText value={entry.work_date} />
                      </td>
                      <td className="tabular-nums">
                        <Hours value={Number(entry.hours_worked)} />
                      </td>
                      <td>
                        <StatusBadge status={entry.classification} />
                      </td>
                      <td className="max-w-[8rem] truncate text-sm">
                        {entry.work_category ?? "—"}
                      </td>
                      <td className="tabular-nums">
                        <Money value={Number(entry.labor_cost ?? 0)} />
                      </td>
                      <td>
                        <StatusBadge status={entry.approval_status} />
                      </td>
                      <td>
                        {entry.billing_status ? (
                          <StatusBadge status={entry.billing_status} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-xs truncate text-sm" title={entry.description}>
                        {entry.description || "—"}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 self-start lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <ProjectChangeRequestPanel
              requests={changeRequests}
              requesterNames={requesterNames}
              projectNames={{ [p.id]: p.name }}
              contractLabels={contractLabels}
              role={profile.role}
              currentUserId={profile.id}
            />
            <ProjectActions
              projectId={p.id}
              projectName={p.name}
              customerId={p.customer_id}
              contractId={p.contract_id}
              contractOptions={customerContracts}
              status={p.status}
              customerApprovalStatus={p.customer_approval_status}
              currentUserId={profile.id}
              role={profile.role}
              milestones={milestones.map((m) => ({
                id: m.id,
                name: m.name,
                completed: m.completed,
                approval_status: m.approval_status,
              }))}
            />
          </div>
          <ProjectProgressCard
            status={p.status}
            startDate={p.start_date}
            targetCompletionDate={p.target_completion_date}
            projectManagerName={p.project_manager_id ? profileName.get(p.project_manager_id) ?? null : null}
            milestones={milestones.map((m) => ({
              id: m.id,
              name: m.name,
              completed: m.completed,
              approval_status: m.approval_status,
              due_date: m.due_date,
            }))}
            contract={contractRes.data}
            laborHours={laborHours}
            materialsCost={materialsCost}
            pendingChangeRequests={pendingChangeCount}
            pendingRequestedHours={changeRequests
              .filter((r) => r.approval_status === "pending" || r.customer_approval_status === "pending")
              .reduce((sum, r) => sum + Number(r.estimated_hours ?? 0), 0)}
            pendingRequestedPrice={changeRequests
              .filter((r) => r.approval_status === "pending" || r.customer_approval_status === "pending")
              .reduce((sum, r) => sum + Number(r.estimated_amount ?? 0), 0)}
            showMilestoneList={false}
          />
        </div>
      </div>
    </div>
  );
}
