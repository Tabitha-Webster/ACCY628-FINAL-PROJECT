import type { BillingStatus, ContractStatus, ContractType, RenewalType } from "@/lib/types";
import { CONTRACT_STATUSES, CONTRACT_TYPES, RENEWAL_TYPES } from "./constants";
import {
  CONTRACT_BILLING_STATUSES,
  defaultNextInvoiceDate,
} from "./billing";

export type ContractFormValues = {
  contract_number: string;
  name: string;
  description: string;
  customer_id: string;
  assigned_manager_id: string;
  sales_representative_id: string;
  contract_type: ContractType | string;
  status: ContractStatus | string;
  start_date: string;
  end_date: string;
  effective_date: string;
  signed_date: string;
  renewal_type: RenewalType | string;
  renewal_terms: string;
  cancellation_terms: string;
  cancellation_notice_days: string;
  monthly_recurring_fee: string;
  one_time_setup_fee: string;
  included_hours_per_month: string;
  additional_hourly_rate: string;
  overages_allowed: boolean;
  overage_charges: string;
  billing_frequency: string;
  billing_method: string;
  billing_timing: string;
  payment_terms: string;
  next_invoice_date: string;
  last_invoice_date: string;
  billing_status: string;
  included_services: string;
  excluded_services: string;
  supported_locations: string;
  supported_users_devices: string;
  sla_critical_response_hours: string;
  sla_high_response_hours: string;
  sla_medium_response_hours: string;
  sla_low_response_hours: string;
  sla_response_hours: string;
  sla_resolution_hours: string;
};

export type ContractFormFieldErrors = Partial<Record<keyof ContractFormValues, string>>;

export type ContractFormValidationResult = {
  ok: boolean;
  fieldErrors: ContractFormFieldErrors;
  formError: string | null;
};

const REQUIRED_FIELDS: Array<keyof ContractFormValues> = [
  "contract_number",
  "name",
  "customer_id",
  "contract_type",
  "status",
  "start_date",
  "monthly_recurring_fee",
  "included_hours_per_month",
];

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function emptyContractFormValues(overrides?: Partial<ContractFormValues>): ContractFormValues {
  return {
    contract_number: "",
    name: "",
    description: "",
    customer_id: "",
    assigned_manager_id: "",
    sales_representative_id: "",
    contract_type: "managed_support",
    status: "draft",
    start_date: "",
    end_date: "",
    effective_date: "",
    signed_date: "",
    renewal_type: "manual",
    renewal_terms: "",
    cancellation_terms: "",
    cancellation_notice_days: "30",
    monthly_recurring_fee: "0",
    one_time_setup_fee: "0",
    included_hours_per_month: "0",
    additional_hourly_rate: "0",
    overages_allowed: true,
    overage_charges: "0",
    billing_frequency: "monthly",
    billing_method: "invoice",
    billing_timing: "in_advance",
    payment_terms: "Net 30",
    next_invoice_date: "",
    last_invoice_date: "",
    billing_status: "unbilled",
    included_services: "",
    excluded_services: "",
    supported_locations: "",
    supported_users_devices: "",
    sla_critical_response_hours: "",
    sla_high_response_hours: "",
    sla_medium_response_hours: "",
    sla_low_response_hours: "",
    sla_response_hours: "",
    sla_resolution_hours: "",
    ...overrides,
  };
}

/** Validate form values before insert/update. Uniqueness and customer existence are async checks. */
export function validateContractFormValues(
  values: ContractFormValues,
  options?: {
    customerExists?: boolean | null;
    contractNumberUnique?: boolean | null;
  }
): ContractFormValidationResult {
  const fieldErrors: ContractFormFieldErrors = {};

  for (const field of REQUIRED_FIELDS) {
    const value = values[field];
    if (typeof value === "string" && !value.trim()) {
      fieldErrors[field] = "This field is required.";
    }
  }

  if (values.contract_type && !CONTRACT_TYPES.includes(values.contract_type as ContractType)) {
    // allow existing custom types already in DB; only hard-fail if empty (handled above)
  }
  if (values.status && !CONTRACT_STATUSES.includes(values.status as ContractStatus)) {
    fieldErrors.status = "Select a valid status.";
  }
  if (values.renewal_type && !RENEWAL_TYPES.includes(values.renewal_type as RenewalType)) {
    fieldErrors.renewal_type = "Select a valid renewal type.";
  }

  if (values.start_date && values.end_date) {
    const start = new Date(values.start_date);
    const end = new Date(values.end_date);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      fieldErrors.end_date = "End date cannot be before start date.";
    }
  }

  const monthlyFee = parseNumber(values.monthly_recurring_fee);
  if (monthlyFee == null) {
    fieldErrors.monthly_recurring_fee = "Enter a valid monthly fee.";
  } else if (monthlyFee < 0) {
    fieldErrors.monthly_recurring_fee = "Monthly fee cannot be negative.";
  }

  const includedHours = parseNumber(values.included_hours_per_month);
  if (includedHours == null) {
    fieldErrors.included_hours_per_month = "Enter valid support hours.";
  } else if (includedHours < 0) {
    fieldErrors.included_hours_per_month = "Support hours cannot be negative.";
  }

  const setupFee = parseNumber(values.one_time_setup_fee);
  if (values.one_time_setup_fee.trim() !== "" && (setupFee == null || setupFee < 0)) {
    fieldErrors.one_time_setup_fee = "Setup fee cannot be negative.";
  }

  const hourlyRate = parseNumber(values.additional_hourly_rate);
  if (values.overages_allowed) {
    if (hourlyRate == null) {
      fieldErrors.additional_hourly_rate = "Hourly rate is required when overages are allowed.";
    } else if (hourlyRate <= 0) {
      fieldErrors.additional_hourly_rate = "Hourly rate must be greater than zero if overages are allowed.";
    }
  } else if (hourlyRate != null && hourlyRate < 0) {
    fieldErrors.additional_hourly_rate = "Hourly rate cannot be negative.";
  }

  const overageCharges = parseNumber(values.overage_charges);
  if (values.overage_charges.trim() !== "" && (overageCharges == null || overageCharges < 0)) {
    fieldErrors.overage_charges = "Overage charges cannot be negative.";
  }

  if (
    values.billing_status &&
    !CONTRACT_BILLING_STATUSES.includes(values.billing_status as BillingStatus)
  ) {
    fieldErrors.billing_status = "Select a valid billing status.";
  }

  if (options?.customerExists === false) {
    fieldErrors.customer_id = "Customer must exist before creating a contract.";
  }
  if (options?.contractNumberUnique === false) {
    fieldErrors.contract_number = "Contract number must be unique.";
  }

  const keys = Object.keys(fieldErrors);
  return {
    ok: keys.length === 0,
    fieldErrors,
    formError: keys.length
      ? "Please fix the highlighted validation errors before saving."
      : null,
  };
}

export function contractFormToPayload(
  values: ContractFormValues,
  profileId: string,
  mode: "create" | "edit"
) {
  const nullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };
  const numOrZero = (value: string) => Number(value || 0);
  const numOrNull = (value: string) => {
    if (value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const payload: Record<string, unknown> = {
    contract_number: values.contract_number.trim(),
    name: values.name.trim(),
    description: nullable(values.description),
    customer_id: values.customer_id,
    assigned_manager_id: nullable(values.assigned_manager_id),
    sales_representative_id: nullable(values.sales_representative_id),
    contract_type: values.contract_type,
    status: values.status,
    start_date: values.start_date,
    end_date: nullable(values.end_date),
    effective_date: nullable(values.effective_date) ?? values.start_date,
    signed_date: nullable(values.signed_date),
    renewal_type: values.renewal_type || "manual",
    renewal_terms: nullable(values.renewal_terms),
    cancellation_terms: nullable(values.cancellation_terms),
    cancellation_notice_days: numOrNull(values.cancellation_notice_days),
    monthly_recurring_fee: numOrZero(values.monthly_recurring_fee),
    one_time_setup_fee: numOrZero(values.one_time_setup_fee),
    included_hours_per_month: numOrZero(values.included_hours_per_month),
    additional_hourly_rate: values.overages_allowed
      ? numOrZero(values.additional_hourly_rate)
      : 0,
    overages_allowed: values.overages_allowed,
    overage_charges: numOrZero(values.overage_charges),
    billing_frequency: nullable(values.billing_frequency),
    billing_method: nullable(values.billing_method),
    billing_timing: nullable(values.billing_timing),
    payment_terms: nullable(values.payment_terms),
    next_invoice_date:
      nullable(values.next_invoice_date) ??
      defaultNextInvoiceDate({
        startDate: values.start_date,
        effectiveDate: values.effective_date || values.start_date,
        billingFrequency: values.billing_frequency || "monthly",
        billingTiming: values.billing_timing || "in_advance",
      }),
    last_invoice_date: nullable(values.last_invoice_date),
    billing_status: (values.billing_status || "unbilled") as BillingStatus,
    included_services: nullable(values.included_services),
    excluded_services: nullable(values.excluded_services),
    supported_locations: nullable(values.supported_locations),
    supported_users_devices: nullable(values.supported_users_devices),
    sla_critical_response_hours: numOrNull(values.sla_critical_response_hours),
    sla_high_response_hours: numOrNull(values.sla_high_response_hours),
    sla_medium_response_hours: numOrNull(values.sla_medium_response_hours),
    sla_low_response_hours: numOrNull(values.sla_low_response_hours),
    sla_response_hours: numOrNull(values.sla_response_hours),
    sla_resolution_hours: numOrNull(values.sla_resolution_hours),
    updated_by: profileId,
    updated_at: new Date().toISOString(),
  };

  if (mode === "create") {
    payload.created_by = profileId;
  }

  return payload;
}

export function suggestNextContractNumber(existingNumbers: string[]): string {
  let max = 1000;
  for (const raw of existingNumbers) {
    const match = /^CTR-(\d+)$/i.exec(raw.trim());
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `CTR-${max + 1}`;
}
