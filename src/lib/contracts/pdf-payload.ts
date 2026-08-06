import type { Contract } from "@/lib/types";
import type { ContractFormValues } from "./validation";
import type { ContractPdfInput } from "./signature-packets";

type PdfContract = ContractPdfInput["contract"];

function numOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numOrZero(value: string) {
  return Number(value || 0);
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Map live form values into the PDF contract payload (keeps generated PDFs in sync with edits). */
export function pdfContractFromFormValues(
  values: ContractFormValues,
  statusOverride?: Contract["status"]
): PdfContract {
  return {
    contract_number: values.contract_number,
    name: values.name,
    status: (statusOverride ?? values.status) as Contract["status"],
    contract_type: values.contract_type as Contract["contract_type"],
    start_date: values.start_date,
    end_date: nullable(values.end_date),
    effective_date: nullable(values.effective_date) ?? values.start_date,
    monthly_recurring_fee: numOrZero(values.monthly_recurring_fee),
    one_time_setup_fee: numOrZero(values.one_time_setup_fee),
    included_hours_per_month: numOrZero(values.included_hours_per_month),
    additional_hourly_rate: numOrZero(values.additional_hourly_rate),
    overages_allowed: values.overages_allowed,
    payment_terms: nullable(values.payment_terms),
    billing_frequency: (nullable(values.billing_frequency) as Contract["billing_frequency"]) ?? null,
    billing_method: nullable(values.billing_method),
    billing_contact: nullable(values.billing_contact),
    renewal_type: (values.renewal_type || null) as Contract["renewal_type"],
    renewal_terms: nullable(values.renewal_terms),
    cancellation_terms: nullable(values.cancellation_terms),
    cancellation_notice_days: numOrNull(values.cancellation_notice_days),
    sla_response_hours: numOrNull(values.sla_response_hours),
    sla_resolution_hours: numOrNull(values.sla_resolution_hours),
    sla_critical_response_hours: numOrNull(values.sla_critical_response_hours),
    sla_high_response_hours: numOrNull(values.sla_high_response_hours),
    sla_medium_response_hours: numOrNull(values.sla_medium_response_hours),
    sla_low_response_hours: numOrNull(values.sla_low_response_hours),
    description: nullable(values.description),
    scope: nullable(values.scope),
    included_services: nullable(values.included_services),
    excluded_services: nullable(values.excluded_services),
    supported_locations: nullable(values.supported_locations),
    supported_users_devices: nullable(values.supported_users_devices),
    after_hours_terms: nullable(values.after_hours_terms),
    work_location: (nullable(values.work_location) as Contract["work_location"]) ?? null,
  };
}

/** Map a saved contract row into the PDF contract payload. */
export function pdfContractFromRow(
  contract: Partial<Contract> &
    Pick<
      Contract,
      | "contract_number"
      | "name"
      | "status"
      | "contract_type"
      | "start_date"
      | "monthly_recurring_fee"
      | "included_hours_per_month"
      | "additional_hourly_rate"
    >
): PdfContract {
  return {
    contract_number: contract.contract_number,
    name: contract.name,
    status: contract.status,
    contract_type: contract.contract_type,
    start_date: contract.start_date,
    end_date: contract.end_date ?? null,
    effective_date: contract.effective_date ?? contract.start_date,
    monthly_recurring_fee: Number(contract.monthly_recurring_fee ?? 0),
    one_time_setup_fee: Number(contract.one_time_setup_fee ?? 0),
    included_hours_per_month: Number(contract.included_hours_per_month ?? 0),
    additional_hourly_rate: Number(contract.additional_hourly_rate ?? 0),
    overages_allowed: contract.overages_allowed ?? true,
    payment_terms: contract.payment_terms ?? null,
    billing_frequency: contract.billing_frequency ?? null,
    billing_method: contract.billing_method ?? null,
    billing_contact: contract.billing_contact ?? null,
    renewal_type: contract.renewal_type ?? null,
    renewal_terms: contract.renewal_terms ?? null,
    cancellation_terms: contract.cancellation_terms ?? null,
    cancellation_notice_days: contract.cancellation_notice_days ?? null,
    sla_response_hours: contract.sla_response_hours ?? null,
    sla_resolution_hours: contract.sla_resolution_hours ?? null,
    sla_critical_response_hours: contract.sla_critical_response_hours ?? null,
    sla_high_response_hours: contract.sla_high_response_hours ?? null,
    sla_medium_response_hours: contract.sla_medium_response_hours ?? null,
    sla_low_response_hours: contract.sla_low_response_hours ?? null,
    description: contract.description ?? null,
    scope: contract.scope ?? null,
    included_services: contract.included_services ?? null,
    excluded_services: contract.excluded_services ?? null,
    supported_locations: contract.supported_locations ?? null,
    supported_users_devices: contract.supported_users_devices ?? null,
    after_hours_terms: contract.after_hours_terms ?? null,
    work_location: contract.work_location ?? null,
  };
}
