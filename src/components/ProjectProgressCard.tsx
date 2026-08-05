import Link from "next/link";
import { DateText, Hours, Money, StatusBadge } from "@/components/ui";
import type { ApprovalStatus, ProjectStatus } from "@/lib/types";

export type ProgressMilestone = {
  id: string;
  name: string;
  completed: boolean;
  approval_status: ApprovalStatus | null;
  due_date: string | null;
};

export type ProgressContract = {
  id: string;
  name: string;
  contract_number: string;
  contract_type?: string | null;
  included_hours_per_month?: number | null;
  additional_hourly_rate?: number | null;
  change_request_procedure?: string | null;
};

type Props = {
  projectName?: string;
  status: ProjectStatus | string;
  startDate: string | null;
  targetCompletionDate: string | null;
  projectManagerName: string | null;
  milestones: ProgressMilestone[];
  contract?: ProgressContract | null;
  laborHours?: number;
  materialsCost?: number;
  pendingChangeRequests?: number;
  pendingRequestedHours?: number;
  pendingRequestedPrice?: number;
  compact?: boolean;
  showMilestoneList?: boolean;
};

function completionPercent(status: string, milestones: ProgressMilestone[]): number {
  if (milestones.length > 0) {
    const done = milestones.filter((m) => m.completed).length;
    return Math.round((done / milestones.length) * 100);
  }
  switch (status) {
    case "proposed":
      return 5;
    case "awaiting_customer_approval":
      return 15;
    case "approved":
      return 25;
    case "in_progress":
      return 55;
    case "completed":
    case "billed":
      return 90;
    case "closed":
      return 100;
    case "canceled":
      return 0;
    default:
      return 0;
  }
}

function barTone(pct: number, status: string) {
  if (status === "canceled") return "progress-error";
  if (pct >= 100 || status === "closed" || status === "completed") return "progress-success";
  if (pct >= 50) return "progress-primary";
  if (pct > 0) return "progress-warning";
  return "progress-primary";
}

export function ProjectProgressCard({
  projectName,
  status,
  startDate,
  targetCompletionDate,
  projectManagerName,
  milestones,
  contract,
  laborHours = 0,
  materialsCost = 0,
  pendingChangeRequests = 0,
  pendingRequestedHours = 0,
  pendingRequestedPrice = 0,
  compact = false,
  showMilestoneList = true,
}: Props) {
  const completedCount = milestones.filter((m) => m.completed).length;
  const pct = completionPercent(status, milestones);
  const tone = barTone(pct, status);

  if (compact) {
    return (
      <div className="min-w-[7rem]">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
          <span>
            {milestones.length > 0 ? `${completedCount}/${milestones.length}` : `${pct}%`}
          </span>
          <span>{pct}%</span>
        </div>
        <progress className={`progress ${tone} h-2 w-full`} value={pct} max={100} />
      </div>
    );
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          {projectName ? <h3 className="text-sm font-semibold">{projectName}</h3> : null}
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">Completion</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{pct}%</p>
          <p className="text-xs opacity-60">
            {milestones.length > 0
              ? `${completedCount} of ${milestones.length} milestones`
              : "Status-based estimate"}
          </p>
        </div>
      </div>

      <progress className={`progress ${tone} h-3 w-full`} value={pct} max={100} aria-label={`Project ${pct}% complete`} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60">Start Date</p>
          <p className="font-medium">{startDate ? <DateText value={startDate} /> : "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60">Target End</p>
          <p className="font-medium">
            {targetCompletionDate ? <DateText value={targetCompletionDate} /> : "—"}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs uppercase tracking-wide opacity-60">Project Manager</p>
          <p className="font-medium">{projectManagerName ?? "Unassigned"}</p>
        </div>
      </div>

      {contract ? (
        <div className="mt-4 rounded-lg border border-base-300 bg-base-200/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide opacity-60">Contract Requirements</p>
            <Link href={`/contracts/${contract.id}`} className="link link-hover text-xs">
              {contract.contract_number}
            </Link>
          </div>
          <p className="mt-1 text-sm font-medium">{contract.name}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-80">
            {contract.contract_type ? <span className="badge badge-ghost badge-sm">{contract.contract_type}</span> : null}
            {contract.included_hours_per_month != null ? (
              <span className="badge badge-ghost badge-sm">{contract.included_hours_per_month} included hrs/mo</span>
            ) : null}
            {contract.additional_hourly_rate != null ? (
              <span className="badge badge-ghost badge-sm">
                Extra @ <Money value={Number(contract.additional_hourly_rate)} />/hr
              </span>
            ) : null}
          </div>
          {contract.change_request_procedure ? (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed opacity-70">{contract.change_request_procedure}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-base-300 p-2">
          <p className="text-[10px] uppercase tracking-wide opacity-60">Time Logged</p>
          <p className="font-semibold">
            <Hours value={laborHours} />
          </p>
        </div>
        <div className="rounded-lg border border-base-300 p-2">
          <p className="text-[10px] uppercase tracking-wide opacity-60">Materials</p>
          <p className="font-semibold">
            <Money value={materialsCost} />
          </p>
        </div>
        <div className="rounded-lg border border-base-300 p-2">
          <p className="text-[10px] uppercase tracking-wide opacity-60">Out of Scope</p>
          <p className="font-semibold tabular-nums">{pendingChangeRequests} open</p>
        </div>
      </div>

      {(pendingRequestedHours > 0 || pendingRequestedPrice > 0 || pendingChangeRequests > 0) ? (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-warning">Pending requested additions</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide opacity-60">Additional hours</p>
              <p className="font-semibold">
                <Hours value={pendingRequestedHours} />
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide opacity-60">Additional price</p>
              <p className="font-semibold">
                <Money value={pendingRequestedPrice} />
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showMilestoneList && milestones.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Milestone Tracking</p>
          <ul className="space-y-2">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg border border-base-300 px-3 py-2">
                <div className="min-w-0">
                  <p className={`text-sm ${m.completed ? "opacity-60 line-through" : "font-medium"}`}>{m.name}</p>
                  <p className="text-xs opacity-60">Due {m.due_date ? <DateText value={m.due_date} /> : "—"}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={m.completed ? "completed" : "in_progress"} />
                  {m.approval_status ? <StatusBadge status={m.approval_status} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Compact progress for table cells — pure presentational helper using same math. */
export function projectCompletionPercent(status: string, completedMilestones: number, totalMilestones: number) {
  if (totalMilestones > 0) return Math.round((completedMilestones / totalMilestones) * 100);
  return completionPercent(status, []);
}
