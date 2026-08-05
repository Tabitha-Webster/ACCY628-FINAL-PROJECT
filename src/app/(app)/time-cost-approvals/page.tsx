import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  Hours,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { CostApprovalActions } from "@/components/CostApprovalActions";
import { TimeApprovalActions } from "@/components/TimeApprovalActions";

export default async function TimeCostApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: pendingTime, error: timeError },
    { data: pendingCosts, error: costError },
    { data: customers },
    { data: technicians },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select(
        "id, technician_id, customer_id, work_date, hours_worked, classification, labor_cost, description, unusual_hours_flag, created_at"
      )
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("direct_costs")
      .select(
        "id, entered_by, customer_id, cost_date, cost_category, internal_cost, billable_amount, description, late_entry_flag, approval_threshold_required, entered_after_invoice, created_at"
      )
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("customers").select("id, name"),
    supabase.from("profiles").select("id, full_name").eq("role", "technician"),
  ]);

  const error = timeError || costError;
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const techName = new Map((technicians ?? []).map((t) => [t.id, t.full_name]));
  const timeRows = pendingTime ?? [];
  const costRows = pendingCosts ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approve Time & Costs"
        description="Review pending time entries and large or flagged costs. Approving a cost sends it to billing for final approval before it can be invoiced."
        actions={
          <Link href="/time-costs" className="btn btn-outline btn-sm">
            Submit time/costs
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">Pending time</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{timeRows.length}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">Costs needing manager review</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{costRows.length}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending time entries</h2>
        {timeRows.length === 0 ? (
          <EmptyState
            title="No time waiting for approval"
            description="Billable or out-of-scope time submitted by technicians will appear here."
          />
        ) : (
          <DataTable
            headers={["Date", "Technician", "Customer", "Hours", "Labor cost", "Type", "Flags", "Actions"]}
          >
            {timeRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <DateText value={row.work_date} />
                </td>
                <td>{techName.get(row.technician_id) ?? "—"}</td>
                <td>{customerName.get(row.customer_id) ?? "—"}</td>
                <td>
                  <Hours value={Number(row.hours_worked)} />
                </td>
                <td>
                  <Money value={Number(row.labor_cost ?? 0)} />
                </td>
                <td>
                  <StatusBadge status={row.classification} />
                </td>
                <td>
                  {row.unusual_hours_flag ? (
                    <span className="badge badge-warning badge-sm">Unusual hours</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <TimeApprovalActions entryId={row.id} reviewerId={profile.id} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Large / flagged costs</h2>
        {costRows.length === 0 ? (
          <EmptyState
            title="No costs waiting for manager review"
            description="Only large, late, or after-invoice costs appear here. Routine costs are approved automatically for billing."
          />
        ) : (
          <DataTable
            headers={["Date", "Entered by", "Customer", "Category", "Cost", "Billable", "Flags", "Actions"]}
          >
            {costRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <DateText value={row.cost_date} />
                </td>
                <td>{(row.entered_by && techName.get(row.entered_by)) || "—"}</td>
                <td>{customerName.get(row.customer_id) ?? "—"}</td>
                <td>
                  <StatusBadge status={row.cost_category} />
                </td>
                <td>
                  <Money value={Number(row.internal_cost)} />
                </td>
                <td>
                  <Money value={Number(row.billable_amount)} />
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {row.approval_threshold_required ? (
                      <span className="badge badge-warning badge-sm">Large cost</span>
                    ) : null}
                    {row.late_entry_flag ? (
                      <span className="badge badge-warning badge-sm">Late entry</span>
                    ) : null}
                    {row.entered_after_invoice ? (
                      <span className="badge badge-info badge-sm">After invoice</span>
                    ) : null}
                    {!row.approval_threshold_required &&
                    !row.late_entry_flag &&
                    !row.entered_after_invoice
                      ? "—"
                      : null}
                  </div>
                </td>
                <td>
                  <CostApprovalActions costId={row.id} reviewerId={profile.id} stage="manager" />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
