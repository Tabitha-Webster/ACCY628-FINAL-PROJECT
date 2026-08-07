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

/** Selectable covered services for new/edit contract coverage. */
export const CONTRACT_COVERED_SERVICE_OPTIONS = [
  "Help desk / service desk support",
  "Remote monitoring and management (RMM)",
  "Patch management",
  "Antivirus / endpoint protection",
  "Backup monitoring and restore assistance",
  "Network monitoring",
  "On-site break/fix support",
  "User onboarding and offboarding",
  "Password resets and account administration",
  "Email / Microsoft 365 administration",
  "Vendor coordination",
  "Quarterly business / IT reviews",
  "Documentation and runbooks",
  "Workstation setup and imaging",
] as const;

/** Selectable excluded services for new/edit contract coverage. */
export const CONTRACT_EXCLUDED_SERVICE_OPTIONS = [
  "New hardware purchases",
  "Structured cabling / physical installs",
  "After-hours emergency response (unless approved)",
  "Application development / custom software",
  "Major project work (migrations, refreshes)",
  "Third-party SaaS licensing costs",
  "Printer / MFP hardware repair",
  "Training beyond standard end-user guidance",
  "Construction / move support",
  "Security audits and penetration testing",
  "Data recovery from failed backups",
  "Line-of-business application customization",
] as const;

/** Longest window used for list filters and expiry highlighting. */
export const CONTRACT_EXPIRY_WARNING_DAYS = 90;

/** Automatic renewal reminder thresholds (days before renewal/end date). */
export const RENEWAL_REMINDER_DAYS = [90, 60, 30] as const;

export type RenewalReminderDays = (typeof RENEWAL_REMINDER_DAYS)[number];

export const RENEWAL_REMINDER_KIND_BY_DAYS: Record<
  RenewalReminderDays,
  "renewal_90" | "renewal_60" | "renewal_30"
> = {
  90: "renewal_90",
  60: "renewal_60",
  30: "renewal_30",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  pending_approval: "Awaiting Approval",
  active: "Active",
  on_hold: "Suspended",
  expired: "Completed",
  canceled: "Cancelled",
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

/** Short explanations shown next to each contract type on New/Edit Contract. */
export const CONTRACT_TYPE_DESCRIPTIONS: Record<ContractType, string> = {
  managed_support:
    "Ongoing IT support for a fixed monthly fee. Covers day-to-day help desk, monitoring, and maintenance under an agreed scope and SLA.",
  included_hours:
    "A monthly block of support hours is included. Time beyond the block can be billed as overages if allowed on the contract.",
  unlimited_remote:
    "Remote support without a hard hourly cap. Best for customers who need frequent remote help desk and administration.",
  project_only:
    "Scoped project work (migrations, installs, refreshes) billed as a project rather than recurring managed support.",
  managed_plus_project:
    "Combines a recurring managed-support agreement with one or more defined project deliverables under the same contract.",
  pass_through:
    "Vendor or third-party costs (software, hardware, licensing) billed through to the customer, often with an agreed markup.",
};

export function isKnownContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

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
      "work_location",
      "billing_frequency",
      "billing_timing",
      "billing_method",
      "payment_terms",
      "included_hours_per_month",
      "additional_hourly_rate",
      "overages_allowed",
      "overage_charges",
      "next_invoice_date",
      "last_invoice_date",
      "billing_status",
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
