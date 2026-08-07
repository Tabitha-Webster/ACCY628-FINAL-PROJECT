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

import { isDemoModeEnabled } from "@/lib/demo-mode";

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
    // Fallback when submitted_at missing: keep not_yet_due until missed.
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

export type SlaTicketFields = {
  title?: string | null;
  submitted_at?: string | null;
  target_response_at?: string | null;
  target_resolution_at?: string | null;
  actual_response_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  priority?: string | null;
};

function isIntentionalMissedDemo(title: string | null | undefined) {
  const t = title ?? "";
  return /SLA demo:\s*Missed/i.test(t) || /Missed\s*[—-]/i.test(t) || /\bOverdue\b/i.test(t);
}

function isIntentionalAtRiskDemo(title: string | null | undefined) {
  return /SLA demo:\s*At Risk/i.test(title ?? "");
}

function responseLeadHours(priority: string | null | undefined) {
  switch ((priority ?? "medium").toLowerCase()) {
    case "critical":
      return 0.75;
    case "high":
      return 3;
    case "low":
      return 12;
    default:
      return 6;
  }
}

function resolutionLeadHours(priority: string | null | undefined) {
  switch ((priority ?? "medium").toLowerCase()) {
    case "critical":
      return 8;
    case "high":
      return 24;
    case "low":
      return 120;
    default:
      return 48;
  }
}

/**
 * Demo / technician presentation helper: stale seed deadlines make almost every
 * open ticket look Missed. For display only, push past deadlines forward
 * (and treat in-progress work as responded) unless the ticket is an
 * intentional Missed / At Risk demo example.
 */
export function withDemoSlaTargets<T extends SlaTicketFields>(ticket: T, now: Date = new Date()): T {
  if (!isDemoModeEnabled()) return ticket;
  const status = ticket.status ?? "";
  if (status === "resolved" || status === "closed") return ticket;
  if (isIntentionalMissedDemo(ticket.title) || isIntentionalAtRiskDemo(ticket.title)) return ticket;

  const nowMs = now.getTime();
  let target_response_at = ticket.target_response_at ?? null;
  let target_resolution_at = ticket.target_resolution_at ?? null;
  let actual_response_at = ticket.actual_response_at ?? null;

  const responseTarget = parseDate(target_response_at);
  const resolutionTarget = parseDate(target_resolution_at);

  if (!actual_response_at && responseTarget && responseTarget.getTime() < nowMs) {
    if (
      status === "in_progress" ||
      status === "waiting_on_customer" ||
      status === "waiting_on_approval"
    ) {
      const submitted = parseDate(ticket.submitted_at) ?? now;
      actual_response_at = new Date(
        Math.min(submitted.getTime() + 30 * 60 * 1000, nowMs)
      ).toISOString();
    } else {
      target_response_at = new Date(
        nowMs + responseLeadHours(ticket.priority) * 3600 * 1000
      ).toISOString();
    }
  }

  if (!ticket.completed_at && resolutionTarget && resolutionTarget.getTime() < nowMs) {
    target_resolution_at = new Date(
      nowMs + resolutionLeadHours(ticket.priority) * 3600 * 1000
    ).toISOString();
  }

  if (
    target_response_at === ticket.target_response_at &&
    target_resolution_at === ticket.target_resolution_at &&
    actual_response_at === ticket.actual_response_at
  ) {
    return ticket;
  }

  return {
    ...ticket,
    target_response_at,
    target_resolution_at,
    actual_response_at,
  };
}

/** Technician workspace SLA: applies demo freshening so Missed/Overdue stay rare. */
export function evaluateTechnicianTicketSla(ticket: SlaTicketFields, now: Date = new Date()) {
  return evaluateTicketSla(withDemoSlaTargets(ticket, now), now);
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

/** Local calendar date key (YYYY-MM-DD) using the browser/server local timezone. */
export function localDateKey(date: Date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Local calendar date of an ISO timestamp. */
export function localDateKeyFromIso(iso: string | null | undefined) {
  if (!iso) return null;
  const d = parseDate(iso);
  return d ? localDateKey(d) : null;
}

/** Human-readable duration for countdown / overdue displays. */
export function formatDurationMs(ms: number) {
  const abs = Math.abs(ms);
  const totalMinutes = Math.max(0, Math.floor(abs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export type SlaCountdownView = {
  condition: SlaCondition;
  /** True when the requirement is already satisfied (countdown stopped). */
  stopped: boolean;
  overdue: boolean;
  /** Primary display text, e.g. "2h 15m remaining" or "Overdue by 45m". */
  text: string;
  /** Short icon/label prefix for accessibility (not color-only). */
  icon: string;
};

/**
 * Live countdown / overdue text for one SLA clock.
 * Stops after satisfaction; preserves Met vs Missed from evaluateSlaClock.
 */
export function slaCountdownView(input: {
  submittedAt?: string | null;
  targetAt: string | null | undefined;
  satisfiedAt: string | null | undefined;
  status?: string | null;
  kind: "response" | "resolution";
  now?: Date;
}): SlaCountdownView {
  const now = input.now ?? new Date();
  const condition = evaluateSlaClock({
    submittedAt: input.submittedAt,
    targetAt: input.targetAt,
    satisfiedAt: input.satisfiedAt,
    status: input.status,
    kind: input.kind,
    now,
  });

  if (condition === "not_defined") {
    return { condition, stopped: true, overdue: false, text: "SLA Not Defined", icon: "○" };
  }

  const target = parseDate(input.targetAt);
  const satisfied = parseDate(input.satisfiedAt);
  const requirementMet =
    input.kind === "resolution"
      ? isResolutionSatisfied(input.status, satisfied)
      : Boolean(satisfied);

  if (requirementMet) {
    const label = condition === "met" ? "Met" : condition === "missed" ? "Missed" : slaConditionLabel(condition);
    return {
      condition,
      stopped: true,
      overdue: condition === "missed",
      text: `${label} · clock stopped`,
      icon: condition === "met" ? "✓" : "⚠",
    };
  }

  if (!target) {
    return { condition: "not_defined", stopped: true, overdue: false, text: "SLA Not Defined", icon: "○" };
  }

  const delta = target.getTime() - now.getTime();
  if (delta < 0) {
    return {
      condition: "missed",
      stopped: false,
      overdue: true,
      text: `Overdue by ${formatDurationMs(-delta)}`,
      icon: "⚠",
    };
  }

  return {
    condition,
    stopped: false,
    overdue: false,
    text: `${formatDurationMs(delta)} remaining`,
    icon: condition === "at_risk" ? "⏱" : "·",
  };
}

/**
 * Urgency rank for technician open-queue sorting (lower = more urgent).
 * 0 Critical+overdue, 1 Critical+at risk, 2 High+overdue,
 * 3 response deadline approaching, 4 resolution approaching, 5 other open.
 */
export function technicianUrgencyRank(
  ticket: {
    title?: string | null;
    priority?: string | null;
    submitted_at?: string | null;
    target_response_at?: string | null;
    target_resolution_at?: string | null;
    actual_response_at?: string | null;
    completed_at?: string | null;
    status?: string | null;
  },
  now: Date = new Date()
) {
  const sla = evaluateTechnicianTicketSla(ticket, now);
  const priority = (ticket.priority ?? "").toLowerCase();
  const isCritical = priority === "critical";
  const isHigh = priority === "high";

  if (isCritical && sla.overdue) return 0;
  if (isCritical && (sla.overall === "at_risk" || sla.response === "at_risk" || sla.resolution === "at_risk"))
    return 1;
  if (isHigh && sla.overdue) return 2;

  const responseApproaching =
    !ticket.actual_response_at &&
    (sla.response === "at_risk" ||
      (ticket.target_response_at != null &&
        new Date(ticket.target_response_at).getTime() - now.getTime() <= 4 * 60 * 60 * 1000 &&
        new Date(ticket.target_response_at).getTime() >= now.getTime()));
  if (responseApproaching) return 3;

  const resolutionApproaching =
    !ticket.completed_at &&
    ticket.status !== "resolved" &&
    ticket.status !== "closed" &&
    (sla.resolution === "at_risk" ||
      (ticket.target_resolution_at != null &&
        new Date(ticket.target_resolution_at).getTime() - now.getTime() <= 4 * 60 * 60 * 1000 &&
        new Date(ticket.target_resolution_at).getTime() >= now.getTime()));
  if (resolutionApproaching) return 4;

  return 5;
}

export function earliestRelevantDeadlineMs(ticket: {
  actual_response_at?: string | null;
  completed_at?: string | null;
  status?: string | null;
  target_response_at?: string | null;
  target_resolution_at?: string | null;
}) {
  const candidates: number[] = [];
  if (!ticket.actual_response_at && ticket.target_response_at) {
    const t = parseDate(ticket.target_response_at);
    if (t) candidates.push(t.getTime());
  }
  if (
    !ticket.completed_at &&
    ticket.status !== "resolved" &&
    ticket.status !== "closed" &&
    ticket.target_resolution_at
  ) {
    const t = parseDate(ticket.target_resolution_at);
    if (t) candidates.push(t.getTime());
  }
  return candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
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
