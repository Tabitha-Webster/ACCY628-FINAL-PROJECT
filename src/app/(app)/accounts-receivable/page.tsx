import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader, StatCard } from "@/components/ui";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/calculations";
import { OpenInvoicesTable, type OpenInvoiceRow } from "@/components/OpenInvoicesTable";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { withDerivedInvoiceStatus } from "@/lib/billing";
import { dateInDashboardPeriod, periodViewControlProps, resolveDashboardPeriod } from "@/lib/dashboard-period";

function bucketCardClass(label: string) {
  if (label === "Current") return "aging-card-current";
  if (label === "1-30 Days") return "aging-card-30";
  if (label === "31-60 Days") return "aging-card-60";
  if (label === "61-90 Days") return "aging-card-90";
  return "aging-card-over-90";
}

export default async function AccountsReceivablePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const period = resolveDashboardPeriod(params.view, params.period);
  const supabase = await createClient();
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, due_date, status, remaining_balance, amount_paid, dispute_status, invoice_date, billing_period_start, customers(id, name)"
    )
    .gt("remaining_balance", 0)
    .neq("status", "canceled")
    .neq("status", "draft")
    .order("due_date", { ascending: true });

  const rows = (invoices ?? [])
    .map((inv) => {
      const derived = withDerivedInvoiceStatus(inv);
      return {
        ...derived,
        bucket: arAgingBucket(derived.due_date),
      };
    })
    .filter((row) => dateInDashboardPeriod(row.billing_period_start || row.invoice_date, period));

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
        description={`Unpaid invoices from ${period.label}, grouped by how far past the due date they are.`}
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Outstanding"
          value={`$${totalAr.toFixed(2)}`}
          explanation={{
            title: "Total Outstanding",
            result: `$${totalAr.toFixed(2)}`,
            formula: `Sum of remaining_balance on unpaid invoices from ${period.label} that are not draft or canceled`,
            lines: rows.map((row) => {
              const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
              return {
                label: row.invoice_number,
                value: `$${Number(row.remaining_balance ?? 0).toFixed(2)}`,
                detail: `${customer?.name ?? "Unknown customer"} · ${row.bucket}`,
              };
            }),
          }}
        />
        <StatCard
          label="Past Due"
          value={`$${pastDueAr.toFixed(2)}`}
          tone={pastDueAr > 0 ? "warning" : "default"}
          explanation={{
            title: "Past Due",
            result: `$${pastDueAr.toFixed(2)}`,
            formula: `Sum of remaining_balance on open invoices from ${period.label} that are not in the Current aging bucket`,
            lines: rows
              .filter((row) => row.bucket !== "Current")
              .map((row) => {
                const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
                return {
                  label: row.invoice_number,
                  value: `$${Number(row.remaining_balance ?? 0).toFixed(2)}`,
                  detail: `${customer?.name ?? "Unknown customer"} · ${row.bucket}`,
                };
              }),
          }}
        />
        <StatCard
          label="Open Invoices"
          value={String(rows.length)}
          explanation={{
            title: "Open Invoices",
            result: String(rows.length),
            formula: `Count of unpaid invoices from ${period.label} that are not draft or canceled`,
            lines: rows.map((row) => {
              const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
              return {
                label: row.invoice_number,
                value: `$${Number(row.remaining_balance ?? 0).toFixed(2)}`,
                detail: customer?.name ?? "Unknown customer",
              };
            }),
          }}
        />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Aging Summary · {period.label}</h2>
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
                explanation={{
                  title: label,
                  result: `$${bucket.amount.toFixed(2)}`,
                  formula: `Sum of remaining_balance for open invoices from ${period.label} in the ${label} aging bucket`,
                  lines: rows
                    .filter((row) => row.bucket === label)
                    .map((row) => {
                      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
                      return {
                        label: row.invoice_number,
                        value: `$${Number(row.remaining_balance ?? 0).toFixed(2)}`,
                        detail: `${customer?.name ?? "Unknown customer"} · due ${row.due_date}`,
                      };
                    }),
                }}
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
