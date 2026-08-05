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

function bucketTone(label: string): "default" | "warning" | "error" {
  if (label === "Current") return "default";
  if (label === "61–90 Days Past Due" || label === "More Than 90 Days Past Due") return "error";
  return "warning";
}

export default async function AccountsReceivablePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, due_date, status, remaining_balance, customers(id, name)")
    .gt("remaining_balance", 0)
    .neq("status", "canceled")
    .neq("status", "draft")
    .order("due_date", { ascending: true });

  const rows = (invoices ?? []).map((inv) => ({
    ...inv,
    bucket: arAgingBucket(inv.due_date),
  }));

  const totalsByBucket = new Map<string, { count: number; amount: number }>();
  for (const label of AGING_ORDER) totalsByBucket.set(label, { count: 0, amount: 0 });
  for (const row of rows) {
    const bucket = totalsByBucket.get(row.bucket) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += Number(row.remaining_balance ?? 0);
    totalsByBucket.set(row.bucket, bucket);
  }

  const totalAr = rows.reduce((sum, row) => sum + Number(row.remaining_balance ?? 0), 0);
  const pastDueAr = rows
    .filter((row) => row.bucket !== "Current")
    .reduce((sum, row) => sum + Number(row.remaining_balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable"
        description="Every unpaid invoice, grouped by how far past its due date it is."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Outstanding" value={`$${totalAr.toFixed(2)}`} />
        <StatCard label="Past Due" value={`$${pastDueAr.toFixed(2)}`} tone={pastDueAr > 0 ? "warning" : "default"} />
        <StatCard label="Open Invoices" value={String(rows.length)} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Aging Summary</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          {AGING_ORDER.map((label) => {
            const bucket = totalsByBucket.get(label) ?? { count: 0, amount: 0 };
            return (
              <StatCard
                key={label}
                label={label}
                value={`$${bucket.amount.toFixed(2)}`}
                hint={`${bucket.count} invoice${bucket.count === 1 ? "" : "s"}`}
                tone={bucketTone(label)}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Open Invoices</h2>
        {rows.length > 0 ? (
          <DataTable headers={["Invoice", "Customer", "Due Date", "Status", "Aging Bucket", "Balance"]}>
            {rows.map((row) => {
              const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={`/invoices/${row.id}`} className="link link-hover font-medium">
                      {row.invoice_number}
                    </Link>
                  </td>
                  <td>{customer?.name ?? "—"}</td>
                  <td className="text-xs">{formatDate(row.due_date)}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <span className={`badge ${bucketTone(row.bucket) === "error" ? "badge-error" : bucketTone(row.bucket) === "warning" ? "badge-warning" : "badge-ghost"}`}>
                      {row.bucket}
                    </span>
                  </td>
                  <td className="font-medium">
                    <Money value={Number(row.remaining_balance ?? 0)} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No open receivables" description="Every issued invoice has been paid in full." />
        )}
      </div>
    </div>
  );
}
