export const TECHNICIAN_STATUSES = [
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
] as const;

export type TechnicianStatus = (typeof TECHNICIAN_STATUSES)[number];

export const WORK_CATEGORIES = [
  "Support",
  "Project",
  "Remote",
  "On-site",
  "Troubleshooting",
  "Maintenance",
  "Other",
] as const;

export const SCOPE_OPTIONS = [
  { value: "included", label: "Included in contract" },
  { value: "out_of_scope", label: "Outside scope (needs approval)" },
] as const;

export type WorkScope = "included" | "out_of_scope";

export function appendWorkNote(existing: string | null | undefined, note: string, at = new Date()) {
  const stamp = at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const entry = `[${stamp}] ${note.trim()}`;
  return existing?.trim() ? `${existing.trim()}\n\n${entry}` : entry;
}

export function todayDateInputValue(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function validateHours(hours: number): string | null {
  if (!Number.isFinite(hours)) return "Enter a valid number of hours.";
  if (hours < 0) return "Hours worked cannot be negative.";
  if (hours === 0) return "Hours worked must be greater than zero.";
  return null;
}

export function validateCost(amount: number): string | null {
  if (!Number.isFinite(amount)) return "Enter a valid cost amount.";
  if (amount < 0) return "Direct costs cannot be negative.";
  if (amount === 0) return "Direct cost must be greater than zero.";
  return null;
}

export function isUnusuallyLargeHours(hours: number) {
  return hours > 12;
}

export function isUnusuallyLargeCost(amount: number) {
  return amount > 2500;
}

/** Client-side checks mirroring complete_support_ticket RPC rules. */
export function validateTicketCompletion(input: {
  isAssignedTechnician: boolean;
  completionNotes: string;
  customerResolutionSummary: string;
  workDescription: string;
  existingTechnicianNotes: string | null | undefined;
  hasTimeEntryDescriptions: boolean;
  recordedHours: number;
  noTimeExplanation: string;
}) {
  const errors: string[] = [];

  if (!input.isAssignedTechnician) {
    errors.push("Only the assigned technician can mark this ticket complete.");
  }
  if (!input.completionNotes.trim()) {
    errors.push("Completion notes are required.");
  }
  if (!input.customerResolutionSummary.trim()) {
    errors.push("A customer-visible resolution summary is required.");
  }

  const hasWorkDescription =
    Boolean(input.workDescription.trim()) ||
    Boolean(input.existingTechnicianNotes?.trim()) ||
    input.hasTimeEntryDescriptions;
  if (!hasWorkDescription) {
    errors.push("A description of work performed is required.");
  }

  if (input.recordedHours <= 0 && !input.noTimeExplanation.trim()) {
    errors.push(
      "Recorded effort must be greater than zero, or provide an explanation for why no time was recorded."
    );
  }

  return errors;
}

/** Build a time-entry payload that never bills unapproved out-of-scope work. */
export function buildTimeEntryPayload(input: {
  technicianId: string;
  customerId: string;
  contractId: string | null;
  ticketId: string;
  workDate: string;
  hours: number;
  description: string;
  workCategory: string | null;
  scope: WorkScope;
  internalCostRate: number;
  contractHourlyRate: number | null;
}) {
  const isOutOfScope = input.scope === "out_of_scope";
  return {
    technician_id: input.technicianId,
    customer_id: input.customerId,
    contract_id: input.contractId,
    support_ticket_id: input.ticketId,
    work_date: input.workDate,
    hours_worked: input.hours,
    work_category: input.workCategory,
    description: input.description.trim(),
    classification: isOutOfScope ? ("out_of_scope" as const) : ("included" as const),
    internal_cost_rate: input.internalCostRate,
    // Unapproved out-of-scope work must not carry customer charges.
    // labor_cost is a generated column (hours_worked * internal_cost_rate).
    billing_rate: null as number | null,
    approval_status: isOutOfScope ? ("pending" as const) : ("not_required" as const),
    billing_status: "unbilled" as const,
  };
}

/** Direct costs: store internal cost; do not treat as billable until approved. */
export function buildDirectCostPayload(input: {
  technicianId: string;
  customerId: string;
  contractId: string | null;
  ticketId: string;
  costDate: string;
  internalCost: number;
  description: string;
  category: string;
  vendor: string | null;
  scope: WorkScope;
}) {
  const isOutOfScope = input.scope === "out_of_scope";
  return {
    customer_id: input.customerId,
    contract_id: input.contractId,
    support_ticket_id: input.ticketId,
    cost_category: input.category,
    vendor: input.vendor,
    cost_date: input.costDate,
    internal_cost: input.internalCost,
    markup_pct: 0,
    // Keep billable amount at 0 until approved so charges are not calculated early.
    billable_amount: 0,
    description: input.description.trim(),
    entered_by: input.technicianId,
    approval_status: isOutOfScope || input.internalCost > 0 ? ("pending" as const) : ("not_required" as const),
    billing_status: "unbilled" as const,
  };
}

export function ticketUpdateForStatusChange(input: {
  nextStatus: TechnicianStatus;
  currentActualResponseAt: string | null;
  scope: WorkScope | null;
}) {
  const patch: Record<string, string | null> = {
    status: input.nextStatus,
  };

  if (input.nextStatus === "in_progress" && !input.currentActualResponseAt) {
    patch.actual_response_at = new Date().toISOString();
  }

  if (input.nextStatus === "waiting_on_approval" || input.scope === "out_of_scope") {
    patch.classification = "out_of_scope";
    patch.billable_approval_status = "pending";
  }

  return patch;
}

/** Strong warning flags for a completed ticket that is missing effort or work description. */
export function completedTicketQualityIssues(input: {
  status: string;
  technicianNotes: string | null | undefined;
  completionNotes: string | null | undefined;
  recordedHours: number;
  noTimeExplanation: string | null | undefined;
  hasTimeEntryDescriptions: boolean;
}) {
  if (input.status !== "resolved" && input.status !== "closed") return [] as string[];

  const issues: string[] = [];
  const hasDescription =
    Boolean(input.technicianNotes?.trim()) ||
    Boolean(input.completionNotes?.trim()) ||
    input.hasTimeEntryDescriptions;
  if (!hasDescription) {
    issues.push("This completed ticket has no work description.");
  }
  if (input.recordedHours <= 0 && !input.noTimeExplanation?.trim()) {
    issues.push("This completed ticket has no recorded effort and no explanation for zero time.");
  } else if (input.recordedHours <= 0) {
    issues.push("This completed ticket has no recorded effort (explanation on file).");
  }
  return issues;
}
