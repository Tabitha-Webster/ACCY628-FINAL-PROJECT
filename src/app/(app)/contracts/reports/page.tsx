import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import { ContractPermissionActions } from "@/components/ContractPermissionActions";
import {
  canCreateContracts,
  canViewContractReports,
  describeContractPermissions,
  fetchContractCalendarEvents,
  fetchContractReportMetrics,
} from "@/lib/contracts";

export default async function ContractReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractReports(profile.role)) redirect("/contracts/renewals");

  const supabase = await createClient();
  const [{ metrics, error }, calendarBundle] = await Promise.all([
    fetchContractReportMetrics(supabase),
    fetchContractCalendarEvents(supabase),
  ]);
  const permissions = describeContractPermissions(profile.role);
  const canCreate = canCreateContracts(profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/contracts" className="btn btn-ghost btn-sm">
          ← Manage contracts
        </Link>
        <Link href="/contracts/renewals" className="btn btn-outline btn-sm">
          Renewal & Expiration
        </Link>
        {canCreate ? (
          <Link href="/contracts/new" className="btn btn-primary btn-sm">
            Create
          </Link>
        ) : null}
      </div>

      <PageHeader title="Contracts Dashboard" />

      <ContractPermissionActions items={permissions} showDenied />

      {error ? <ErrorState message={error.message} /> : null}
      {calendarBundle.error ? <ErrorState message={calendarBundle.error.message} /> : null}

      {!error ? (
        <ContractMetricsWidgets
          metrics={metrics}
          calendarEvents={calendarBundle.events}
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
              <Link key={status} href={`/contracts?status=${status}`} className="link">
                <StatusBadge status={status} label={`${status.replace(/_/g, " ")}: ${count}`} />
              </Link>
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
