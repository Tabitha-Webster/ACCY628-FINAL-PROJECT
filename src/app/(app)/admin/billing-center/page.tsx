import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, DataTable, EmptyState, ErrorState, StatusBadge, Money, DateText } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";

export default async function AdminBillingCenterPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    readyTimeRes,
    readyCostRes,
    readyProjectRes,
    overdueRes,
    disputesRes,
    draftRes,
    arRes,
    recurringRes,
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("classification", "billable")
      .in("billing_status", ["unbilled", "ready"])
      .in("approval_status", ["approved", "not_required"]),
    supabase
      .from("direct_costs")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "approved")
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .in("status", ["completed", "approved"])
      .in("billing_status", ["unbilled", "ready"]),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_date, remaining_balance, status, total_amount, customers(name)")
      .or(`status.eq.overdue,and(due_date.lt.${today},remaining_balance.gt.0)`)
      .order("due_date", { ascending: true })
      .limit(25),
    supabase
      .from("disputes")
      .select("id, dispute_reason, disputed_amount, resolution_status, dispute_date, invoice_id, customers(name)")
      .in("resolution_status", ["open", "under_review"])
      .order("dispute_date", { ascending: false })
      .limit(20),
    supabase
      .from("invoices")
      .select("id, invoice_number, issue_date, total_amount, status, customers(name)")
      .eq("status", "draft")
      .order("issue_date", { ascending: false })
      .limit(15),
    supabase
      .from("invoices")
      .select("remaining_balance, status")
      .gt("remaining_balance", 0)
      .neq("status", "canceled"),
    supabase
      .from("contracts")
      .select("id, name, monthly_recurring_fee, customers(name)")
      .eq("status", "active")
      .gt("monthly_recurring_fee", 0),
  ]);

  const error =
    readyTimeRes.error ||
    readyCostRes.error ||
    readyProjectRes.error ||
    overdueRes.error ||
    disputesRes.error ||
    draftRes.error ||
    arRes.error ||
    recurringRes.error;

  if (error) {
    return (
      <div>
        <PageHeader title="Billing Control Center" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const readyCount =
    (readyTimeRes.count ?? 0) + (readyCostRes.count ?? 0) + (readyProjectRes.count ?? 0);
  const overdue = overdueRes.data ?? [];
  const disputes = disputesRes.data ?? [];
  const drafts = draftRes.data ?? [];
  const arTotal = (arRes.data ?? []).reduce((sum, inv) => sum + Number(inv.remaining_balance ?? 0), 0);

  const { data: billedRecurring } = await supabase
    .from("revenue_records")
    .select("contract_id")
    .eq("revenue_type", "recurring")
    .eq("period_month", periodMonth);
  const billedSet = new Set((billedRecurring ?? []).map((r) => r.contract_id));
  const unbilledFees = (recurringRes.data ?? []).filter((c) => !billedSet.has(c.id));

  const csvRows = overdue.map((inv) => {
    const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
    return [
      inv.invoice_number,
      customer?.name ?? "",
      inv.status,
      inv.due_date,
      inv.remaining_balance,
      inv.total_amount,
    ];
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing Control Center"
        description="Ready-to-bill volume, overdue AR, disputes, drafts, and monthly fees not yet recognized."
        actions={
          <div className="flex flex-wrap gap-2">
            <CsvExportButton
              filename="overdue-invoices"
              headers={["Invoice #", "Customer", "Status", "Due", "Remaining", "Total"]}
              rows={csvRows}
            />
            <Link href="/ready-to-bill" className="btn btn-sm btn-primary">
              Ready to bill
            </Link>
            <Link href="/admin" className="btn btn-sm btn-outline">
              Admin
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ready-to-bill items" value={String(readyCount)} tone={readyCount ? "warning" : "success"} />
        <StatCard label="Open AR" value={`$${arTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard label="Overdue invoices" value={String(overdue.length)} tone={overdue.length ? "error" : "success"} />
        <StatCard label="Open disputes" value={String(disputes.length)} tone={disputes.length ? "warning" : "success"} />
        <StatCard label="Draft invoices" value={String(drafts.length)} />
        <StatCard
          label="Unbilled monthly fees"
          value={String(unbilledFees.length)}
          hint={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          tone={unbilledFees.length ? "warning" : "success"}
        />
        <StatCard label="Ready time" value={String(readyTimeRes.count ?? 0)} />
        <StatCard label="Ready costs + projects" value={String((readyCostRes.count ?? 0) + (readyProjectRes.count ?? 0))} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/ready-to-bill" className="btn btn-sm btn-outline">
          Generate invoices
        </Link>
        <Link href="/invoices" className="btn btn-sm btn-outline">
          Invoices
        </Link>
        <Link href="/accounts-receivable" className="btn btn-sm btn-outline">
          Accounts receivable
        </Link>
        <Link href="/payments" className="btn btn-sm btn-outline">
          Record payments
        </Link>
        <Link href="/billing-collections" className="btn btn-sm btn-outline">
          Collections
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Overdue / past-due</h2>
        {overdue.length === 0 ? (
          <EmptyState title="No overdue invoices" />
        ) : (
          <DataTable headers={["Invoice", "Customer", "Due", "Remaining", "Status", ""]}>
            {overdue.map((inv) => {
              const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
              return (
                <tr key={inv.id}>
                  <td className="font-medium">{inv.invoice_number}</td>
                  <td>{customer?.name ?? "—"}</td>
                  <td>
                    <DateText value={inv.due_date} />
                  </td>
                  <td>
                    <Money value={Number(inv.remaining_balance ?? 0)} />
                  </td>
                  <td>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td>
                    <Link href={`/invoices/${inv.id}`} className="btn btn-ghost btn-xs">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Open disputes</h2>
        {disputes.length === 0 ? (
          <EmptyState title="No open disputes" />
        ) : (
          <DataTable headers={["Customer", "Reason", "Amount", "Status", "Date", ""]}>
            {disputes.map((d) => {
              const customer = Array.isArray(d.customers) ? d.customers[0] : d.customers;
              return (
                <tr key={d.id}>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="max-w-xs truncate text-sm">{d.dispute_reason}</td>
                  <td>
                    <Money value={Number(d.disputed_amount ?? 0)} />
                  </td>
                  <td>
                    <StatusBadge status={d.resolution_status} />
                  </td>
                  <td>
                    <DateText value={d.dispute_date} />
                  </td>
                  <td>
                    {d.invoice_id ? (
                      <Link href={`/invoices/${d.invoice_id}`} className="btn btn-ghost btn-xs">
                        Invoice
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>

      {unbilledFees.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
            Monthly fees not yet in revenue this period
          </h2>
          <ul className="space-y-2">
            {unbilledFees.map((c) => {
              const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
              return (
                <li key={c.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm">
                  <Link href={`/contracts/${c.id}`} className="link link-hover font-medium">
                    {c.name}
                  </Link>
                  <span className="opacity-60">
                    {" "}
                    · {customer?.name ?? "—"} · <Money value={Number(c.monthly_recurring_fee ?? 0)} /> / mo
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
