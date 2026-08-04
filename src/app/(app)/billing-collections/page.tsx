import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { arAgingBucket } from "@/lib/calculations";

const AGING_ORDER = [
  "Current",
  "1–30 Days Past Due",
  "31–60 Days Past Due",
  "61–90 Days Past Due",
  "More Than 90 Days Past Due",
];

export default async function BillingCollectionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: invoices, error: invoicesError }, { data: disputes, error: disputesError }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, status, due_date, total_amount, remaining_balance, customers(name)")
      .order("invoice_date", { ascending: false }),
    supabase
      .from("disputes")
      .select("id, invoice_id, dispute_date, dispute_reason, disputed_amount, resolution_status, customers(name)")
      .order("dispute_date", { ascending: false }),
  ]);

  const error = invoicesError || disputesError;

  const byStatus = new Map<string, { count: number; total: number; balance: number }>();
  for (const inv of invoices ?? []) {
    const bucket = byStatus.get(inv.status) ?? { count: 0, total: 0, balance: 0 };
    bucket.count += 1;
    bucket.total += Number(inv.total_amount ?? 0);
    bucket.balance += Number(inv.remaining_balance ?? 0);
    byStatus.set(inv.status, bucket);
  }
  const statusRows = Array.from(byStatus.entries()).sort((a, b) => b[1].total - a[1].total);

  const openInvoices = (invoices ?? []).filter(
    (inv) => Number(inv.remaining_balance ?? 0) > 0 && inv.status !== "canceled" && inv.status !== "draft"
  );
  const agingBuckets = new Map<string, number>();
  for (const label of AGING_ORDER) agingBuckets.set(label, 0);
  for (const inv of openInvoices) {
    const bucket = arAgingBucket(inv.due_date);
    agingBuckets.set(bucket, (agingBuckets.get(bucket) ?? 0) + Number(inv.remaining_balance ?? 0));
  }

  const totalAr = openInvoices.reduce((sum, inv) => sum + Number(inv.remaining_balance ?? 0), 0);
  const openDisputes = (disputes ?? []).filter((d) => d.resolution_status === "open" || d.resolution_status === "under_review");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing and Collections"
        description="Invoice status, aging receivables, and open billing disputes."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Invoices" value={String(invoices?.length ?? 0)} />
        <StatCard label="Total Accounts Receivable" value={`$${totalAr.toFixed(2)}`} />
        <StatCard
          label="Open Disputes"
          value={String(openDisputes.length)}
          tone={openDisputes.length > 0 ? "warning" : "default"}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Invoices by Status</h2>
        {statusRows.length > 0 ? (
          <DataTable headers={["Status", "Count", "Total Billed", "Remaining Balance"]}>
            {statusRows.map(([status, bucket]) => (
              <tr key={status}>
                <td>
                  <StatusBadge status={status} />
                </td>
                <td>{bucket.count}</td>
                <td>
                  <Money value={bucket.total} />
                </td>
                <td>
                  <Money value={bucket.balance} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No invoices issued yet" />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Accounts Receivable Aging</h2>
        <DataTable headers={AGING_ORDER}>
          <tr>
            {AGING_ORDER.map((label) => (
              <td key={label} className="font-medium">
                <Money value={agingBuckets.get(label) ?? 0} />
              </td>
            ))}
          </tr>
        </DataTable>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Open Disputes</h2>
        {openDisputes.length > 0 ? (
          <DataTable headers={["Customer", "Reason", "Disputed Amount", "Status", "Opened", ""]}>
            {openDisputes.map((dispute) => {
              const customer = Array.isArray(dispute.customers) ? dispute.customers[0] : dispute.customers;
              return (
                <tr key={dispute.id}>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="max-w-xs">{dispute.dispute_reason}</td>
                  <td>
                    <Money value={Number(dispute.disputed_amount ?? 0)} />
                  </td>
                  <td>
                    <StatusBadge status={dispute.resolution_status} />
                  </td>
                  <td className="text-xs">{formatDate(dispute.dispute_date)}</td>
                  <td className="text-right">
                    <Link href={`/invoices/${dispute.invoice_id}`} className="btn btn-ghost btn-xs">
                      View Invoice
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No open billing disputes" description="All customer invoices are undisputed." />
        )}
      </div>
    </div>
  );
}
