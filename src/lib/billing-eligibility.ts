export const ONE_TIME_BILLING_SOURCES = ["time_entry", "direct_cost", "project", "milestone"] as const;

export function isApprovedForBilling(status: string | null | undefined) {
  return status === "approved" || status === "not_required";
}

export function isOpenBillingStatus(status: string | null | undefined) {
  return status === "unbilled" || status === "ready" || status == null;
}

export function isTimeEntryAlreadyInvoiced(entry: {
  billing_status?: string | null;
  invoice_id?: string | null;
  invoice_line_item_id?: string | null;
  billed_at?: string | null;
}) {
  return (
    entry.billing_status === "billed" ||
    entry.billing_status === "excluded" ||
    Boolean(entry.invoice_id) ||
    Boolean(entry.invoice_line_item_id) ||
    Boolean(entry.billed_at)
  );
}

export function isBillableTimeClassification(classification: string | null | undefined) {
  return classification === "billable" || classification === "out_of_scope";
}

export function timeEntryBillingBlockReason(entry: {
  classification: string;
  approval_status: string;
  billing_status: string;
  work_date?: string;
  invoice_id?: string | null;
  invoice_line_item_id?: string | null;
  billed_at?: string | null;
}) {
  const label = entry.work_date ? `Time entry on ${entry.work_date}` : "Time entry";
  if (!isBillableTimeClassification(entry.classification)) {
    return `${label} is not classified as billable.`;
  }
  // Out-of-scope / additional work must be explicitly approved before invoicing.
  if (entry.classification === "out_of_scope" && entry.approval_status !== "approved") {
    return `${label} is out-of-scope additional work and is not approved for billing.`;
  }
  if (!isApprovedForBilling(entry.approval_status)) {
    return `${label} is not approved for billing.`;
  }
  if (isTimeEntryAlreadyInvoiced(entry) || !isOpenBillingStatus(entry.billing_status)) {
    return `${label} has already been invoiced.`;
  }
  return null;
}

/** Blocks invoicing when a linked additional-work / change request is still pending. */
export function pendingAdditionalWorkBlockReason(opts: {
  hasPendingAdditionalWork: boolean;
  contextLabel: string;
}) {
  if (!opts.hasPendingAdditionalWork) return null;
  return `${opts.contextLabel} has unapproved additional work and cannot be invoiced yet.`;
}

/**
 * Project OOS / change requests need manager + customer approval before billing.
 * Ticket-only rows with customer_approval_status = not_required only need manager approval.
 */
export function isAdditionalWorkBlockingBilling(request: {
  approval_status?: string | null;
  customer_approval_status?: string | null;
  project_id?: string | null;
}) {
  if (request.approval_status === "rejected" || request.customer_approval_status === "rejected") {
    return false; // rejected work should not bill; other gates handle classification
  }
  if (request.approval_status !== "approved") return true;
  const customer = request.customer_approval_status ?? (request.project_id ? "pending" : "not_required");
  return customer !== "approved" && customer !== "not_required";
}

export function directCostBillingBlockReason(cost: {
  description?: string | null;
  approval_status: string;
  billing_status: string;
}) {
  const label = cost.description ? `Direct cost "${cost.description}"` : "Direct cost";
  if (cost.approval_status !== "approved") {
    return `${label} is not approved for billing.`;
  }
  if (!isOpenBillingStatus(cost.billing_status)) {
    return `${label} has already been billed.`;
  }
  return null;
}

export function projectBillingBlockReason(project: {
  name?: string | null;
  status: string;
  billing_status?: string | null;
  customer_approval_status?: string | null;
}) {
  const label = project.name ? `Project "${project.name}"` : "Project";
  if (
    project.status === "awaiting_customer_approval" ||
    ["pending", "rejected"].includes(project.customer_approval_status ?? "")
  ) {
    return `${label} is not approved for billing.`;
  }
  if (!["completed", "approved"].includes(project.status)) {
    return `${label} is not completed or approved for billing.`;
  }
  if (!isOpenBillingStatus(project.billing_status)) {
    return `${label} has already been billed.`;
  }
  return null;
}

export function milestoneBillingBlockReason(milestone: {
  name?: string | null;
  completed?: boolean | null;
  approval_status?: string | null;
  billing_status?: string | null;
}) {
  const label = milestone.name ? `Milestone "${milestone.name}"` : "Milestone";
  if (!milestone.completed) return `${label} is not completed.`;
  if (!isApprovedForBilling(milestone.approval_status)) {
    return `${label} is not approved for billing.`;
  }
  if (!isOpenBillingStatus(milestone.billing_status)) {
    return `${label} has already been billed.`;
  }
  return null;
}

export function hasDuplicateIds(ids: string[]) {
  return new Set(ids).size !== ids.length;
}
