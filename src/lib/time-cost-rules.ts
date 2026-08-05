import {
  DAILY_HOUR_LIMIT,
  LARGE_COST_THRESHOLD,
  LATE_ENTRY_DAYS,
} from "@/lib/time-cost-config";

export type ValidationIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

export function validateHoursWorked(hoursWorked: number): ValidationIssue | null {
  if (!Number.isFinite(hoursWorked) || hoursWorked <= 0) {
    return {
      code: "hours_invalid",
      message: "Hours worked must be greater than 0.",
      blocking: true,
    };
  }
  return null;
}

export function excessiveDailyHoursWarning(
  existingDailyHours: number,
  newHours: number,
  dailyLimit: number = DAILY_HOUR_LIMIT
): ValidationIssue | null {
  const total = existingDailyHours + newHours;
  if (total > dailyLimit) {
    return {
      code: "excessive_daily_hours",
      message: `This would bring the technician to ${total} hours on this date (limit ${dailyLimit}). Continue anyway? The entry will be flagged for unusual hours.`,
      blocking: false,
    };
  }
  return null;
}

export function requireContract(contractId: string | null | undefined): ValidationIssue | null {
  if (!contractId) {
    return {
      code: "contract_required",
      message: "Please select a contract. Every cost must connect to a contract.",
      blocking: true,
    };
  }
  return null;
}

/** Days between costDate (YYYY-MM-DD) and asOf; positive means costDate is in the past. */
export function daysLate(costDate: string, asOf: Date = new Date()): number {
  const cost = new Date(`${costDate}T00:00:00`);
  if (Number.isNaN(cost.getTime())) return 0;
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const diffMs = today.getTime() - cost.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function lateCostEntryWarning(
  costDate: string,
  lateAfterDays: number = LATE_ENTRY_DAYS,
  asOf: Date = new Date()
): ValidationIssue | null {
  const lateBy = daysLate(costDate, asOf);
  if (lateBy > lateAfterDays) {
    return {
      code: "late_cost_entry",
      message: `This cost is dated ${lateBy} days ago (late after ${lateAfterDays} days). It will be flagged as a late entry. Continue anyway?`,
      blocking: false,
    };
  }
  return null;
}

export function isLateCostEntry(
  costDate: string,
  lateAfterDays: number = LATE_ENTRY_DAYS,
  asOf: Date = new Date()
): boolean {
  return daysLate(costDate, asOf) > lateAfterDays;
}

export function largeCostRequiresApproval(
  internalCost: number,
  threshold: number = LARGE_COST_THRESHOLD
): ValidationIssue | null {
  if (Number.isFinite(internalCost) && internalCost >= threshold) {
    return {
      code: "large_cost_approval",
      message: `$${internalCost.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })} meets or exceeds the $${threshold.toLocaleString("en-US")} manager-approval threshold. It will go to the manager, then billing for final approval. Continue?`,
      blocking: false,
    };
  }
  return null;
}

export function requiresLargeCostApproval(
  internalCost: number,
  threshold: number = LARGE_COST_THRESHOLD
): boolean {
  return Number.isFinite(internalCost) && internalCost >= threshold;
}

/** Manager review only for large costs or flagged (late / after invoice) entries. */
export function needsManagerCostReview(input: {
  internalCost: number;
  lateEntry: boolean;
  enteredAfterInvoice: boolean;
  threshold?: number;
}): boolean {
  return (
    requiresLargeCostApproval(input.internalCost, input.threshold) ||
    input.lateEntry ||
    input.enteredAfterInvoice
  );
}

export type ExistingTimeEntryLite = {
  support_ticket_id: string | null;
  project_id: string | null;
  hours_worked: number;
  description: string | null;
};

/**
 * Soft warning when another entry already exists for the same tech/date
 * and the same ticket or project (optional hours match within 0.25).
 */
export function duplicateTimeEntryWarning(
  existing: ExistingTimeEntryLite[],
  candidate: {
    supportTicketId: string | null;
    projectId: string | null;
    hoursWorked: number;
  }
): ValidationIssue | null {
  const match = existing.find((row) => {
    const sameTicket =
      candidate.supportTicketId &&
      row.support_ticket_id &&
      row.support_ticket_id === candidate.supportTicketId;
    const sameProject =
      candidate.projectId && row.project_id && row.project_id === candidate.projectId;
    if (!sameTicket && !sameProject) return false;
    const hoursClose = Math.abs(Number(row.hours_worked ?? 0) - candidate.hoursWorked) < 0.25;
    return hoursClose || sameTicket || sameProject;
  });

  if (!match) return null;

  const where =
    match.support_ticket_id && candidate.supportTicketId === match.support_ticket_id
      ? "ticket"
      : "project";

  return {
    code: "duplicate_time_entry",
    message: `A time entry already exists for this ${where} on this date (${Number(
      match.hours_worked
    )} hrs). This may be a duplicate. Continue anyway?`,
    blocking: false,
  };
}
