import type { ContractStatus, ProjectStatus, TicketStatus } from "@/lib/types";

/** Ticket statuses that still block contract completion. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
] as const;

/** Project statuses treated as finished delivery. */
export const COMPLETED_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "completed",
  "billed",
  "closed",
  "canceled",
] as const;

export function isOpenTicketStatus(status: string): boolean {
  return (OPEN_TICKET_STATUSES as readonly string[]).includes(status);
}

export function isIncompleteProjectStatus(status: string): boolean {
  return !(COMPLETED_PROJECT_STATUSES as readonly string[]).includes(status);
}

export type ContractDeliveryWorkSummary = {
  openTicketCount: number;
  totalTicketCount: number;
  incompleteProjectCount: number;
  totalProjectCount: number;
};

/** Whether Mark Completed (active/on_hold → expired) is allowed. */
export function canMarkContractCompleted(
  status: ContractStatus,
  work: ContractDeliveryWorkSummary
): { ok: boolean; reason: string | null } {
  if (status !== "active" && status !== "on_hold") {
    return {
      ok: false,
      reason: "Only active or on-hold contracts can be marked completed.",
    };
  }
  if (work.openTicketCount > 0) {
    return {
      ok: false,
      reason: `${work.openTicketCount} open ticket${work.openTicketCount === 1 ? "" : "s"} still linked to this contract.`,
    };
  }
  if (work.incompleteProjectCount > 0) {
    return {
      ok: false,
      reason: `${work.incompleteProjectCount} incomplete project${work.incompleteProjectCount === 1 ? "" : "s"} still linked to this contract.`,
    };
  }
  if (work.totalTicketCount === 0 && work.totalProjectCount === 0) {
    return {
      ok: true,
      reason: null,
    };
  }
  return { ok: true, reason: null };
}

export function ticketProgressPercent(status: string): number {
  switch (status) {
    case "new":
      return 0;
    case "assigned":
      return 25;
    case "in_progress":
      return 50;
    case "waiting_on_customer":
    case "waiting_on_approval":
      return 75;
    case "resolved":
    case "closed":
      return 100;
    case "canceled":
      return 100;
    default:
      return 0;
  }
}
