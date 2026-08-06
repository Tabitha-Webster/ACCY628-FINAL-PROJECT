import type { Contract, ContractStatus } from "@/lib/types";
import { CONTRACT_EXPIRY_WARNING_DAYS, RENEWAL_REMINDER_DAYS } from "./constants";
import { getContractRenewalDate } from "./dates";
import { daysUntilDate, isRenewableContract } from "./renewals";

export type ContractWarning = {
  code:
    | "ends_soon"
    | "past_end_date"
    | "renewal_soon"
    | "renewal_90"
    | "renewal_60"
    | "renewal_30"
    | "expiration_warning"
    | "missing_payment_terms"
    | "missing_billing_frequency";
  label: string;
};

export type ContractHighlight =
  | "none"
  | "ends_soon"
  | "renewal_soon"
  | "past_end_date"
  | "renewal_90"
  | "renewal_60"
  | "renewal_30";

type WarningInput = Pick<
  Contract,
  "status" | "end_date" | "payment_terms" | "billing_frequency" | "renewal_type"
>;

/**
 * Control / exception flags for the contracts list and future reporting.
 */
export function getContractWarnings(
  contract: WarningInput,
  now: Date = new Date()
): ContractWarning[] {
  const warnings: ContractWarning[] = [];
  const windowDays = CONTRACT_EXPIRY_WARNING_DAYS;
  const endDays = daysUntilDate(contract.end_date, now);
  const renewalDate = getContractRenewalDate(contract);
  const renewalDays = daysUntilDate(renewalDate, now);

  if (contract.status === "active" && endDays != null) {
    if (endDays < 0) {
      warnings.push({ code: "past_end_date", label: "Past end date" });
    } else if (endDays <= 30) {
      warnings.push({
        code: "expiration_warning",
        label: `Expires in ${endDays} day${endDays === 1 ? "" : "s"}`,
      });
    } else if (endDays <= windowDays) {
      warnings.push({
        code: "ends_soon",
        label: `Expires in ${endDays} day${endDays === 1 ? "" : "s"}`,
      });
    }
  }

  if (
    contract.status === "active" &&
    isRenewableContract(contract) &&
    renewalDays != null &&
    renewalDays >= 0
  ) {
    for (const threshold of RENEWAL_REMINDER_DAYS) {
      if (renewalDays <= threshold) {
        const code =
          threshold === 90 ? "renewal_90" : threshold === 60 ? "renewal_60" : "renewal_30";
        warnings.push({
          code,
          label: `${threshold}-day renewal · ${renewalDays} day${renewalDays === 1 ? "" : "s"} left`,
        });
        warnings.push({
          code: "renewal_soon",
          label: `Renewal in ${renewalDays} day${renewalDays === 1 ? "" : "s"}`,
        });
        break;
      }
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
  if (warnings.some((w) => w.code === "renewal_30" || w.code === "expiration_warning")) {
    return "renewal_30";
  }
  if (warnings.some((w) => w.code === "ends_soon")) return "ends_soon";
  if (warnings.some((w) => w.code === "renewal_60")) return "renewal_60";
  if (warnings.some((w) => w.code === "renewal_90")) return "renewal_90";
  if (warnings.some((w) => w.code === "renewal_soon")) return "renewal_soon";
  return "none";
}

export function contractHighlightClass(highlight: ContractHighlight): string {
  if (highlight === "past_end_date") return "bg-error/10";
  if (highlight === "renewal_30" || highlight === "ends_soon") return "bg-warning/15";
  if (highlight === "renewal_60" || highlight === "renewal_soon") return "bg-info/10";
  if (highlight === "renewal_90") return "bg-base-200";
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
