import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canUseBillingTools } from "@/lib/constants";
import { AccountingExplainer, DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard } from "@/components/ui";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { formatCurrency, statusLabel } from "@/lib/format";
import { monthKeyInDashboardPeriod, periodViewControlProps, resolveDashboardPeriod } from "@/lib/dashboard-period";
const RECOGNITION_ORDER = ["earned", "deferred", "unbilled"];

function recognitionTone(recognition: string): "success" | "warning" | "default" {
  if (recognition === "earned") return "success";
  if (recognition === "unbilled") return "warning";
  return "default";
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canUseBillingTools(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const period = resolveDashboardPeriod(params.view, params.period);
  const supabase = await createClient();
  const { data: records, error } = await supabase
    .from("revenue_records")
    .select("revenue_type, recognition, amount, period_month, description")
    .order("period_month", { ascending: false });

  const periodRecords = (records ?? []).filter((record) => monthKeyInDashboardPeriod(record.period_month, period));

  const byRecognition = new Map<string, number>();
  const byTypeAndRecognition = new Map<string, Map<string, number>>();

  for (const record of periodRecords) {
    const amount = Number(record.amount ?? 0);
    byRecognition.set(record.recognition, (byRecognition.get(record.recognition) ?? 0) + amount);

    const typeMap = byTypeAndRecognition.get(record.revenue_type) ?? new Map<string, number>();
    typeMap.set(record.recognition, (typeMap.get(record.recognition) ?? 0) + amount);
    byTypeAndRecognition.set(record.revenue_type, typeMap);
  }

  const totalRevenue = Array.from(byRecognition.values()).reduce((sum, v) => sum + v, 0);
  const revenueTypes = Array.from(byTypeAndRecognition.keys()).sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting Review"
        description={
          period.view === "all"
            ? "Revenue recorded across the life of the company, broken out by type and recognition status."
            : `Revenue recorded in ${period.label}, broken out by type and recognition status.`
        }
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue Recorded"
          value={formatCurrency(totalRevenue)}
          explanation={{
            title: "Total Revenue Recorded",
            result: formatCurrency(totalRevenue),
            formula: `Sum of all revenue_records.amount in ${period.label} across earned, deferred, and unbilled recognition`,
            lines: Array.from(byRecognition.entries()).map(([recognition, amount]) => ({
              label: statusLabel(recognition),
              value: formatCurrency(amount),
            })),
          }}
        />
        {RECOGNITION_ORDER.map((recognition) => (
          <StatCard
            key={recognition}
            label={statusLabel(recognition)}
            value={formatCurrency(byRecognition.get(recognition) ?? 0)}
            tone={recognitionTone(recognition)}
            explanation={{
              title: statusLabel(recognition),
              result: `$${(byRecognition.get(recognition) ?? 0).toFixed(2)}`,
              formula: `Sum of revenue_records.amount in ${period.label} where recognition = ${recognition}`,
              lines: periodRecords
                .filter((record) => record.recognition === recognition)
                .map((record) => ({
                  label: record.description || statusLabel(record.revenue_type),
                  value: `$${Number(record.amount ?? 0).toFixed(2)}`,
                  detail: record.period_month,
                })),
            }}
          />
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Revenue by Type and Recognition · {period.label}</h2>
        {revenueTypes.length > 0 ? (
          <DataTable headers={["Revenue Type", "Earned", "Deferred", "Unbilled", "Total"]}>
            {revenueTypes.map((type) => {
              const typeMap = byTypeAndRecognition.get(type) ?? new Map<string, number>();
              const total = Array.from(typeMap.values()).reduce((sum, v) => sum + v, 0);
              return (
                <tr key={type}>
                  <td className="font-medium">{statusLabel(type)}</td>
                  <td>
                    <Money value={typeMap.get("earned") ?? 0} />
                  </td>
                  <td>
                    <Money value={typeMap.get("deferred") ?? 0} />
                  </td>
                  <td>
                    <Money value={typeMap.get("unbilled") ?? 0} />
                  </td>
                  <td className="font-medium">
                    <Money value={total} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <EmptyState title="No revenue has been recorded for this period" />
        )}
      </div>

      <AccountingExplainer />
    </div>
  );
}
