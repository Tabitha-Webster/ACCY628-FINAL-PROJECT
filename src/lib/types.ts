// Minimal row shapes for the tables used across the (app) pages.
// Mirrors the public schema in Supabase; kept hand-written since no generated
// Database types exist yet in this project.

export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type BillingStatus = "unbilled" | "ready" | "billed" | "excluded";
export type WorkClassification = "included" | "billable" | "out_of_scope";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "waiting_on_customer"
  | "waiting_on_approval"
  | "resolved"
  | "closed"
  | "canceled";
export type ProjectStatus =
  | "proposed"
  | "awaiting_customer_approval"
  | "approved"
  | "in_progress"
  | "completed"
  | "billed"
  | "closed"
  | "canceled";
export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "disputed"
  | "canceled";
export type ContractStatus =
  | "draft"
  | "pending_approval"
  | "active"
  | "on_hold"
  | "expired"
  | "canceled"
  | "renewed";
export type ContractType =
  | "managed_support"
  | "included_hours"
  | "unlimited_remote"
  | "project_only"
  | "managed_plus_project"
  | "pass_through";
export type RenewalType = "auto" | "manual" | "none";
export type BillingFrequency = "monthly" | "quarterly" | "annual" | "one_time";
export type BillingTiming = "in_advance" | "in_arrears";
export type RevenueRecognition = "earned" | "deferred" | "unbilled";
export type RevenueType =
  | "recurring"
  | "additional_support"
  | "project"
  | "software_equipment"
  | "reimbursable";
export type DisputeResolutionStatus = "open" | "under_review" | "resolved" | "rejected";
export type CustomerStatus = "active" | "inactive" | "prospect" | "on_hold";

export type Customer = {
  id: string;
  name: string;
  industry: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  service_address: string | null;
  status: CustomerStatus;
  credit_terms: string | null;
  account_manager_id: string | null;
  notes: string | null;
  created_at: string;
};

export type Contract = {
  id: string;
  customer_id: string;
  contract_number: string;
  name: string;
  status: ContractStatus;
  contract_type: ContractType | string;
  start_date: string;
  end_date: string | null;
  renewal_type: RenewalType | string | null;
  cancellation_notice_days: number | null;
  assigned_manager_id: string | null;
  sales_representative_id: string | null;
  description: string | null;
  scope: string | null;
  monthly_recurring_fee: number;
  one_time_setup_fee: number | null;
  included_hours_per_month: number;
  additional_hourly_rate: number;
  overages_allowed: boolean | null;
  overage_charges: number | null;
  sla_response_hours: number | null;
  sla_resolution_hours: number | null;
  sla_critical_response_hours: number | null;
  sla_high_response_hours: number | null;
  sla_medium_response_hours: number | null;
  sla_low_response_hours: number | null;
  supported_locations: string | null;
  supported_users_devices: string | null;
  remote_support: boolean | null;
  onsite_support: boolean | null;
  after_hours_terms: string | null;
  included_services: string | null;
  excluded_services: string | null;
  billing_frequency: BillingFrequency | string | null;
  billing_timing: BillingTiming | string | null;
  billing_method: string | null;
  payment_terms: string | null;
  next_invoice_date: string | null;
  last_invoice_date: string | null;
  billing_status: BillingStatus | string | null;
  deposit_amount: number | null;
  late_fee_terms: string | null;
  reimbursable_cost_policy: string | null;
  software_markup_pct: number | null;
  equipment_markup_pct: number | null;
  tax_status: string | null;
  billing_contact: string | null;
  change_request_procedure: string | null;
  requires_customer_approval: boolean | null;
  requires_manager_approval: boolean | null;
  effective_date: string | null;
  signed_date: string | null;
  renewal_terms: string | null;
  cancellation_terms: string | null;
  version_number: number | null;
  created_at: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ContractService = {
  id: string;
  contract_id: string;
  service_name: string;
  service_description: string | null;
  is_included: boolean;
  created_at: string;
};

export type ContractModification = {
  id: string;
  contract_id: string;
  modification_summary: string;
  effective_date: string;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
};

export type ContractDocument = {
  id: string;
  contract_id: string;
  document_name: string;
  document_type: string | null;
  storage_path: string | null;
  file_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
  document_group_id: string;
  version_number: number;
  is_current: boolean;
  file_size: number | null;
  mime_type: string | null;
  replace_reason: string | null;
  replaced_at: string | null;
};

export type ContractVersion = {
  id: string;
  contract_id: string;
  version_number: number;
  change_summary: string;
  snapshot: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

export type ContractChange = {
  id: string;
  contract_id: string;
  field_name: string;
  previous_value: string | null;
  new_value: string | null;
  change_reason: string;
  changed_by: string | null;
  changed_at: string;
  source: string;
};

export type ContractRenewalReminderKind =
  | "renewal_90"
  | "renewal_60"
  | "renewal_30"
  | "expiration_warning"
  | "expired";

export type ContractRenewalReminderStatus = "open" | "acknowledged" | "dismissed" | "resolved";

export type ContractRenewalReminder = {
  id: string;
  contract_id: string;
  reminder_kind: ContractRenewalReminderKind;
  anchor_date: string;
  days_before: number;
  status: ContractRenewalReminderStatus;
  message: string;
  generated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type ContractRenewal = {
  id: string;
  contract_id: string;
  previous_start_date: string | null;
  previous_end_date: string | null;
  new_start_date: string;
  new_end_date: string | null;
  renewal_method: "auto" | "manual";
  previous_status: string | null;
  resulting_status: string;
  notes: string | null;
  renewed_by: string | null;
  renewed_at: string;
};

export type SupportTicket = {
  id: string;
  ticket_number: string;
  customer_id: string;
  contract_id: string | null;
  project_id: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  service_category: string | null;
  submitted_at: string;
  assigned_technician_id: string | null;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  customer_confirmed: boolean | null;
  classification: WorkClassification | null;
  billable_approval_status: ApprovalStatus | null;
  technician_notes: string | null;
  customer_resolution_summary: string | null;
  created_at: string;
  created_by: string | null;
};

export type TechnicianAssignment = {
  id: string;
  technician_id: string;
  support_ticket_id: string | null;
  project_id: string | null;
  assigned_at: string;
  due_at: string | null;
  notes: string | null;
};

export type TimeEntry = {
  id: string;
  technician_id: string;
  customer_id: string;
  contract_id: string | null;
  support_ticket_id: string | null;
  project_id: string | null;
  work_date: string;
  hours_worked: number;
  work_category: string | null;
  description: string;
  classification: WorkClassification;
  internal_cost_rate: number;
  billing_rate: number | null;
  labor_cost: number | null;
  approval_status: ApprovalStatus;
  billing_status: BillingStatus;
  submitted_at: string | null;
  created_at: string;
};

export type DirectCost = {
  id: string;
  customer_id: string;
  contract_id: string | null;
  support_ticket_id: string | null;
  project_id: string | null;
  cost_category: string;
  vendor: string | null;
  cost_date: string;
  internal_cost: number;
  markup_pct: number;
  billable_amount: number;
  receipt_reference: string | null;
  description: string;
  entered_by: string | null;
  approval_status: ApprovalStatus;
  billing_status: BillingStatus;
  created_at: string;
};

export type AdditionalWorkRequest = {
  id: string;
  customer_id: string;
  contract_id: string | null;
  support_ticket_id: string | null;
  project_id: string | null;
  requested_by: string;
  title: string;
  description: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
  approval_status: ApprovalStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  customer_id: string;
  contract_id: string | null;
  project_manager_id: string | null;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  target_completion_date: string | null;
  fixed_fee: number | null;
  estimated_billing_amount: number | null;
  estimated_labor_hours: number | null;
  labor_budget: number | null;
  equipment_budget: number | null;
  software_budget: number | null;
  vendor_budget: number | null;
  customer_approval_status: ApprovalStatus | null;
  uses_milestone_billing: boolean | null;
  amount_billed: number | null;
  amount_collected: number | null;
  billing_status: BillingStatus | null;
  description: string | null;
  created_at: string;
};

export type ProjectMilestone = {
  id: string;
  project_id: string;
  name: string;
  amount: number;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  approval_status: ApprovalStatus | null;
  billing_status: BillingStatus | null;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  customer_id: string;
  contract_id: string | null;
  invoice_date: string;
  due_date: string;
  status: InvoiceStatus;
  billing_period_start: string | null;
  billing_period_end: string | null;
  subtotal: number;
  tax_amount: number;
  credits: number;
  total_amount: number;
  amount_paid: number;
  remaining_balance: number;
  dispute_status: boolean;
  notes: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  payment_number: string;
  customer_id: string;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export type Dispute = {
  id: string;
  invoice_id: string;
  customer_id: string;
  dispute_date: string;
  dispute_reason: string;
  disputed_amount: number;
  assigned_owner_id: string | null;
  resolution_status: DisputeResolutionStatus;
  resolution_notes: string | null;
  created_at: string;
};

export type RevenueRecord = {
  id: string;
  customer_id: string;
  contract_id: string | null;
  project_id: string | null;
  period_month: string;
  revenue_type: RevenueType;
  recognition: RevenueRecognition;
  amount: number;
  description: string | null;
  created_at: string;
};
