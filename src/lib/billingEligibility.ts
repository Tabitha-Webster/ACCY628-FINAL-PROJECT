/**
 * Ticket ↔ billing eligibility helpers (mirrors DB predicates / views).
 * Source of truth for Ready to Bill ticket work: v_ticket_time_ready_to_bill /
 * v_ticket_cost_ready_to_bill and time_entry_ticket_billing_eligible().
 */

export type TicketBillingTimeRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  contract_id: string | null;
  contract_name: string | null;
  support_ticket_id: string | null;
  ticket_number: string | null;
  technician_name: string | null;
  work_date: string;
  hours_worked: number;
  billing_rate: number | null;
  description: string;
  work_category: string | null;
  amount: number;
  approval_status: string;
  billing_status: string;
};

export type TicketBillingCostRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  contract_id: string | null;
  contract_name: string | null;
  support_ticket_id: string | null;
  ticket_number: string | null;
  technician_name: string | null;
  cost_date: string;
  cost_category: string;
  vendor: string | null;
  description: string;
  amount: number;
  approval_status: string;
  billing_status: string;
};

/** Human-readable eligibility rules for UI copy. */
export const TICKET_BILLING_ELIGIBILITY_RULES = [
  "Ticket is resolved/closed, or the work has explicit billing approval",
  "Completion notes and a work description exist",
  "Classification is billable (out-of-scope requires manager approval first)",
  "Entry is not already billed (no invoice link)",
  "Contract covers the work date and is not canceled",
  "Customer, contract, ticket, and technician links are present",
] as const;
