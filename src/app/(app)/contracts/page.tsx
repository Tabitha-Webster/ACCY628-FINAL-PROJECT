import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { ContractsListClient } from "@/components/ContractsListClient";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import { ContractPermissionActions } from "@/components/ContractPermissionActions";
import {
  MissingSignedDocumentsTable,
  type MissingSignedDocumentRow,
} from "@/components/MissingSignedDocumentsTable";
import { EmptyState, ErrorState, PageHeader, StatCard } from "@/components/ui";
import type { ContractStatus } from "@/lib/types";
import {
  canCreateContracts,
  canEditContracts,
  canViewContractDocumentChecklist,
  canViewContractReports,
  canViewContractsModule,
  describeContractPermissions,
  fetchContractReportMetrics,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            {canReport ? (
              <Link href="/contracts/reports" className="btn btn-outline">
                Reporting & Dashboard
              </Link>
            ) : null}
            <Link href="/contracts/renewals" className="btn btn-outline">
              Renewal & Expiration
            </Link>
            {canCreate ? (
              <Link href="/contracts/new" className="btn btn-primary">
                Create
              </Link>
            ) : null}
          </div>
        }
      />

      <ContractPermissionActions items={permissionItems} />

      {error ? <ErrorState message={error.message} /> : null}
      {missingDocsRes?.error ? <ErrorState message={missingDocsRes.error.message} /> : null}

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
            <Link key={status} href={`/contracts?status=${status}`} className="block">
              <StatCard label={status.replace(/_/g, " ")} value={String(count)} />
            </Link>
          ))}
        </div>
      ) : null}

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
    </div>
  );
}
