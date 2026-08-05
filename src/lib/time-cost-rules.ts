import { DAILY_HOUR_LIMIT } from "@/lib/time-cost-config";

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
      message: `This would bring the technician to ${total} hours on this date (limit ${dailyLimit}). Continue anyway?`,
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
