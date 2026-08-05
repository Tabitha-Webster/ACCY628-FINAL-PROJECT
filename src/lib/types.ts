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
  contract_type: string;
  start_date: string;
  end_date: string | null;
  assigned_manager_id: string | null;
  description: string | null;
  monthly_recurring_fee: number;
  included_hours_per_month: number;
  additional_hourly_rate: number;
  sla_response_hours: number | null;
  sla_resolution_hours: number | null;
  billing_frequency: string | null;
  payment_terms: string | null;
  created_at: string;
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
  submitted_by: string | null;
  assigned_technician_id: string | null;
  assigned_at: string | null;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  customer_confirmed: boolean | null;
  classification: WorkClassification | null;
  billable_approval_status: ApprovalStatus | null;
  technician_notes: string | null;
  completion_notes: string | null;
  customer_resolution_summary: string | null;
  no_time_explanation: string | null;
  completed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
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
  approved_by: string | null;
  approved_at: string | null;
  invoice_id: string | null;
  invoice_line_item_id: string | null;
  billed_at: string | null;
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
  entered_after_invoice?: boolean;
  approval_status: ApprovalStatus;
  billing_status: BillingStatus;
  approved_by: string | null;
  approved_at: string | null;
  invoice_id: string | null;
  invoice_line_item_id: string | null;
  billed_at: string | null;
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
