import type { Contract, ContractStatus } from "@/lib/types";
import { CONTRACT_EXPIRY_WARNING_DAYS } from "./constants";

export type ContractWarning = {
  code: "ends_soon" | "past_end_date" | "missing_payment_terms" | "missing_billing_frequency";
  label: string;
};

type WarningInput = Pick<
  Contract,
  "status" | "end_date" | "payment_terms" | "billing_frequency"
>;

/**
 * Control / exception flags for the contracts list and future reporting.
 */
export function getContractWarnings(
  contract: WarningInput,
  now: Date = new Date()
): ContractWarning[] {
  const warnings: ContractWarning[] = [];
  const nowMs = now.getTime();
  const windowMs = CONTRACT_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

  if (contract.status === "active" && contract.end_date) {
    const endMs = new Date(contract.end_date).getTime();
    if (!Number.isNaN(endMs)) {
      const remaining = endMs - nowMs;
      if (remaining <= windowMs && remaining >= 0) {
        warnings.push({
          code: "ends_soon",
          label: `Ends within ${CONTRACT_EXPIRY_WARNING_DAYS} days`,
        });
      } else if (remaining < 0) {
        warnings.push({ code: "past_end_date", label: "Past end date" });
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
