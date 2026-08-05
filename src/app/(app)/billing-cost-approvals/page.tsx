import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { CostApprovalActions } from "@/components/CostApprovalActions";

export default async function BillingCostApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "billing" && profile.role !== "manager") redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: awaitingCosts, error }, { data: customers }, { data: technicians }] = await Promise.all([
    supabase
      .from("direct_costs")
      .select(
        "id, entered_by, customer_id, cost_date, cost_category, internal_cost, billable_amount, description, late_entry_flag, approval_threshold_required, entered_after_invoice, created_at"
      )
      .eq("approval_status", "awaiting_billing")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("customers").select("id, name"),
    supabase.from("profiles").select("id, full_name").eq("role", "technician"),
  ]);

  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const techName = new Map((technicians ?? []).map((t) => [t.id, t.full_name]));
  const costRows = awaitingCosts ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approve Costs (Billing)"
        description="Final approval for costs that a manager already reviewed. Once you approve, the cost is ready to bill."
        actions={
          <Link href="/billing-review" className="btn btn-outline btn-sm">
            Billing review
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="rounded-box border border-base-300 bg-base-100 p-4 sm:w-72">
        <p className="text-xs font-medium uppercase tracking-wide opacity-60">Awaiting billing approval</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{costRows.length}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Costs ready for final approval</h2>
        {costRows.length === 0 ? (
          <EmptyState
            title="Nothing waiting for billing"
            description="After a manager sends a large or flagged cost forward, it will appear here for final approval."
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
                    {!row.approval_threshold_required && !row.late_entry_flag && !row.entered_after_invoice
                      ? "—"
                      : null}
                  </div>
                </td>
                <td>
                  <CostApprovalActions costId={row.id} reviewerId={profile.id} stage="billing" />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
