import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import {
  canEditContracts,
  canViewContractsModule,
  listContracts,
  unwrapCustomer,
  type ContractListRow,
} from "@/lib/contracts";
import { statusLabel } from "@/lib/format";

export default async function ViewEditContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/contracts");

  const canEdit = canEditContracts(profile.role);
  const supabase = await createClient();
  const { data, error } = await listContracts(supabase);
  const contracts = (data ?? []) as ContractListRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="View and Edit Contracts"
        description="Browse every agreement. View opens the PDF; Edit uses the same stepped screens as New Contract."
        actions={
          canEdit ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              New contract
            </Link>
          ) : null
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Create a contract to start managing agreements here."
        />
      ) : null}

      {!error && contracts.length > 0 ? (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table">
            <thead>
              <tr>
                <th>Contract #</th>
                <th>Name</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((row) => {
                const customer = unwrapCustomer(row);
                return (
                  <tr key={row.id}>
                    <td className="font-medium tabular-nums">{row.contract_number}</td>
                    <td>{row.name}</td>
                    <td>{customer?.name ?? "—"}</td>
                    <td>
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/contracts/${row.id}/view`}
                          className="btn btn-ghost btn-sm border border-base-300"
                        >
                          View
                        </Link>
                        {canEdit ? (
                          <Link href={`/contracts/${row.id}/edit`} className="btn btn-primary btn-sm">
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
