import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { ContractsListClient } from "@/components/ContractsListClient";
import { ContractPermissionActions } from "@/components/ContractPermissionActions";
import {
  ContractsManageVisuals,
  type ContractsMetricTile,
} from "@/components/ContractsManageVisuals";
import {
  MissingSignedDocumentsTable,
  type MissingSignedDocumentRow,
} from "@/components/MissingSignedDocumentsTable";
import { EmptyState, ErrorState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  canCreateContracts,
  canEditContracts,
  canViewContractDocumentChecklist,
  canViewContractReports,
  canViewContractsModule,
  describeContractPermissions,
  fetchContractReportMetrics,
  getContractHighlight,
  listActiveContractsMissingSignedDocument,
  listContracts,
  summarizeContractsByStatus,
  syncRemindersForContracts,
  type ContractListRow,
} from "@/lib/contracts";

type SearchParams = Promise<{ status?: string }>;

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : "";

  const copy = CONTRACTS_NAV_COPY[profile.role];
  const canCreate = canCreateContracts(profile.role);
  const canEdit = canEditContracts(profile.role);
  const canReport = canViewContractReports(profile.role);
  const showDocumentChecklist = canViewContractDocumentChecklist(profile.role);
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
  const permissionItems = describeContractPermissions(profile.role);
  const missingDocsRes = showDocumentChecklist
    ? await listActiveContractsMissingSignedDocument(supabase)
    : null;
  const missingDocs = (missingDocsRes?.data ?? []) as MissingSignedDocumentRow[];

  const atRiskFromList = contracts.filter((c) => {
    const h = getContractHighlight(c);
    return h === "ends_soon" || h === "past_end_date" || h === "renewal_30" || h === "renewal_60";
  }).length;

  const metrics: ContractsMetricTile[] = canReport && reportBundle && !reportBundle.error
    ? [
        {
          label: "MRR",
          value: formatCurrency(reportBundle.metrics.monthlyRecurringRevenue),
          tone: "sky",
          hint: `≈ ${formatCurrency(reportBundle.metrics.annualContractValue)} ACV`,
          href: "/contracts/reports",
        },
        {
          label: "Active",
          value: String(statusCounts.active),
          tone: "emerald",
          hint: `${contracts.length} total on file`,
          href: "/contracts?status=active",
        },
        {
          label: "Pending",
          value: String(statusCounts.pending_approval),
          tone: statusCounts.pending_approval > 0 ? "amber" : "emerald",
          hint: "Awaiting approval",
          href: "/contracts?status=pending_approval",
        },
        {
          label: "At risk",
          value: String(
            reportBundle.metrics.expiringContracts + reportBundle.metrics.renewalsDue
          ),
          tone:
            reportBundle.metrics.expiringContracts + reportBundle.metrics.renewalsDue > 0
              ? "rose"
              : "emerald",
          hint: `${reportBundle.metrics.expiringContracts} expiring · ${reportBundle.metrics.renewalsDue} renewals`,
          href: "/contracts/renewals",
        },
      ]
    : [
        {
          label: "Contracts",
          value: String(contracts.length),
          tone: "sky",
          hint: "On file",
        },
        {
          label: "Active",
          value: String(statusCounts.active),
          tone: "emerald",
          href: "/contracts?status=active",
        },
        {
          label: "Pending",
          value: String(statusCounts.pending_approval),
          tone: statusCounts.pending_approval > 0 ? "amber" : "emerald",
          href: "/contracts?status=pending_approval",
        },
        {
          label: "At risk",
          value: String(atRiskFromList),
          tone: atRiskFromList > 0 ? "rose" : "emerald",
          hint: "Renewal / expiration pressure",
          href: "/contracts/renewals",
        },
      ];

  return (
    <ContractsManageVisuals
      title={copy.title}
      subtitle={copy.description}
      metrics={metrics}
      statusCounts={statusCounts}
      headerActions={
        <div className="flex flex-wrap gap-2">
          {canReport ? (
            <Link href="/contracts/reports" className="btn btn-outline btn-sm">
              Reporting & Dashboard
            </Link>
          ) : null}
          <Link href="/contracts/renewals" className="btn btn-outline btn-sm">
            Renewal & Expiration
          </Link>
          {canCreate ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              Create
            </Link>
          ) : null}
        </div>
      }
    >
      <ContractPermissionActions items={permissionItems} />

      {error ? <ErrorState message={error.message} /> : null}
      {missingDocsRes?.error ? <ErrorState message={missingDocsRes.error.message} /> : null}

      {!error && contracts.length === 0 ? (
        <EmptyState
          title="No contracts on file"
          description={canCreate ? "Create the first service agreement to get started." : undefined}
        />
      ) : null}

      {!error && contracts.length > 0 ? (
        <ContractsListClient
          contracts={contracts}
          initialStatus={statusFilter}
          canEdit={canEdit}
          role={profile.role}
        />
      ) : null}

      {!error && showDocumentChecklist && !missingDocsRes?.error ? (
        <MissingSignedDocumentsTable rows={missingDocs} />
      ) : null}
    </ContractsManageVisuals>
  );
}
