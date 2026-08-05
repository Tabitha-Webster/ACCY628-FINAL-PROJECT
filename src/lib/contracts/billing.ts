import type {
  BillingFrequency,
  BillingStatus,
  BillingTiming,
  Contract,
} from "@/lib/types";

/** Canonical contract terms consumed by Ready to Bill / invoice generation. */
export type ContractBillingTerms = {
  contractId: string;
  customerId: string;
  /** Monthly recurring revenue (MRR). */
  monthlyRecurringRevenue: number;
  billingFrequency: BillingFrequency | string | null;
  billingMethod: string | null;
  billingTiming: BillingTiming | string | null;
  /** Invoice / payment terms (e.g. Net 30). */
  invoiceTerms: string | null;
  includedSupportHours: number;
  overageHourlyRate: number;
  overagesAllowed: boolean;
  /** Accrued unbilled overage charges. */
  overageCharges: number;
  nextInvoiceDate: string | null;
  lastInvoiceDate: string | null;
  billingStatus: BillingStatus | string | null;
  oneTimeSetupFee: number;
  depositAmount: number;
  lateFeeTerms: string | null;
  taxStatus: string | null;
  softwareMarkupPct: number | null;
  equipmentMarkupPct: number | null;
  reimbursableCostPolicy: string | null;
  billingContact: string | null;
};

export type ContractBillingInput = Pick<
  Contract,
  | "id"
  | "customer_id"
  | "monthly_recurring_fee"
  | "billing_frequency"
  | "billing_method"
  | "billing_timing"
  | "payment_terms"
  | "included_hours_per_month"
  | "additional_hourly_rate"
  | "overages_allowed"
  | "overage_charges"
  | "next_invoice_date"
  | "last_invoice_date"
  | "billing_status"
  | "one_time_setup_fee"
  | "deposit_amount"
  | "late_fee_terms"
  | "tax_status"
  | "software_markup_pct"
  | "equipment_markup_pct"
  | "reimbursable_cost_policy"
  | "billing_contact"
  | "start_date"
  | "effective_date"
  | "status"
>;

/** Columns required for future contract-to-cash calculations. */
export const CONTRACT_BILLING_SELECT =
  "id, customer_id, contract_number, name, status, start_date, end_date, effective_date, monthly_recurring_fee, billing_frequency, billing_method, billing_timing, payment_terms, included_hours_per_month, additional_hourly_rate, overages_allowed, overage_charges, next_invoice_date, last_invoice_date, billing_status, one_time_setup_fee, deposit_amount, late_fee_terms, tax_status, software_markup_pct, equipment_markup_pct, reimbursable_cost_policy, billing_contact";

export const CONTRACT_BILLING_STATUSES: readonly BillingStatus[] = [
  "unbilled",
  "ready",
  "billed",
  "excluded",
] as const;

export const CONTRACT_BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  unbilled: "Unbilled",
  ready: "Ready to bill",
  billed: "Billed (current period)",
  excluded: "Excluded from billing",
};

export const BILLING_METHOD_OPTIONS = [
  "invoice",
  "ach",
  "credit_card",
  "wire",
  "check",
] as const;

/**
 * Map a contract row into the billing-terms shape used by invoice / cash workflows.
 */
export function getContractBillingTerms(contract: ContractBillingInput): ContractBillingTerms {
  const overageRate = Number(contract.additional_hourly_rate ?? 0);
  const overagesAllowed =
    contract.overages_allowed ?? overageRate > 0;

  return {
    contractId: contract.id,
    customerId: contract.customer_id,
    monthlyRecurringRevenue: Number(contract.monthly_recurring_fee ?? 0),
    billingFrequency: contract.billing_frequency,
    billingMethod: contract.billing_method,
    billingTiming: contract.billing_timing,
    invoiceTerms: contract.payment_terms,
    includedSupportHours: Number(contract.included_hours_per_month ?? 0),
    overageHourlyRate: overageRate,
    overagesAllowed: Boolean(overagesAllowed),
    overageCharges: Number(contract.overage_charges ?? 0),
    nextInvoiceDate: contract.next_invoice_date,
    lastInvoiceDate: contract.last_invoice_date,
    billingStatus: contract.billing_status,
    oneTimeSetupFee: Number(contract.one_time_setup_fee ?? 0),
    depositAmount: Number(contract.deposit_amount ?? 0),
    lateFeeTerms: contract.late_fee_terms,
    taxStatus: contract.tax_status,
    softwareMarkupPct: contract.software_markup_pct,
    equipmentMarkupPct: contract.equipment_markup_pct,
    reimbursableCostPolicy: contract.reimbursable_cost_policy,
    billingContact: contract.billing_contact,
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addMonths(isoDate: string, months: number): string {
  const d = startOfDay(new Date(isoDate));
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp end-of-month overflow (e.g. Jan 31 + 1 month)
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return toIsoDate(d);
}

/** Months between recurring invoices based on billing frequency. */
export function billingFrequencyMonths(frequency: string | null | undefined): number | null {
  switch ((frequency ?? "monthly").toLowerCase()) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "annual":
      return 12;
    case "one_time":
      return null;
    default:
      return 1;
  }
}

/**
 * Recurring charge for one billing period (MRR × months in frequency).
 * one_time returns the monthly_recurring_fee as a flat amount when present.
 */
export function recurringAmountForPeriod(
  monthlyRecurringRevenue: number,
  frequency: string | null | undefined
): number {
  const months = billingFrequencyMonths(frequency);
  if (months == null) return Number(monthlyRecurringRevenue ?? 0);
  return Number(monthlyRecurringRevenue ?? 0) * months;
}

/**
 * Advance from a prior invoice (or contract start) to the next invoice date.
 */
export function computeNextInvoiceDate(input: {
  lastInvoiceDate?: string | null;
  startDate?: string | null;
  effectiveDate?: string | null;
  billingFrequency?: string | null;
  now?: Date;
}): string | null {
  const months = billingFrequencyMonths(input.billingFrequency);
  if (months == null) return null;

  const anchor =
    input.lastInvoiceDate ||
    input.effectiveDate ||
    input.startDate ||
    toIsoDate(input.now ?? new Date());

  let next = addMonths(anchor, months);
  const today = toIsoDate(input.now ?? new Date());

  // If still in the past (e.g. stale last invoice), keep advancing.
  let guard = 0;
  while (next < today && guard < 48) {
    next = addMonths(next, months);
    guard += 1;
  }
  return next;
}

/** Overage hours and dollar charges for a usage period. */
export function calculateOverageCharges(input: {
  hoursUsed: number;
  includedSupportHours: number;
  overageHourlyRate: number;
  overagesAllowed: boolean;
}): { overageHours: number; overageCharges: number } {
  if (!input.overagesAllowed) {
    return { overageHours: 0, overageCharges: 0 };
  }
  const overageHours = Math.max(
    0,
    Number(input.hoursUsed ?? 0) - Number(input.includedSupportHours ?? 0)
  );
  const overageCharges = overageHours * Number(input.overageHourlyRate ?? 0);
  return { overageHours, overageCharges };
}

/** Whether recurring fees on this contract should appear in Ready to Bill. */
export function isContractReadyForRecurringBilling(
  terms: ContractBillingTerms,
  now: Date = new Date()
): boolean {
  if (terms.monthlyRecurringRevenue <= 0) return false;
  if (terms.billingStatus === "excluded" || terms.billingStatus === "billed") return false;
  if (terms.billingStatus === "ready") return true;
  if (!terms.nextInvoiceDate) return terms.billingStatus === "unbilled";
  const today = toIsoDate(now);
  return terms.nextInvoiceDate <= today;
}

/** Suggested default next invoice date when creating/editing a contract. */
export function defaultNextInvoiceDate(input: {
  startDate: string;
  effectiveDate?: string;
  billingFrequency: string;
  billingTiming?: string;
}): string | null {
  const months = billingFrequencyMonths(input.billingFrequency);
  if (months == null) return input.effectiveDate || input.startDate || null;

  const base = input.effectiveDate || input.startDate;
  if (!base) return null;

  if ((input.billingTiming ?? "in_advance").toLowerCase() === "in_advance") {
    return base;
  }
  return addMonths(base, months);
}
