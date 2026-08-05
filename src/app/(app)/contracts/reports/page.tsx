import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import {
  canViewContractReports,
  describeContractPermissions,
  fetchContractReportMetrics,
} from "@/lib/contracts";

export default async function ContractReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractReports(profile.role)) redirect("/contracts");

  const supabase = await createClient();
  const { metrics, error } = await fetchContractReportMetrics(supabase);
  const permissions = describeContractPermissions(profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/contracts" className="btn btn-ghost btn-sm">
          ← Back to contracts
        </Link>
        <Link href="/contracts/renewals" className="btn btn-outline btn-sm">
          Renewal & Expiration
        </Link>
      </div>

      <PageHeader
        title="Contracts Reporting & Dashboard"
        description="Active agreements, expirations, renewals, MRR/ACV, SLA compliance, and support-hour utilization."
      />

      <section className="rounded-box border border-base-300 bg-base-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Your contract permissions
        </h2>
        <div className="flex flex-wrap gap-2">
          {permissions.map((item) => (
            <span
              key={item.permission}
              className={`badge badge-sm ${item.allowed ? "badge-success" : "badge-ghost opacity-50"}`}
            >
              {item.label}
              {item.allowed ? "" : " (denied)"}
            </span>
          ))}
        </div>
      </section>

      {error ? <ErrorState message={error.message} /> : null}

      {!error ? (
        <ContractMetricsWidgets metrics={metrics} title="Portfolio widgets" />
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
            <EmptyState title="No active contracts" description="Activate agreements to populate MRR and utilization." />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
