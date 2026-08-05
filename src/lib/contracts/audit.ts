import type { ContractFormValues } from "./validation";

export const CONTRACT_DOCUMENT_TYPES = [
  { value: "signed_contract", label: "Signed Contract" },
  { value: "amendment", label: "Amendment" },
  { value: "sow", label: "Statement of Work (SOW)" },
  { value: "other", label: "Other" },
] as const;

export const CONTRACT_CHANGE_FIELD_LABELS: Record<string, string> = {
  contract_number: "Contract number",
  name: "Contract name",
  description: "Description / notes",
  customer_id: "Customer",
  assigned_manager_id: "Account manager",
  sales_representative_id: "Sales representative",
  contract_type: "Contract type",
  status: "Status",
  start_date: "Start date",
  end_date: "End date",
  effective_date: "Effective date",
  signed_date: "Signed date",
  renewal_type: "Renewal type",
  renewal_terms: "Renewal terms",
  cancellation_terms: "Cancellation terms",
  cancellation_notice_days: "Notice period",
  monthly_recurring_fee: "Monthly recurring fee",
  one_time_setup_fee: "One-time setup fee",
  included_hours_per_month: "Included support hours",
  additional_hourly_rate: "Additional hourly rate",
  overages_allowed: "Allow overage billing",
  billing_frequency: "Billing frequency",
  billing_method: "Billing method",
  billing_timing: "Billing timing",
  payment_terms: "Invoice / payment terms",
  included_services: "Covered services",
  excluded_services: "Excluded services",
  supported_locations: "Covered sites / locations",
  supported_users_devices: "Covered devices / users",
  sla_critical_response_hours: "SLA Critical",
  sla_high_response_hours: "SLA High",
  sla_medium_response_hours: "SLA Medium",
  sla_low_response_hours: "SLA Low",
  sla_response_hours: "Default response SLA",
  sla_resolution_hours: "Resolution SLA",
};

const TRACKED_FIELDS: Array<keyof ContractFormValues> = [
  "contract_number",
  "name",
  "description",
  "customer_id",
  "assigned_manager_id",
  "sales_representative_id",
  "contract_type",
  "status",
  "start_date",
  "end_date",
  "effective_date",
  "signed_date",
  "renewal_type",
  "renewal_terms",
  "cancellation_terms",
  "cancellation_notice_days",
  "monthly_recurring_fee",
  "one_time_setup_fee",
  "included_hours_per_month",
  "additional_hourly_rate",
  "overages_allowed",
  "billing_frequency",
  "billing_method",
  "billing_timing",
  "payment_terms",
  "included_services",
  "excluded_services",
  "supported_locations",
  "supported_users_devices",
  "sla_critical_response_hours",
  "sla_high_response_hours",
  "sla_medium_response_hours",
  "sla_low_response_hours",
  "sla_response_hours",
  "sla_resolution_hours",
];

function normalizeValue(value: ContractFormValues[keyof ContractFormValues]): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "").trim();
}

export type ContractFieldChange = {
  field_name: string;
  previous_value: string;
  new_value: string;
};

/** Diff form values for the contract change audit trail. */
export function diffContractFormValues(
  before: ContractFormValues,
  after: ContractFormValues
): ContractFieldChange[] {
  const changes: ContractFieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    const previous_value = normalizeValue(before[field]);
    const new_value = normalizeValue(after[field]);
    if (previous_value !== new_value) {
      changes.push({
        field_name: field,
        previous_value,
        new_value,
      });
    }
  }
  return changes;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
