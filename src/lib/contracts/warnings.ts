import type { Contract, ContractStatus } from "@/lib/types";
import { CONTRACT_EXPIRY_WARNING_DAYS } from "./constants";
import { getContractRenewalDate } from "./dates";

export type ContractWarning = {
  code:
    | "ends_soon"
    | "past_end_date"
    | "renewal_soon"
    | "missing_payment_terms"
    | "missing_billing_frequency";
  label: string;
};

export type ContractHighlight = "none" | "ends_soon" | "renewal_soon" | "past_end_date";

type WarningInput = Pick<
  Contract,
  "status" | "end_date" | "payment_terms" | "billing_frequency" | "renewal_type"
>;

function daysUntil(dateValue: string | null | undefined, now: Date): number | null {
  if (!dateValue) return null;
  const endMs = new Date(dateValue).getTime();
  if (Number.isNaN(endMs)) return null;
  return Math.ceil((endMs - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Control / exception flags for the contracts list and future reporting.
 */
export function getContractWarnings(
  contract: WarningInput,
  now: Date = new Date()
): ContractWarning[] {
  const warnings: ContractWarning[] = [];
  const windowDays = CONTRACT_EXPIRY_WARNING_DAYS;
  const endDays = daysUntil(contract.end_date, now);
  const renewalDate = getContractRenewalDate(contract);
  const renewalDays = daysUntil(renewalDate, now);

  if (contract.status === "active" && endDays != null) {
    if (endDays < 0) {
      warnings.push({ code: "past_end_date", label: "Past end date" });
    } else if (endDays <= windowDays) {
      warnings.push({
        code: "ends_soon",
        label: `Expires in ${endDays} day${endDays === 1 ? "" : "s"}`,
      });
    }
  }

  if (
    contract.status === "active" &&
    renewalDays != null &&
    renewalDays >= 0 &&
    renewalDays <= windowDays
  ) {
    if (!warnings.some((w) => w.code === "ends_soon")) {
      warnings.push({
        code: "renewal_soon",
        label: `Renewal in ${renewalDays} day${renewalDays === 1 ? "" : "s"}`,
      });
    } else {
      warnings.push({
        code: "renewal_soon",
        label: "Renewal window open",
      });
    }
  }

  if (!contract.payment_terms) {
    warnings.push({ code: "missing_payment_terms", label: "Missing payment terms" });
  }
  if (!contract.billing_frequency) {
    warnings.push({ code: "missing_billing_frequency", label: "Missing billing frequency" });
  }

  return warnings;
}

/** Row highlight priority for contracts nearing expiration or renewal. */
export function getContractHighlight(
  contract: WarningInput,
  now: Date = new Date()
): ContractHighlight {
  const warnings = getContractWarnings(contract, now);
  if (warnings.some((w) => w.code === "past_end_date")) return "past_end_date";
  if (warnings.some((w) => w.code === "ends_soon")) return "ends_soon";
  if (warnings.some((w) => w.code === "renewal_soon")) return "renewal_soon";
  return "none";
}

export function contractHighlightClass(highlight: ContractHighlight): string {
  if (highlight === "past_end_date") return "bg-error/10";
  if (highlight === "ends_soon") return "bg-warning/15";
  if (highlight === "renewal_soon") return "bg-info/10";
  return "";
}

export function summarizeContractsByStatus(
  contracts: Array<{ status: ContractStatus }>
): Record<ContractStatus, number> {
  const counts = {
    draft: 0,
    pending_approval: 0,
    active: 0,
    on_hold: 0,
    expired: 0,
    canceled: 0,
    renewed: 0,
  } satisfies Record<ContractStatus, number>;

  for (const contract of contracts) {
    if (contract.status in counts) {
      counts[contract.status] += 1;
    }
  }
  return counts;
}
