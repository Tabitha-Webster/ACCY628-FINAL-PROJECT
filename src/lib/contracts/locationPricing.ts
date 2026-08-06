import type { WorkLocation } from "@/lib/types";

/** Remote is cheaper (no travel); on-site includes a travel premium. */
export const WORK_LOCATIONS: readonly WorkLocation[] = ["remote", "on_site"] as const;

export const WORK_LOCATION_LABELS: Record<WorkLocation, string> = {
  remote: "Remote",
  on_site: "On-site",
};

/** Multipliers applied to base MRR and overage hourly rate. */
export const WORK_LOCATION_FEE_MULTIPLIERS: Record<WorkLocation, number> = {
  remote: 0.92, // 8% less than base
  on_site: 1.15, // 15% more than base (travel)
};

export function isWorkLocation(value: string | null | undefined): value is WorkLocation {
  return value === "remote" || value === "on_site";
}

/** Legacy / unset contracts keep a 1.0 multiplier so existing fees are unchanged. */
export function workLocationFeeMultiplier(location: string | null | undefined): number {
  if (!isWorkLocation(location)) return 1;
  return WORK_LOCATION_FEE_MULTIPLIERS[location];
}

export function workLocationAdjustmentLabel(location: string | null | undefined): string {
  if (location === "remote") return "Remote (−8% vs base — no travel)";
  if (location === "on_site") return "On-site (+15% vs base — travel to customer site)";
  return "No location adjustment";
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Location-adjusted billed amount from a stored base fee. */
export function locationAdjustedAmount(
  baseAmount: number | null | undefined,
  workLocation: string | null | undefined
): number {
  return roundMoney(Number(baseAmount ?? 0) * workLocationFeeMultiplier(workLocation));
}

export function billedMonthlyRecurringFee(contract: {
  monthly_recurring_fee?: number | null;
  work_location?: string | null;
}): number {
  return locationAdjustedAmount(contract.monthly_recurring_fee, contract.work_location);
}

export function billedHourlyRate(contract: {
  additional_hourly_rate?: number | null;
  work_location?: string | null;
}): number {
  return locationAdjustedAmount(contract.additional_hourly_rate, contract.work_location);
}
