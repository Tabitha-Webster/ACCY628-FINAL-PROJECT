"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ContractStatusLegend } from "@/components/ContractStatusLegend";
import { EmptyState, StatusBadge } from "@/components/ui";
import {
  CONTRACT_STATUS_LABELS,
  contractStatusRowClass,
  unwrapCustomer,
  type ContractListRow,
  type ContractStatus,
} from "@/lib/contracts";

type Props = {
  contracts: ContractListRow[];
  canEdit: boolean;
};

export function ViewEditContractsClient({ contracts, canEdit }: Props) {
  const [statusFilter, setStatusFilter] = useState<ContractStatus | null>(null);

  const filtered = useMemo(() => {
    if (!statusFilter) return contracts;
    return contracts.filter((row) => row.status === statusFilter);
  }, [contracts, statusFilter]);

  return (
    <div className="space-y-4">
      <ContractStatusLegend selectedStatus={statusFilter} onSelectStatus={setStatusFilter} />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Create a contract to start managing agreements here."
        />
      ) : null}

      {contracts.length > 0 && filtered.length === 0 ? (
        <EmptyState
          title={`No ${CONTRACT_STATUS_LABELS[statusFilter!]} contracts`}
          description="Choose another status icon above, or clear the filter to see every agreement."
        />
      ) : null}

      {filtered.length > 0 ? (
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
              {filtered.map((row) => {
                const customer = unwrapCustomer(row);
                const statusLabelText =
                  CONTRACT_STATUS_LABELS[row.status as keyof typeof CONTRACT_STATUS_LABELS] ??
                  row.status;
                return (
                  <tr key={row.id} className={contractStatusRowClass(row.status)}>
                    <td className="font-medium tabular-nums">{row.contract_number}</td>
                    <td>{row.name}</td>
                    <td>{customer?.name ?? "—"}</td>
                    <td>
                      <StatusBadge status={row.status} label={statusLabelText} />
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
