export function safeDivide(numerator: number, denominator: number) {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  return numerator / denominator;
}

export function laborCost(hours: number, internalRate: number) {
  return hours * internalRate;
}

export function additionalSupportCharge(billableHours: number, hourlyRate: number) {
  return billableHours * hourlyRate;
}

export function billableCost(internalCost: number, markupPct: number) {
  return internalCost * (1 + markupPct);
}

export function hoursRemaining(included: number, used: number) {
  return included - used;
}

export function usagePercentage(used: number, included: number) {
  if (!included) return used > 0 ? 100 : 0;
  return (used / included) * 100;
}

export function usageStatus(pct: number): "normal" | "warning" | "over_limit" {
  if (pct >= 100) return "over_limit";
  if (pct >= 80) return "warning";
  return "normal";
}

export function grossProfit(revenue: number, directCost: number) {
  return revenue - directCost;
}

export function grossMarginPct(revenue: number, directCost: number) {
  if (!revenue) return 0;
  return ((revenue - directCost) / revenue) * 100;
}

export function remainingBalance(invoiceTotal: number, amountPaid: number) {
  return invoiceTotal - amountPaid;
}

export const AR_AGING_BUCKETS = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", ">90 Days"] as const;

export type ArAgingBucketLabel = (typeof AR_AGING_BUCKETS)[number];

export function isSevereAgingBucket(label: string) {
  return label === "61-90 Days" || label === ">90 Days";
}

export function arAgingBucket(dueDate: string | Date, asOf: Date = new Date()): ArAgingBucketLabel {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const days = Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return ">90 Days";
}

export function slaStatus(
  targetAt: string | null | undefined,
  actualAt: string | null | undefined,
  now: Date = new Date()
): "met" | "at_risk" | "missed" | "pending" {
  if (!targetAt) return "pending";
  const target = new Date(targetAt);
  if (actualAt) {
    return new Date(actualAt) <= target ? "met" : "missed";
  }
  const hoursLeft = (target.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return "missed";
  if (hoursLeft <= 4) return "at_risk";
  return "pending";
}

export function marginBand(marginPct: number): "profitable" | "low_margin" | "unprofitable" {
  if (marginPct < 0) return "unprofitable";
  if (marginPct < 15) return "low_margin";
  return "profitable";
}
