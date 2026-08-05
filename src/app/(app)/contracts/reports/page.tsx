import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import { canViewContractReports, fetchContractReportMetrics } from "@/lib/contracts";

export default async function ContractReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractReports(profile.role)) redirect("/contracts/renewals");

  const supabase = await createClient();
  const { metrics, error } = await fetchContractReportMetrics(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts Dashboard"
        description="Portfolio money, term risk, SLA health, and hour-pool pressure — with drill-downs below."
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error ? (
        <ContractMetricsWidgets
          metrics={metrics}
          title={null}
          linkToFullReport={false}
        />
      ) : null}

      {!error ? (
        <section className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Contracts by status
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metrics.byStatus).map(([status, count]) => (
              <StatusBadge key={status} status={status} label={`${status.replace(/_/g, " ")}: ${count}`} />
            ))}
          </div>
          {metrics.activeContracts === 0 ? (
            <EmptyState
              title="No active contracts"
              description="Activate agreements to populate MRR and utilization."
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
