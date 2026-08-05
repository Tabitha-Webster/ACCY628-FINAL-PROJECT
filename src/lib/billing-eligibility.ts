export const ONE_TIME_BILLING_SOURCES = ["time_entry", "direct_cost", "project", "milestone"] as const;

export function isApprovedForBilling(status: string | null | undefined) {
  return status === "approved" || status === "not_required";
}

export function isOpenBillingStatus(status: string | null | undefined) {
  return status === "unbilled" || status === "ready" || status == null;
}

export function isBillableTimeClassification(classification: string | null | undefined) {
  return classification === "billable" || classification === "out_of_scope";
}

export function timeEntryBillingBlockReason(entry: {
  classification: string;
  approval_status: string;
  billing_status: string;
  work_date?: string;
}) {
  const label = entry.work_date ? `Time entry on ${entry.work_date}` : "Time entry";
  if (!isBillableTimeClassification(entry.classification)) {
    return `${label} is not classified as billable.`;
  }
  if (!isApprovedForBilling(entry.approval_status)) {
    return `${label} is not approved for billing.`;
  }
  if (!isOpenBillingStatus(entry.billing_status)) {
    return `${label} has already been billed.`;
  }
  return null;
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
  if (["pending", "rejected"].includes(project.customer_approval_status ?? "")) {
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
