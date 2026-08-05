import { hoursRemaining, usagePercentage, usageStatus } from "@/lib/calculations";

export type TimeHourRow = {
  hours_worked: number | string;
  classification: string;
  approval_status: string;
};

export type MonthlyUsage = {
  includedHours: number;
  includedHoursUsed: number;
  approvedBillableHours: number;
  unapprovedHours: number;
  hoursUsed: number;
  hoursRemaining: number;
  overageHours: number;
  usagePercent: number;
  usageStatus: "normal" | "warning" | "over_limit";
  additionalHourlyRate: number;
  overageCharge: number;
  monthlyFee: number;
};

export function currentBillingPeriod(now = new Date()) {
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

export function computeMonthlyUsage(
  entries: TimeHourRow[],
  includedHours: number,
  additionalHourlyRate: number,
  monthlyFee: number
): MonthlyUsage {
  let includedHoursUsed = 0;
  let approvedBillableHours = 0;
  let unapprovedHours = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours_worked ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;

    if (entry.classification === "included") {
      includedHoursUsed += hours;
      continue;
    }

    if (entry.classification === "billable" && ["approved", "not_required"].includes(entry.approval_status)) {
      approvedBillableHours += hours;
      continue;
    }

    if (["billable", "out_of_scope"].includes(entry.classification) && entry.approval_status === "pending") {
      unapprovedHours += hours;
    }
  }

  const hoursUsed = includedHoursUsed + approvedBillableHours;
  const overageHours =
    includedHours > 0 ? Math.max(0, hoursUsed - includedHours) : approvedBillableHours;
  const includedHoursConsumed = includedHours > 0 ? Math.min(hoursUsed, includedHours) : 0;
  const remaining = includedHours > 0 ? Math.max(0, hoursRemaining(includedHours, hoursUsed)) : 0;
  const pct = usagePercentage(hoursUsed, includedHours);

  return {
    includedHours,
    includedHoursUsed: round2(includedHoursConsumed),
    approvedBillableHours: round2(approvedBillableHours),
    unapprovedHours: round2(unapprovedHours),
    hoursUsed: round2(hoursUsed),
    hoursRemaining: round2(remaining),
    overageHours: round2(overageHours),
    usagePercent: round2(pct),
    usageStatus: usageStatus(pct),
    additionalHourlyRate,
    overageCharge: round2(overageHours * additionalHourlyRate),
    monthlyFee: round2(monthlyFee),
  };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineSourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "recurring":
      return "Monthly contract charge";
    case "hours_included":
      return "Included support hours";
    case "overage":
      return "Overage hours";
    case "project":
      return "Project charge";
    case "milestone":
      return "Project milestone";
    case "direct_cost":
      return "Equipment / software / reimbursable";
    case "time_entry":
      return "Support time";
    default:
      return sourceType ? sourceType.replace(/_/g, " ") : "Other";
  }
}
