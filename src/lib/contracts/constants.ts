import type {
  BillingFrequency,
  BillingTiming,
  ContractStatus,
  ContractType,
  RenewalType,
} from "@/lib/types";

/** Full contract lifecycle statuses (matches Supabase contract_status enum). */
export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "draft",
  "pending_approval",
  "active",
  "on_hold",
  "expired",
  "canceled",
  "renewed",
] as const;

export const CONTRACT_TYPES: readonly ContractType[] = [
  "managed_support",
  "included_hours",
  "unlimited_remote",
  "project_only",
  "managed_plus_project",
  "pass_through",
] as const;

export const RENEWAL_TYPES: readonly RenewalType[] = ["auto", "manual", "none"] as const;

export const BILLING_FREQUENCIES: readonly BillingFrequency[] = [
  "monthly",
  "quarterly",
  "annual",
  "one_time",
] as const;

export const BILLING_TIMINGS: readonly BillingTiming[] = ["in_advance", "in_arrears"] as const;

/** Days before end_date used for renewal / expiry warnings. */
export const CONTRACT_EXPIRY_WARNING_DAYS = 60;

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  active: "Active",
  on_hold: "On Hold",
  expired: "Expired",
  canceled: "Canceled",
  renewed: "Renewed",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  managed_support: "Managed Support",
  included_hours: "Included Hours",
  unlimited_remote: "Unlimited Remote",
  project_only: "Project Only",
  managed_plus_project: "Managed + Project",
  pass_through: "Pass-Through",
};

/** Integration touchpoints for billing, customers, technicians, and reporting. */
export const CONTRACT_INTEGRATION_POINTS = {
  customers: {
    description: "Each contract belongs to one customer (customer_id).",
    routes: ["/customers", "/customers/[id]"],
  },
  billing: {
    description: "Recurring fees, payment terms, and rates feed Ready to Bill and invoices.",
    routes: ["/ready-to-bill", "/invoices", "/payments", "/accounts-receivable"],
    fields: [
      "monthly_recurring_fee",
      "billing_frequency",
      "billing_timing",
      "payment_terms",
      "additional_hourly_rate",
      "deposit_amount",
    ],
  },
  technicians: {
    description: "Active contracts scope tickets, time entries, and included-hour usage.",
    routes: ["/tickets", "/time-costs", "/operations", "/service-usage"],
    fields: ["included_hours_per_month", "sla_response_hours", "sla_resolution_hours", "scope"],
  },
  reporting: {
    description: "Contract status and fees roll into dashboard, profitability, and controls.",
    routes: ["/dashboard", "/profitability", "/controls"],
  },
} as const;
