"use client";

import { StatusBadge } from "@/components/ui";
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, type ContractStatus } from "@/lib/contracts";

type Props = {
  selectedStatus: ContractStatus | null;
  onSelectStatus: (status: ContractStatus | null) => void;
};

export function ContractStatusLegend({ selectedStatus, onSelectStatus }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      aria-label="Contract status filters"
      role="group"
    >
      <span className="font-medium opacity-60">Status:</span>
      {CONTRACT_STATUSES.map((status) => {
        const selected = selectedStatus === status;
        return (
          <button
            key={status}
            type="button"
            className={`rounded-full transition ${
              selected ? "ring-2 ring-primary ring-offset-1 ring-offset-base-100" : "hover:opacity-90"
            }`}
            aria-pressed={selected}
            title={
              selected
                ? `Showing ${CONTRACT_STATUS_LABELS[status]} — click to clear filter`
                : `Filter by ${CONTRACT_STATUS_LABELS[status]}`
            }
            onClick={() => onSelectStatus(selected ? null : status)}
          >
            <StatusBadge
              status={status}
              label={CONTRACT_STATUS_LABELS[status]}
              className="badge-sm pointer-events-none h-5 min-h-5 px-1.5 text-[0.65rem] font-medium"
            />
          </button>
        );
      })}
      {selectedStatus ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs opacity-70"
          onClick={() => onSelectStatus(null)}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
