import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState, PageHeader } from "@/components/ui";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/calculations";
import { AccountsReceivableClient, type ArAgingRow } from "@/components/AccountsReceivableClient";
import { ArAgingChart, type ArAgingBucketTotal } from "@/components/ArAgingChart";
import { ArSummaryHeader } from "@/components/ArSummaryHeader";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { withDerivedInvoiceStatus } from "@/lib/billing";
import { dateInDashboardPeriod, periodViewControlProps, resolveDashboardPeriod } from "@/lib/dashboard-period";

const SHORT_LABELS: Record<string, string> = {
  Current: "Current",
  "1-30 Days": "1–30",
  "31-60 Days": "31–60",
  "61-90 Days": "61–90",
  ">90 Days": "90+",
};

function daysPastDue(dueDate: string, asOf: Date = new Date()): number {
  const due = new Date(dueDate);
  return Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function AccountsReceivablePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "executive", "admin"].includes(profile.role)) redirect("/dashboard");

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

  const rows: ArAgingRow[] = (invoices ?? [])
    .map((inv) => withDerivedInvoiceStatus(inv))
    .filter((inv) => dateInDashboardPeriod(inv.billing_period_start || inv.invoice_date, period))
    .map((inv) => {
      const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
      const days = daysPastDue(inv.due_date);
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerName: customer?.name ?? "Unknown customer",
        dueDate: inv.due_date,
        status: inv.status,
        remainingBalance: Number(inv.remaining_balance ?? 0),
        bucket: arAgingBucket(inv.due_date),
        daysPastDue: days,
      };
    });

  const totalsByBucket = new Map<string, { count: number; amount: number }>();
  for (const label of AR_AGING_BUCKETS) totalsByBucket.set(label, { count: 0, amount: 0 });
  for (const row of rows) {
    const bucket = totalsByBucket.get(row.bucket) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += row.remainingBalance;
    totalsByBucket.set(row.bucket, bucket);
  }

  const agingChartData: ArAgingBucketTotal[] = AR_AGING_BUCKETS.map((label) => {
    const bucket = totalsByBucket.get(label) ?? { count: 0, amount: 0 };
    return {
      bucket: label,
      shortLabel: SHORT_LABELS[label] ?? label,
      amount: bucket.amount,
      count: bucket.count,
    };
  });

  const totalAr = rows.reduce((sum, row) => sum + row.remainingBalance, 0);
  const pastDueAr = rows
    .filter((row) => row.bucket !== "Current")
    .reduce((sum, row) => sum + row.remainingBalance, 0);
  const pastDueRows = rows.filter((row) => row.daysPastDue > 0);
  const escalatedRows = rows.filter((row) => row.daysPastDue > 60);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable"
        description={
          period.view === "all"
            ? "Unpaid invoices, grouped by how far past the due date they are."
            : `Unpaid invoices from ${period.label}, grouped by how far past the due date they are.`
        }
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />

      {error ? <ErrorState message={error.message} /> : null}

      <ArSummaryHeader
        openInvoiceCount={rows.length}
        totalOutstanding={totalAr}
        pastDueAmount={pastDueAr}
        pastDueCount={pastDueRows.length}
        escalatedCount={escalatedRows.length}
      />

      <div>
        <h2 className="mb-2 text-lg font-semibold">Aging Summary · {period.label}</h2>
        <ArAgingChart data={agingChartData} />
      </div>

      <AccountsReceivableClient rows={rows} />
    </div>
  );
}
