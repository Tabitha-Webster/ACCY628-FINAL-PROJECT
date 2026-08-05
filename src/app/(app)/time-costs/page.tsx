import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, Hours, DateText } from "@/components/ui";
import { TimeCostForm } from "@/components/TimeCostForm";
import { LARGE_COST_THRESHOLD } from "@/lib/time-cost-config";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function TimeCostsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "technician" && !isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const isManager = profile.role === "manager";

  const [customersRes, contractsRes, ticketsRes, projectsRes, myTimeRes, myCostsRes, pendingCostsRes, pendingTimeRes] =
    await Promise.all([
      supabase.from("customers").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("contracts")
        .select("id, name, contract_number, customer_id, additional_hourly_rate")
        .eq("status", "active"),
      supabase
        .from("support_tickets")
        .select("id, ticket_number, title, customer_id")
        .not("status", "in", "(resolved,closed,canceled)"),
      supabase.from("projects").select("id, name, customer_id").not("status", "in", "(closed,canceled)"),
      supabase
        .from("time_entries")
        .select(
          "id, customer_id, work_date, hours_worked, classification, labor_cost, approval_status, billing_status, description, unusual_hours_flag"
        )
        .eq("technician_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("direct_costs")
        .select(
          "id, customer_id, cost_date, cost_category, internal_cost, billable_amount, approval_status, billing_status, description, entered_after_invoice, late_entry_flag, approval_threshold_required"
        )
        .eq("entered_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      isManager
        ? supabase
            .from("direct_costs")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending")
        : Promise.resolve({ data: null, error: null, count: 0 }),
      isManager
        ? supabase
            .from("time_entries")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending")
        : Promise.resolve({ data: null, error: null, count: 0 }),
    ]);

  const customers = customersRes.data ?? [];
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const contracts = (contractsRes.data ?? []).map((c) => ({
    id: c.id,
    customerId: c.customer_id,
    label: `${c.contract_number} · ${c.name}`,
    additionalHourlyRate: Number(c.additional_hourly_rate),
  }));
  const tickets = (ticketsRes.data ?? []).map((t) => ({
    id: t.id,
    customerId: t.customer_id,
    label: `${t.ticket_number} · ${t.title}`,
  }));
  const projects = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    customerId: p.customer_id,
    label: p.name,
  }));
  const pendingCostCount = pendingCostsRes.count ?? 0;
  const pendingTimeCount = pendingTimeRes.count ?? 0;

  return (
    <div>
      <PageHeader
        title="Submit Time and Costs"
        description={`Log billable and included hours, plus direct costs. Daily hours over 8 are flagged; costs ${formatCurrency(LARGE_COST_THRESHOLD)}+, late entries, and after-invoice costs need manager then billing approval.`}
      />

      <TimeCostForm
        technicianId={profile.id}
        internalCostRate={Number(profile.internal_cost_rate ?? 65)}
        customers={customers}
        contracts={contracts}
        tickets={tickets}
        projects={projects}
      />

      {isManager ? (
        <div className="mt-6 rounded-box border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Manager approvals</h2>
              <p className="text-sm opacity-70">
                {pendingTimeCount} time · {pendingCostCount} cost
                {pendingTimeCount + pendingCostCount === 1 ? "" : "s"} waiting — open the approvals queue to review
                technician submissions.
              </p>
            </div>
            <Link href="/time-cost-approvals" className="btn btn-primary btn-sm">
              Approve Time &amp; Costs
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">My Recent Time Entries</h2>
          {(myTimeRes.data ?? []).length === 0 ? (
            <EmptyState title="No time logged yet" description="Entries you submit will show up here." />
          ) : (
            <DataTable headers={["Date", "Customer", "Hours", "Cost", "Type", "Flags", "Approval"]}>
              {(myTimeRes.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td>
                    <DateText value={e.work_date} />
                  </td>
                  <td>{customerName.get(e.customer_id) ?? "—"}</td>
                  <td>
                    <Hours value={Number(e.hours_worked)} />
                  </td>
                  <td>
                    <Money value={Number(e.labor_cost ?? 0)} />
                  </td>
                  <td>
                    <StatusBadge status={e.classification} />
                  </td>
                  <td>
                    {e.unusual_hours_flag ? (
                      <span className="badge badge-warning badge-sm">Unusual hours</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <StatusBadge status={e.approval_status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">My Recent Direct Costs</h2>
          {(myCostsRes.data ?? []).length === 0 ? (
            <EmptyState title="No costs logged yet" description="Direct costs you submit will show up here." />
          ) : (
            <DataTable headers={["Date", "Customer", "Category", "Cost", "Billable", "Flags", "Approval"]}>
              {(myCostsRes.data ?? []).map((c) => (
                <tr key={c.id}>
                  <td>
                    <DateText value={c.cost_date} />
                  </td>
                  <td>{customerName.get(c.customer_id) ?? "—"}</td>
                  <td>
                    <StatusBadge status={c.cost_category} />
                  </td>
                  <td>
                    <Money value={Number(c.internal_cost)} />
                  </td>
                  <td>
                    <Money value={Number(c.billable_amount)} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {c.approval_threshold_required ? (
                        <span className="badge badge-warning badge-sm">Large cost</span>
                      ) : null}
                      {c.late_entry_flag ? (
                        <span className="badge badge-warning badge-sm">Late entry</span>
                      ) : null}
                      {c.entered_after_invoice ? (
                        <span className="badge badge-info badge-sm">After invoice</span>
                      ) : null}
                      {!c.approval_threshold_required && !c.late_entry_flag && !c.entered_after_invoice
                        ? "—"
                        : null}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={c.approval_status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
}
