import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { ContractsListClient } from "@/components/ContractsListClient";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import { EmptyState, ErrorState, PageHeader, StatCard } from "@/components/ui";
import type { ContractStatus } from "@/lib/types";
import {
  canCreateContracts,
  canViewContractReports,
  canViewContractsModule,
  describeContractPermissions,
  fetchContractReportMetrics,
  listContracts,
  summarizeContractsByStatus,
  syncRemindersForContracts,
  type ContractListRow,
} from "@/lib/contracts";

export default async function ContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const copy = CONTRACTS_NAV_COPY[profile.role];
  const canCreate = canCreateContracts(profile.role);
  const canReport = canViewContractReports(profile.role);
  const supabase = await createClient();
  const { data, error } = await listContracts(supabase);
  const contracts = (data ?? []) as ContractListRow[];

  if (!error && contracts.length > 0) {
    await syncRemindersForContracts(
      supabase,
      contracts.map((c) => ({
        id: c.id,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        renewal_type: c.renewal_type,
      }))
    );
  }

  const statusCounts = summarizeContractsByStatus(contracts);
  const reportBundle = canReport ? await fetchContractReportMetrics(supabase) : null;
  const permissionChips = describeContractPermissions(profile.role).filter((p) => p.allowed);

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            {canReport ? (
              <Link href="/contracts/reports" className="btn btn-outline">
                Reports & Dashboard
              </Link>
            ) : null}
            <Link href="/contracts/renewals" className="btn btn-outline">
              Renewal & Expiration
            </Link>
            {canCreate ? (
              <Link href="/contracts/new" className="btn btn-primary">
                New contract
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {permissionChips.map((item) => (
          <span key={item.permission} className="badge badge-sm badge-outline">
            {item.label}
          </span>
        ))}
      </div>

      {error ? <ErrorState message={error.message} /> : null}

      {!error && reportBundle && !reportBundle.error ? (
        <ContractMetricsWidgets
          metrics={reportBundle.metrics}
          showTables={false}
          title="Portfolio snapshot"
        />
      ) : null}

      {!error ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.entries(statusCounts) as [ContractStatus, number][]).map(([status, count]) => (
            <StatCard key={status} label={status.replace(/_/g, " ")} value={String(count)} />
          ))}
        </div>
      ) : null}

      {!error && contracts.length === 0 ? (
        <EmptyState
          title="No contracts on file"
          description={canCreate ? "Create the first service agreement to get started." : undefined}
        />
      ) : null}

      {!error && contracts.length > 0 ? <ContractsListClient contracts={contracts} /> : null}
    </div>
  );
}
