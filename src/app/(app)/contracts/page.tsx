import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatusBadge, StatCard } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ContractStatus } from "@/lib/types";
import {
  canViewContractsModule,
  getContractWarnings,
  listContracts,
  summarizeContractsByStatus,
  unwrapCustomer,
  type ContractListRow,
} from "@/lib/contracts";

export default async function ContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const copy = CONTRACTS_NAV_COPY[profile.role];
  const supabase = await createClient();
  const { data, error } = await listContracts(supabase);
  const contracts = (data ?? []) as ContractListRow[];
  const statusCounts = summarizeContractsByStatus(contracts);

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />

      {error ? <ErrorState message={error.message} /> : null}

      {!error ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.entries(statusCounts) as [ContractStatus, number][]).map(([status, count]) => (
            <StatCard key={status} label={status.replace(/_/g, " ")} value={String(count)} />
          ))}
        </div>
      ) : null}

      {!error && contracts.length === 0 ? <EmptyState title="No contracts on file" /> : null}

      {!error && contracts.length > 0 ? (
        <DataTable headers={["Contract", "Customer", "Status", "Type", "Term", "Monthly Fee", "Warnings", ""]}>
          {contracts.map((contract) => {
            const customer = unwrapCustomer(contract);
            const warnings = getContractWarnings(contract);

            return (
              <tr key={contract.id}>
                <td>
                  <Link href={`/contracts/${contract.id}`} className="link link-hover font-medium">
                    {contract.name}
                  </Link>
                  <div className="text-xs opacity-60">{contract.contract_number}</div>
                </td>
                <td>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="link link-hover">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <StatusBadge status={contract.status} />
                </td>
                <td className="text-xs">{contract.contract_type}</td>
                <td className="text-xs">
                  {formatDate(contract.start_date)} – {formatDate(contract.end_date)}
                </td>
                <td>
                  <Money value={Number(contract.monthly_recurring_fee ?? 0)} />
                </td>
                <td>
                  {warnings.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {warnings.map((warning) => (
                        <span key={warning.code} className="badge badge-warning badge-sm">
                          {warning.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs opacity-50">None</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/contracts/${contract.id}`} className="btn btn-ghost btn-xs">
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : null}
    </div>
  );
}
