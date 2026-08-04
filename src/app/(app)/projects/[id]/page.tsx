import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import { grossMarginPct, marginBand } from "@/lib/calculations";
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

  const [customerRes, contractRes, milestonesRes, timeRes, costsRes] = await Promise.all([
    supabase.from("customers").select("id, name").eq("id", p.customer_id).maybeSingle(),
    p.contract_id ? supabase.from("contracts").select("id, name, contract_number").eq("id", p.contract_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("project_milestones").select("*").eq("project_id", p.id).order("due_date", { ascending: true }),
    supabase.from("time_entries").select("hours_worked, labor_cost").eq("project_id", p.id),
    supabase.from("direct_costs").select("cost_category, internal_cost, billable_amount").eq("project_id", p.id),
  ]);

  const milestones = (milestonesRes.data ?? []) as ProjectMilestone[];
  const timeEntries = timeRes.data ?? [];
  const directCosts = costsRes.data ?? [];

  const laborActual = timeEntries.reduce((sum, t) => sum + Number(t.labor_cost ?? 0), 0);
  const laborHours = timeEntries.reduce((sum, t) => sum + Number(t.hours_worked), 0);
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
  const isInternal = profile.role === "manager" || profile.role === "billing";

  const completedMilestoneAmount = milestones.filter((m) => m.completed).reduce((sum, m) => sum + Number(m.amount), 0);
  const totalMilestoneAmount = milestones.reduce((sum, m) => sum + Number(m.amount), 0);

  return (
    <div>
      <PageHeader
        title={p.name}
        description={customerRes.data?.name ?? undefined}
        actions={
          <Link href={profile.role === "customer" ? "/my-projects" : "/projects"} className="btn btn-sm btn-outline">
            Back to Projects
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={p.status} />
        {p.customer_approval_status ? <StatusBadge status={p.customer_approval_status} /> : null}
        {contractRes.data ? <span className="badge badge-ghost">{contractRes.data.contract_number}</span> : null}
      </div>

      {p.description ? <p className="mb-6 max-w-3xl text-sm leading-relaxed opacity-80">{p.description}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>

      {isInternal ? (
        <div className="mt-6">
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
            Gross margin: <StatusBadge status={marginBand(grossMarginPct(revenue, totalActual))} /> ({grossMarginPct(revenue, totalActual).toFixed(1)}%)
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">
          Milestones {totalMilestoneAmount > 0 ? <span className="opacity-60">({<Money value={completedMilestoneAmount} />} of {<Money value={totalMilestoneAmount} />} billed)</span> : null}
        </h2>
        {milestones.length === 0 ? (
          <EmptyState title="No milestones defined" description="This project bills as a whole rather than by milestone." />
        ) : (
          <DataTable headers={["Milestone", "Amount", "Due", "Status", "Billing"]}>
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
                <td>{m.billing_status ? <StatusBadge status={m.billing_status} /> : "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
