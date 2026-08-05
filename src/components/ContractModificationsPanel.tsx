"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, StatusBadge } from "@/components/ui";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";
import {
  CONTRACT_CHANGE_FIELD_LABELS,
  approvePendingPriceModification,
  rejectPendingPriceModification,
  unwrapProfile,
} from "@/lib/contracts";
import type { ContractModification } from "@/lib/types";

export type ContractModificationRow = ContractModification & {
  created_by_profile?: { full_name: string } | { full_name: string }[] | null;
  approved_by_profile?: { full_name: string } | { full_name: string }[] | null;
};

type Props = {
  contractId: string;
  profileId: string;
  currentVersion: number;
  canApprove: boolean;
  modifications: ContractModificationRow[];
};

export function ContractModificationsPanel({
  contractId,
  profileId,
  currentVersion,
  canApprove,
  modifications,
}: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(modificationId: string) {
    setBusyId(modificationId);
    setError(null);
    const supabase = createClient();
    const { error: approveError } = await approvePendingPriceModification(supabase, {
      modificationId,
      contractId,
      profileId,
      currentVersion,
    });
    setBusyId(null);
    if (approveError) {
      setError(approveError.message);
      return;
    }
    router.refresh();
  }

  async function reject(modificationId: string) {
    setBusyId(modificationId);
    setError(null);
    const supabase = createClient();
    const { error: rejectError } = await rejectPendingPriceModification(supabase, {
      modificationId,
      contractId,
      profileId,
    });
    setBusyId(null);
    if (rejectError) {
      setError(rejectError.message);
      return;
    }
    router.refresh();
  }

  if (modifications.length === 0) {
    return (
      <EmptyState
        title="No modifications recorded"
        description="Price and commercial term changes that require manager approval appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Summary</th>
              <th>Proposed changes</th>
              <th>Effective</th>
              <th>Approval</th>
              <th>Requested</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {modifications.map((mod) => {
              const requester = unwrapProfile(mod.created_by_profile)?.full_name ?? "—";
              const changes = Array.isArray(mod.proposed_changes) ? mod.proposed_changes : [];
              const pending = mod.approval_status === "pending";
              return (
                <tr key={mod.id} className={pending ? "bg-warning/5" : undefined}>
                  <td className="max-w-xs text-sm">{mod.modification_summary}</td>
                  <td className="text-xs">
                    {changes.length === 0 ? (
                      <span className="opacity-50">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {changes.map((change) => (
                          <li key={`${mod.id}-${change.field_name}`}>
                            <span className="font-medium">
                              {CONTRACT_CHANGE_FIELD_LABELS[change.field_name] ??
                                statusLabel(change.field_name)}
                            </span>
                            : {change.previous_value || "—"} → {change.new_value || "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs">{formatDate(mod.effective_date)}</td>
                  <td>
                    <StatusBadge status={mod.approval_status} />
                    <div className="mt-1 text-xs opacity-60">
                      {formatDateTime(mod.created_at)}
                    </div>
                  </td>
                  <td className="text-xs">{requester}</td>
                  <td>
                    {canApprove && pending ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-success btn-xs"
                          disabled={busyId === mod.id}
                          onClick={() => approve(mod.id)}
                        >
                          {busyId === mod.id ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          disabled={busyId === mod.id}
                          onClick={() => reject(mod.id)}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
