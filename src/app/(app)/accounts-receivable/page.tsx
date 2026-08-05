import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader, StatCard } from "@/components/ui";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/calculations";
import { OpenInvoicesTable, type OpenInvoiceRow } from "@/components/OpenInvoicesTable";

function bucketCardClass(label: string) {
  if (label === "Current") return "aging-card-current";
  if (label === "1-30 Days") return "aging-card-30";
  if (label === "31-60 Days") return "aging-card-60";
  if (label === "61-90 Days") return "aging-card-90";
  return "aging-card-over-90";
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
  for (const label of AR_AGING_BUCKETS) totalsByBucket.set(label, { count: 0, amount: 0 });
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
          {AR_AGING_BUCKETS.map((label) => {
            const bucket = totalsByBucket.get(label) ?? { count: 0, amount: 0 };
            return (
              <StatCard
                key={label}
                label={label}
                value={`$${bucket.amount.toFixed(2)}`}
                hint={`${bucket.count} invoice${bucket.count === 1 ? "" : "s"}`}
                className={bucketCardClass(label)}
              />
            );
          })}
        </div>
      </div>

      <OpenInvoicesTable
        invoices={rows.map((row): OpenInvoiceRow => {
          const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
          return {
            id: row.id,
            invoice_number: row.invoice_number,
            customer_name: customer?.name ?? "Unknown customer",
            due_date: row.due_date,
            status: row.status,
            aging_bucket: row.bucket,
            balance: Number(row.remaining_balance ?? 0),
          };
        })}
      />
    </div>
  );
}
