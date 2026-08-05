/**
 * Support-ticket SLA helpers.
 *
 * Deadline logic:
 * - Start from ticket submitted_at (calendar time).
 * - Add the related contract's service-level response / resolution hours.
 * - Prefer priority-specific response hours when the contract defines them
 *   (critical / high / medium / low).
 * - after_hours_terms on contracts are free-text policy notes only — there is
 *   no structured business-hours calendar in the schema, so we do not pause
 *   the clock for evenings/weekends. Deadlines are continuous calendar hours
 *   from submission for consistency across the app.
 *
 * Status is always computed from timestamps at view time (never a stored
 * overdue boolean).
 */

export type SlaCondition = "met" | "at_risk" | "missed" | "not_yet_due" | "not_defined";

export type SlaClockInput = {
  submittedAt: string | null | undefined;
  targetAt: string | null | undefined;
  /** When the requirement was satisfied (actual response or completion). */
  satisfiedAt: string | null | undefined;
  /** For resolution: treat resolved/closed as satisfied even without completed_at. */
  status?: string | null;
  kind?: "response" | "resolution";
  now?: Date;
};

const AT_RISK_THRESHOLD = 0.8;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isResolutionSatisfied(status: string | null | undefined, completedAt: Date | null) {
  if (completedAt) return true;
  return status === "resolved" || status === "closed";
}

/**
 * Evaluate one SLA clock (response or resolution).
 * At Risk = at least 80% of the SLA window has elapsed and not yet satisfied.
 */
export function evaluateSlaClock(input: SlaClockInput): SlaCondition {
  const target = parseDate(input.targetAt);
  if (!target) return "not_defined";

  const now = input.now ?? new Date();
  const submitted = parseDate(input.submittedAt) ?? null;
  const satisfied = parseDate(input.satisfiedAt);

  const requirementMet =
    input.kind === "resolution"
      ? isResolutionSatisfied(input.status, satisfied)
      : Boolean(satisfied);

  if (requirementMet) {
    const doneAt = satisfied ?? now;
    return doneAt.getTime() <= target.getTime() ? "met" : "missed";
  }

  if (now.getTime() > target.getTime()) return "missed";

  // 80% of available SLA time elapsed → At Risk
  if (submitted && target.getTime() > submitted.getTime()) {
    const windowMs = target.getTime() - submitted.getTime();
    const elapsedMs = now.getTime() - submitted.getTime();
    if (elapsedMs / windowMs >= AT_RISK_THRESHOLD) return "at_risk";
  } else {
    // Fallback when submitted_at missing: last 20% of time-to-deadline
    const msLeft = target.getTime() - now.getTime();
    // Without a start, approximate using remaining vs an unknown window — use 20% of time left relative to a 1h floor
    // Prefer: treat as at risk when less than 20% of a conventional window remains is impossible.
    // Use: if we somehow lack submitted_at, keep not_yet_due until missed.
  }

  return "not_yet_due";
}

export function isResponseOverdue(input: {
  targetResponseAt: string | null | undefined;
  actualResponseAt: string | null | undefined;
  now?: Date;
}) {
  const target = parseDate(input.targetResponseAt);
  if (!target) return false;
  if (input.actualResponseAt) return false;
  return (input.now ?? new Date()).getTime() > target.getTime();
}

export function isResolutionOverdue(input: {
  targetResolutionAt: string | null | undefined;
  completedAt: string | null | undefined;
  status: string | null | undefined;
  now?: Date;
}) {
  const target = parseDate(input.targetResolutionAt);
  if (!target) return false;
  if (input.completedAt || input.status === "resolved" || input.status === "closed") return false;
  return (input.now ?? new Date()).getTime() > target.getTime();
}

export function evaluateTicketSla(ticket: {
  submitted_at?: string | null;
  target_response_at?: string | null;
  target_resolution_at?: string | null;
  actual_response_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  priority?: string | null;
}, now: Date = new Date()) {
  const response = evaluateSlaClock({
    submittedAt: ticket.submitted_at,
    targetAt: ticket.target_response_at,
    satisfiedAt: ticket.actual_response_at,
    kind: "response",
    now,
  });
  const resolution = evaluateSlaClock({
    submittedAt: ticket.submitted_at,
    targetAt: ticket.target_resolution_at,
    satisfiedAt: ticket.completed_at,
    status: ticket.status,
    kind: "resolution",
    now,
  });

  const responseOverdue = isResponseOverdue({
    targetResponseAt: ticket.target_response_at,
    actualResponseAt: ticket.actual_response_at,
    now,
  });
  const resolutionOverdue = isResolutionOverdue({
    targetResolutionAt: ticket.target_resolution_at,
    completedAt: ticket.completed_at,
    status: ticket.status,
    now,
  });
  const overdue = responseOverdue || resolutionOverdue;

  let overall: SlaCondition = "not_yet_due";
  if (response === "not_defined" && resolution === "not_defined") overall = "not_defined";
  else if (response === "missed" || resolution === "missed" || overdue) overall = "missed";
  else if (response === "at_risk" || resolution === "at_risk") overall = "at_risk";
  else if (
    (response === "met" || response === "not_defined") &&
    (resolution === "met" || resolution === "not_defined")
  ) {
    overall = response === "not_defined" && resolution === "not_defined" ? "not_defined" : "met";
  } else {
    overall = "not_yet_due";
  }

  return {
    response,
    resolution,
    overall,
    responseOverdue,
    resolutionOverdue,
    overdue,
    isCritical: ticket.priority === "critical",
  };
}

/** Display label for SLA condition badges. */
export function slaConditionLabel(condition: SlaCondition) {
  switch (condition) {
    case "met":
      return "Met";
    case "at_risk":
      return "At Risk";
    case "missed":
      return "Missed";
    case "not_yet_due":
      return "Not Yet Due";
    case "not_defined":
      return "SLA Not Defined";
  }
}

export function slaConditionBadgeKey(condition: SlaCondition) {
  switch (condition) {
    case "met":
      return "met";
    case "at_risk":
      return "at_risk";
    case "missed":
      return "missed";
    case "not_yet_due":
      return "not_yet_due";
    case "not_defined":
      return "not_defined";
  }
}

export type ContractSlaTerms = {
  sla_response_hours?: number | null;
  sla_resolution_hours?: number | null;
  sla_critical_response_hours?: number | null;
  sla_high_response_hours?: number | null;
  sla_medium_response_hours?: number | null;
  sla_low_response_hours?: number | null;
};

export function responseHoursForPriority(contract: ContractSlaTerms | null | undefined, priority: string) {
  if (!contract) return null;
  const p = priority.toLowerCase();
  if (p === "critical" && contract.sla_critical_response_hours != null)
    return Number(contract.sla_critical_response_hours);
  if (p === "high" && contract.sla_high_response_hours != null) return Number(contract.sla_high_response_hours);
  if (p === "medium" && contract.sla_medium_response_hours != null)
    return Number(contract.sla_medium_response_hours);
  if (p === "low" && contract.sla_low_response_hours != null) return Number(contract.sla_low_response_hours);
  if (contract.sla_response_hours != null) return Number(contract.sla_response_hours);
  return null;
}

export function computeSlaDeadlines(input: {
  submittedAt: Date | string;
  priority: string;
  contract: ContractSlaTerms | null | undefined;
}) {
  const submitted =
    typeof input.submittedAt === "string" ? parseDate(input.submittedAt) : input.submittedAt;
  if (!submitted) {
    return { target_response_at: null as string | null, target_resolution_at: null as string | null };
  }
  const responseHours = responseHoursForPriority(input.contract, input.priority);
  const resolutionHours =
    input.contract?.sla_resolution_hours != null ? Number(input.contract.sla_resolution_hours) : null;

  const addHours = (base: Date, hours: number) =>
    new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();

  return {
    target_response_at:
      responseHours != null && responseHours >= 0 ? addHours(submitted, responseHours) : null,
    target_resolution_at:
      resolutionHours != null && resolutionHours >= 0 ? addHours(submitted, resolutionHours) : null,
  };
}

/**
 * Backward-compatible wrapper used by older call sites.
 * Prefer evaluateSlaClock / evaluateTicketSla for new code.
 */
export function slaStatus(
  targetAt: string | null | undefined,
  actualAt: string | null | undefined,
  now: Date = new Date(),
  submittedAt?: string | null
): "met" | "at_risk" | "missed" | "pending" {
  const result = evaluateSlaClock({
    submittedAt: submittedAt ?? null,
    targetAt,
    satisfiedAt: actualAt,
    now,
  });
  if (result === "not_defined" || result === "not_yet_due") return "pending";
  return result;
}
