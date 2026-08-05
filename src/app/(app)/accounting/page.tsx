import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { AccountingExplainer, DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, statusLabel } from "@/lib/format";

const RECOGNITION_ORDER = ["earned", "deferred", "unbilled"];

function recognitionTone(recognition: string): "success" | "warning" | "default" {
  if (recognition === "earned") return "success";
  if (recognition === "unbilled") return "warning";
  return "default";
}

export default async function AccountingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: records, error } = await supabase
    .from("revenue_records")
    .select("revenue_type, recognition, amount")
    .order("period_month", { ascending: false });

  const byRecognition = new Map<string, number>();
  const byType = new Map<string, number>();
  const byTypeAndRecognition = new Map<string, Map<string, number>>();

  for (const record of records ?? []) {
    const amount = Number(record.amount ?? 0);
    byRecognition.set(record.recognition, (byRecognition.get(record.recognition) ?? 0) + amount);
    byType.set(record.revenue_type, (byType.get(record.revenue_type) ?? 0) + amount);

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
        description="Revenue recorded across the business, broken out by type and recognition status."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue Recorded" value={formatCurrency(totalRevenue)} />
        {RECOGNITION_ORDER.map((recognition) => (
          <StatCard
            key={recognition}
            label={statusLabel(recognition)}
            value={formatCurrency(byRecognition.get(recognition) ?? 0)}
            tone={recognitionTone(recognition)}
          />
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Revenue by Type and Recognition</h2>
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
          <EmptyState title="No revenue has been recorded yet" />
        )}
      </div>

      <AccountingExplainer />
    </div>
  );
}
