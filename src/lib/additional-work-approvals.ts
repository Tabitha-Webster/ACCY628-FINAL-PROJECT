/** Dual approval for project out-of-scope / change requests. */

export type AdditionalWorkApprovalFields = {
  approval_status: string | null | undefined;
  customer_approval_status?: string | null | undefined;
  project_id?: string | null;
};

export function customerApprovalStatusOf(request: AdditionalWorkApprovalFields) {
  if (request.customer_approval_status) return request.customer_approval_status;
  // Legacy rows without the column: ticket-only is manager-only; project rows treated as pending.
  return request.project_id ? "pending" : "not_required";
}

export function isAdditionalWorkFullyApproved(request: AdditionalWorkApprovalFields) {
  if (request.approval_status !== "approved") return false;
  const customer = customerApprovalStatusOf(request);
  return customer === "approved" || customer === "not_required";
}

export function isAdditionalWorkRejected(request: AdditionalWorkApprovalFields) {
  return request.approval_status === "rejected" || customerApprovalStatusOf(request) === "rejected";
}

/** Still needs at least one party's decision (and not rejected). */
export function isAdditionalWorkAwaitingDecision(request: AdditionalWorkApprovalFields) {
  return !isAdditionalWorkFullyApproved(request) && !isAdditionalWorkRejected(request);
}

export function needsManagerAdditionalWorkDecision(request: AdditionalWorkApprovalFields) {
  return request.approval_status === "pending" && !isAdditionalWorkRejected(request);
}

export function needsCustomerAdditionalWorkDecision(request: AdditionalWorkApprovalFields) {
  return customerApprovalStatusOf(request) === "pending" && !isAdditionalWorkRejected(request);
}

export function additionalWorkOverallLabel(request: AdditionalWorkApprovalFields) {
  if (isAdditionalWorkFullyApproved(request)) return "approved";
  if (isAdditionalWorkRejected(request)) return "rejected";
  const parts: string[] = [];
  if (needsManagerAdditionalWorkDecision(request)) parts.push("manager");
  if (needsCustomerAdditionalWorkDecision(request)) parts.push("customer");
  if (parts.length === 0) return "pending";
  return `awaiting ${parts.join(" + ")}`;
}
