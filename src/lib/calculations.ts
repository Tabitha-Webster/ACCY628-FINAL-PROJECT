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

export function arAgingBucket(dueDate: string | Date, asOf: Date = new Date()) {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const days = Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 Days Past Due";
  if (days <= 60) return "31–60 Days Past Due";
  if (days <= 90) return "61–90 Days Past Due";
  return "More Than 90 Days Past Due";
}

/** @deprecated Prefer evaluateSlaClock / evaluateTicketSla from '@/lib/sla' (80% At Risk rule). */
export { slaStatus, evaluateTicketSla, evaluateSlaClock } from "@/lib/sla";

export function marginBand(marginPct: number): "profitable" | "low_margin" | "unprofitable" {
  if (marginPct < 0) return "unprofitable";
  if (marginPct < 15) return "low_margin";
  return "profitable";
}
