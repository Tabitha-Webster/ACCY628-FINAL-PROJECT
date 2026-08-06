import type { BillingStatus, ContractStatus, ContractType, RenewalType, WorkLocation } from "@/lib/types";
import { CONTRACT_STATUSES, CONTRACT_TYPES, RENEWAL_TYPES } from "./constants";
import {
  CONTRACT_BILLING_STATUSES,
  defaultNextInvoiceDate,
} from "./billing";
import { isWorkLocation } from "./locationPricing";

export type ContractFormValues = {
  contract_number: string;
  name: string;
  description: string;
  customer_id: string;
  assigned_manager_id: string;
  assigned_technician_id: string;
  sales_representative_id: string;
  billing_contact: string;
  scope: string;
  contract_type: ContractType | string;
  status: ContractStatus | string;
  work_location: WorkLocation | string;
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
  deposit_amount: string;
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
  software_markup_pct: string;
  equipment_markup_pct: string;
  reimbursable_cost_policy: string;
  included_services: string;
  excluded_services: string;
  supported_locations: string;
  supported_users_devices: string;
  remote_support: boolean;
  onsite_support: boolean;
  after_hours_terms: string;
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
  "work_location",
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
    assigned_technician_id: "",
    sales_representative_id: "",
    billing_contact: "",
    scope: "",
    contract_type: "managed_support",
    status: "draft",
    work_location: "remote",
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
    deposit_amount: "0",
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
    software_markup_pct: "",
    equipment_markup_pct: "",
    reimbursable_cost_policy: "",
    included_services: "",
    excluded_services: "",
    supported_locations: "",
    supported_users_devices: "",
    remote_support: true,
    onsite_support: true,
    after_hours_terms: "",
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
  if (values.work_location && !isWorkLocation(values.work_location)) {
    fieldErrors.work_location = "Select remote or on-site.";
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

  const deposit = parseNumber(values.deposit_amount);
  if (values.deposit_amount.trim() !== "" && (deposit == null || deposit < 0)) {
    fieldErrors.deposit_amount = "Deposit cannot be negative.";
  }

  const softwareMarkup = parseNumber(values.software_markup_pct);
  if (
    values.software_markup_pct.trim() !== "" &&
    (softwareMarkup == null || softwareMarkup < 0)
  ) {
    fieldErrors.software_markup_pct = "Software markup cannot be negative.";
  }

  const equipmentMarkup = parseNumber(values.equipment_markup_pct);
  if (
    values.equipment_markup_pct.trim() !== "" &&
    (equipmentMarkup == null || equipmentMarkup < 0)
  ) {
    fieldErrors.equipment_markup_pct = "Equipment markup cannot be negative.";
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

/** Minimal checks for saving an incomplete manager draft (not ready for executive). */
export function validateContractDraftValues(
  values: ContractFormValues,
  options?: {
    customerExists?: boolean | null;
    contractNumberUnique?: boolean | null;
  }
): ContractFormValidationResult {
  const fieldErrors: ContractFormFieldErrors = {};

  if (!values.contract_number.trim()) {
    fieldErrors.contract_number = "Enter a contract number to save a draft.";
  }
  if (!values.customer_id.trim()) {
    fieldErrors.customer_id = "Select or create a customer to save a draft.";
  }
  if (values.work_location && !isWorkLocation(values.work_location)) {
    fieldErrors.work_location = "Select remote or on-site.";
  }
  if (values.start_date && values.end_date) {
    const start = new Date(values.start_date);
    const end = new Date(values.end_date);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
      fieldErrors.end_date = "End date cannot be before start date.";
    }
  }
  if (options?.customerExists === false) {
    fieldErrors.customer_id = "Customer must exist before saving a draft.";
  }
  if (options?.contractNumberUnique === false) {
    fieldErrors.contract_number = "Contract number must be unique.";
  }

  const keys = Object.keys(fieldErrors);
  return {
    ok: keys.length === 0,
    fieldErrors,
    formError: keys.length
      ? "Please fix the highlighted fields before saving the draft."
      : null,
  };
}

const CREATE_STEP_DETAILS_FIELDS: Array<keyof ContractFormValues> = [
  "contract_number",
  "name",
  "contract_type",
  "work_location",
  "start_date",
];

const CREATE_STEP_BILLING_FIELDS: Array<keyof ContractFormValues> = [
  "monthly_recurring_fee",
  "included_hours_per_month",
];

/** Per-step checks for the new-contract wizard (create mode only). */
export function validateCreateContractStep(
  step: 0 | 1 | 2,
  values: ContractFormValues,
  options?: {
    customerSource?: "existing" | "new";
    newCustomerName?: string;
    customerExists?: boolean | null;
    contractNumberUnique?: boolean | null;
  }
): ContractFormValidationResult {
  const fieldErrors: ContractFormFieldErrors = {};

  if (step === 0) {
    for (const field of CREATE_STEP_DETAILS_FIELDS) {
      const value = values[field];
      if (typeof value === "string" && !value.trim()) {
        fieldErrors[field] = "This field is required.";
      }
    }
    if (options?.customerSource === "new") {
      if (!options.newCustomerName?.trim()) {
        fieldErrors.customer_id = "Enter a customer name.";
      }
    } else if (!values.customer_id.trim()) {
      fieldErrors.customer_id = "This field is required.";
    }
    if (values.work_location && !isWorkLocation(values.work_location)) {
      fieldErrors.work_location = "Select remote or on-site.";
    }
    if (values.start_date && values.end_date) {
      const start = new Date(values.start_date);
      const end = new Date(values.end_date);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
        fieldErrors.end_date = "End date cannot be before start date.";
      }
    }
    if (options?.customerExists === false) {
      fieldErrors.customer_id = "Selected customer was not found.";
    }
    if (options?.contractNumberUnique === false) {
      fieldErrors.contract_number = "Contract number must be unique.";
    }
  }

  if (step === 1) {
    for (const field of CREATE_STEP_BILLING_FIELDS) {
      const value = values[field];
      if (typeof value === "string" && !value.trim()) {
        fieldErrors[field] = "This field is required.";
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
    const hourlyRate = parseNumber(values.additional_hourly_rate);
    if (values.overages_allowed) {
      if (hourlyRate == null) {
        fieldErrors.additional_hourly_rate = "Hourly rate is required when overages are allowed.";
      } else if (hourlyRate <= 0) {
        fieldErrors.additional_hourly_rate =
          "Hourly rate must be greater than zero if overages are allowed.";
      }
    }
  }

  // Step 2 (coverage) has no hard-required fields.

  const keys = Object.keys(fieldErrors);
  return {
    ok: keys.length === 0,
    fieldErrors,
    formError: keys.length ? "Complete the required fields before continuing." : null,
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
    assigned_technician_id: nullable(values.assigned_technician_id),
    sales_representative_id: nullable(values.sales_representative_id),
    billing_contact: nullable(values.billing_contact),
    scope: nullable(values.scope),
    contract_type: values.contract_type,
    status: values.status,
    work_location: isWorkLocation(values.work_location) ? values.work_location : "remote",
    remote_support: values.work_location === "remote",
    onsite_support: values.work_location === "on_site",
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
    deposit_amount: numOrZero(values.deposit_amount),
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
    software_markup_pct: numOrNull(values.software_markup_pct),
    equipment_markup_pct: numOrNull(values.equipment_markup_pct),
    reimbursable_cost_policy: nullable(values.reimbursable_cost_policy),
    included_services: nullable(values.included_services),
    excluded_services: nullable(values.excluded_services),
    supported_locations: nullable(values.supported_locations),
    supported_users_devices: nullable(values.supported_users_devices),
    after_hours_terms: nullable(values.after_hours_terms),
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

export function suggestNextContractNumber(
  existingNumbers: string[],
  prefix = "CTR-",
  nextSequence = 1001
): string {
  let max = nextSequence - 1;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(\\d+)$`, "i");
  for (const raw of existingNumbers) {
    const match = re.exec(raw.trim());
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `${prefix}${Math.max(max + 1, nextSequence)}`;
}
