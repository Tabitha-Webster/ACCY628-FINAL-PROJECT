"use client";

import { EmptyState } from "@/components/ui";
import { formatDateTime, statusLabel } from "@/lib/format";
import {
  CONTRACT_CHANGE_FIELD_LABELS,
  isContractMajorTermField,
  unwrapProfile,
} from "@/lib/contracts";
import type { ContractChange } from "@/lib/types";

export type ContractChangeRow = ContractChange & {
  changed_by_profile?: { full_name: string } | { full_name: string }[] | null;
};

export function ContractChangesPanel({ changes }: { changes: ContractChangeRow[] }) {
  if (changes.length === 0) {
    return (
      <EmptyState
        title="No contract changes recorded"
        description="Edits made through the contract form are logged here with previous values, user, date, and reason. Major commercial terms are highlighted."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-box border border-base-300">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Field</th>
            <th>Previous value</th>
            <th>New value</th>
            <th>Changed</th>
            <th>User</th>
            <th>Reason</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const user = unwrapProfile(change.changed_by_profile)?.full_name ?? "—";
            const fieldLabel =
              CONTRACT_CHANGE_FIELD_LABELS[change.field_name] ?? statusLabel(change.field_name);
            const major = isContractMajorTermField(change.field_name);
            return (
              <tr key={change.id} className={major ? "bg-base-200/60" : undefined}>
                <td className="font-medium">
                  {fieldLabel}
                  {major ? (
                    <span className="badge badge-ghost badge-xs ml-2 align-middle">Major</span>
                  ) : null}
                </td>
                <td
                  className="max-w-[14rem] truncate text-xs opacity-80"
                  title={change.previous_value ?? ""}
                >
                  {change.previous_value || "—"}
                </td>
                <td className="max-w-[14rem] truncate text-xs" title={change.new_value ?? ""}>
                  {change.new_value || "—"}
                </td>
                <td className="whitespace-nowrap text-xs">{formatDateTime(change.changed_at)}</td>
                <td className="text-xs">{user}</td>
                <td className="max-w-[16rem] text-xs">{change.change_reason}</td>
                <td className="text-xs opacity-60">{statusLabel(change.source)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
