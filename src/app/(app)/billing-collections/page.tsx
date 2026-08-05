import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/calculations";
import { withDerivedInvoiceStatus } from "@/lib/billing";

export default async function BillingCollectionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: invoices, error: invoicesError }, { data: disputes, error: disputesError }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, status, due_date, total_amount, remaining_balance, amount_paid, dispute_status, customers(name)")
      .order("invoice_date", { ascending: false }),
    supabase
      .from("disputes")
      .select("id, invoice_id, dispute_date, dispute_reason, disputed_amount, resolution_status, customers(name)")
      .order("dispute_date", { ascending: false }),
  ]);

  const error = invoicesError || disputesError;

  const derivedInvoices = (invoices ?? []).map((inv) => withDerivedInvoiceStatus(inv));

  const byStatus = new Map<string, { count: number; total: number; balance: number }>();
  for (const inv of derivedInvoices) {
    const bucket = byStatus.get(inv.status) ?? { count: 0, total: 0, balance: 0 };
    bucket.count += 1;
    bucket.total += Number(inv.total_amount ?? 0);
    bucket.balance += Number(inv.remaining_balance ?? 0);
    byStatus.set(inv.status, bucket);
  }
  const statusRows = Array.from(byStatus.entries()).sort((a, b) => b[1].total - a[1].total);

  const openInvoices = derivedInvoices.filter(
    (inv) => inv.remaining_balance > 0.01 && inv.status !== "canceled" && inv.status !== "draft" && inv.status !== "paid"
  );
  const agingBuckets = new Map<string, number>();
  for (const label of AR_AGING_BUCKETS) agingBuckets.set(label, 0);
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
        <StatCard
          label="Total Invoices"
          value={String(derivedInvoices.length)}
          explanation={{
            title: "Total Invoices",
            result: String(derivedInvoices.length),
            formula: "Count of all invoices in the system",
            lines: derivedInvoices.map((inv) => {
              const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
              return {
                label: inv.invoice_number,
                value: `$${Number(inv.total_amount ?? 0).toFixed(2)}`,
                detail: `${customer?.name ?? "Unknown customer"} · ${inv.status.replace(/_/g, " ")}`,
              };
            }),
          }}
        />
        <StatCard
          label="Total Accounts Receivable"
          value={`$${totalAr.toFixed(2)}`}
          explanation={{
            title: "Total Accounts Receivable",
            result: `$${totalAr.toFixed(2)}`,
            formula: "Sum of remaining_balance on open invoices that are not draft, canceled, or paid",
            lines: openInvoices.map((inv) => {
              const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
              return {
                label: inv.invoice_number,
                value: `$${inv.remaining_balance.toFixed(2)}`,
                detail: `${customer?.name ?? "Unknown customer"} · ${inv.status.replace(/_/g, " ")}`,
              };
            }),
          }}
        />
        <StatCard
          label="Open Disputes"
          value={String(openDisputes.length)}
          tone={openDisputes.length > 0 ? "warning" : "default"}
          explanation={{
            title: "Open Disputes",
            result: String(openDisputes.length),
            formula: "Count of disputes with resolution status open or under review",
            lines: openDisputes.map((dispute) => {
              const customer = Array.isArray(dispute.customers) ? dispute.customers[0] : dispute.customers;
              return {
                label: customer?.name ?? "Unknown customer",
                value: `$${Number(dispute.disputed_amount ?? 0).toFixed(2)}`,
                detail: dispute.dispute_reason,
              };
            }),
          }}
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
        <DataTable headers={[...AR_AGING_BUCKETS]}>
          <tr>
            {AR_AGING_BUCKETS.map((label) => (
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
