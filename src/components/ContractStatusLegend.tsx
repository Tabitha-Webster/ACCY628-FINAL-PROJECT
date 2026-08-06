import { StatusBadge } from "@/components/ui";
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS } from "@/lib/contracts";

export function ContractStatusLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-label="Contract status color legend"
    >
      <span className="font-medium opacity-60">Status:</span>
      {CONTRACT_STATUSES.map((status) => (
        <StatusBadge
          key={status}
          status={status}
          label={CONTRACT_STATUS_LABELS[status]}
          className="badge-sm h-5 min-h-5 px-1.5 text-[0.65rem] font-medium"
        />
      ))}
    </div>
  );
}
