"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  TECHNICIAN_STATUSES,
  WORK_CATEGORIES,
  SCOPE_OPTIONS,
  appendWorkNote,
  todayDateInputValue,
  validateHours,
  validateCost,
  isUnusuallyLargeHours,
  isUnusuallyLargeCost,
  buildTimeEntryPayload,
  buildDirectCostPayload,
  ticketUpdateForStatusChange,
  validateTicketCompletion,
  type TechnicianStatus,
  type WorkScope,
} from "@/lib/technicianWork";
import { statusLabel } from "@/lib/format";

type Props = {
  ticketId: string;
  customerId: string;
  contractId: string | null;
  status: string;
  priority: string;
  assignedTechnicianId: string | null;
  actualResponseAt: string | null;
  technicianNotes: string | null;
  completionNotes: string | null;
  customerResolutionSummary: string | null;
  classification: string | null;
  billableApprovalStatus: string | null;
  currentUserId: string;
  internalCostRate: number;
  contractHourlyRate: number | null;
  recordedHours: number;
  hasTimeEntryDescriptions: boolean;
  compact?: boolean;
  initialFocus?: "status" | "notes" | "time" | "scope" | "complete" | null;
};

export function TechnicianWorkPanel({
  ticketId,
  customerId,
  contractId,
  status,
  priority,
  assignedTechnicianId,
  actualResponseAt,
  technicianNotes,
  completionNotes,
  customerResolutionSummary,
  classification,
  billableApprovalStatus,
  currentUserId,
  internalCostRate,
  contractHourlyRate,
  recordedHours,
  hasTimeEntryDescriptions,
  compact = false,
  initialFocus = null,
}: Props) {
  const router = useRouter();
  const openStatuses = TECHNICIAN_STATUSES as readonly string[];
  const initialStatus = openStatuses.includes(status) ? (status as TechnicianStatus) : "assigned";
  const [nextStatus, setNextStatus] = useState<TechnicianStatus>(initialStatus);
  const [workNote, setWorkNote] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(todayDateInputValue());
  const [workCategory, setWorkCategory] = useState<string>("Support");
  const [scope, setScope] = useState<WorkScope>(
    classification === "out_of_scope" || initialFocus === "scope" ? "out_of_scope" : "included"
  );
  const [costAmount, setCostAmount] = useState("");
  const [costDescription, setCostDescription] = useState("");
  const [costVendor, setCostVendor] = useState("");
  const [includeCost, setIncludeCost] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState(customerResolutionSummary ?? "");
  const [completionNote, setCompletionNote] = useState(completionNotes ?? "");
  const [noTimeExplanation, setNoTimeExplanation] = useState("");
  const [completeWorkDescription, setCompleteWorkDescription] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [summaryNotice, setSummaryNotice] = useState<string | null>(null);
  const [summaryIsDraft, setSummaryIsDraft] = useState(false);
  const [liveHours, setLiveHours] = useState(recordedHours);
  const [liveHasDescriptions, setLiveHasDescriptions] = useState(hasTimeEntryDescriptions);

  useEffect(() => {
    let cancelled = false;
    async function refreshEffort() {
      const supabase = createClient();
      const { data } = await supabase
        .from("time_entries")
        .select("hours_worked, description")
        .eq("support_ticket_id", ticketId);
      if (cancelled || !data) return;
      const total = data.reduce((sum, row) => sum + Number(row.hours_worked ?? 0), 0);
      setLiveHours(total);
      setLiveHasDescriptions(data.some((row) => Boolean(row.description?.trim())));
    }
    void refreshEffort();
    return () => {
      cancelled = true;
    };
  }, [ticketId, message]);

  useEffect(() => {
    if (!initialFocus) return;
    const id =
      initialFocus === "complete"
        ? "tech-complete-section"
        : initialFocus === "notes"
          ? "tech-notes-section"
          : initialFocus === "time"
            ? "tech-time-section"
            : initialFocus === "scope"
              ? "tech-scope-section"
              : "tech-status-section";
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (initialFocus === "notes") {
        (document.querySelector("#tech-notes-section textarea") as HTMLTextAreaElement | null)?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialFocus, ticketId]);

  const isAssignedTech = assignedTechnicianId === currentUserId;
  const canEdit = isAssignedTech;
  const isCompleted = status === "resolved" || status === "closed";
  const pendingHours = hours.trim() ? Number(hours) : 0;
  const effortAfterSave =
    liveHours + (Number.isFinite(pendingHours) && pendingHours > 0 ? pendingHours : 0);

  const completionErrors = useMemo(
    () =>
      validateTicketCompletion({
        isAssignedTechnician: isAssignedTech,
        completionNotes: completionNote,
        customerResolutionSummary: resolutionSummary,
        workDescription: completeWorkDescription || workDescription || workNote,
        existingTechnicianNotes: technicianNotes,
        hasTimeEntryDescriptions: liveHasDescriptions,
        // Only count effort already saved in the database (API enforces the same).
        recordedHours: liveHours,
        noTimeExplanation,
      }),
    [
      isAssignedTech,
      completionNote,
      resolutionSummary,
      completeWorkDescription,
      workDescription,
      workNote,
      technicianNotes,
      liveHasDescriptions,
      liveHours,
      noTimeExplanation,
    ]
  );

  const canComplete = isAssignedTech && !isCompleted && completionErrors.length === 0;

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!canEdit) {
      setError("Only the assigned technician can update work fields on this ticket.");
      return;
    }
    if (isCompleted) {
      setError("This ticket is already completed. Ask a manager to reopen it if more work is needed.");
      return;
    }

    const hoursNum = hours.trim() ? Number(hours) : null;
    const costNum = includeCost && costAmount.trim() ? Number(costAmount) : null;

    if (hours.trim()) {
      const hoursError = validateHours(Number(hours));
      if (hoursError) {
        setError(hoursError);
        return;
      }
      if (!workDescription.trim()) {
        setError("Add a description of the work performed when recording hours.");
        return;
      }
      if (isUnusuallyLargeHours(Number(hours))) {
        const ok = window.confirm(
          `${hours} hours is unusually large for a single entry. Continue anyway?`
        );
        if (!ok) return;
      }
    }

    if (includeCost) {
      const costError = validateCost(Number(costAmount));
      if (costError) {
        setError(costError);
        return;
      }
      if (!costDescription.trim()) {
        setError("Add a description for the direct cost.");
        return;
      }
      if (isUnusuallyLargeCost(Number(costAmount))) {
        const ok = window.confirm(
          `$${Number(costAmount).toFixed(2)} is an unusually large direct cost. Continue anyway?`
        );
        if (!ok) return;
      }
    }

    setLoading("save");
    const supabase = createClient();

    const statusPatch = ticketUpdateForStatusChange({
      nextStatus,
      currentActualResponseAt: actualResponseAt,
      scope,
    });

    if (actualResponseAt) {
      delete statusPatch.actual_response_at;
    }

    if (scope === "out_of_scope") {
      statusPatch.classification = "out_of_scope";
      statusPatch.billable_approval_status = "pending";
      if (nextStatus === "in_progress" || nextStatus === "assigned") {
        statusPatch.status = "waiting_on_approval";
        setNextStatus("waiting_on_approval");
      }
    } else if (scope === "included" && classification === "out_of_scope") {
      statusPatch.classification = "out_of_scope";
      statusPatch.billable_approval_status = "pending";
    } else if (scope === "included") {
      statusPatch.classification = "included";
      statusPatch.billable_approval_status = "not_required";
    }

    const { error: ticketError } = await supabase
      .from("support_tickets")
      .update(statusPatch)
      .eq("id", ticketId)
      .eq("assigned_technician_id", currentUserId);

    if (ticketError) {
      setLoading(null);
      setError(ticketError.message);
      return;
    }

    if (workNote.trim()) {
      const { data: latest, error: readError } = await supabase
        .from("support_tickets")
        .select("technician_notes")
        .eq("id", ticketId)
        .single();
      if (readError) {
        setLoading(null);
        setError(readError.message);
        return;
      }
      const nextNotes = appendWorkNote(latest?.technician_notes ?? technicianNotes, workNote);
      const { error: noteError } = await supabase
        .from("support_tickets")
        .update({ technician_notes: nextNotes })
        .eq("id", ticketId)
        .eq("assigned_technician_id", currentUserId);
      if (noteError) {
        setLoading(null);
        setError(noteError.message);
        return;
      }
    }

    if (hoursNum != null) {
      const timePayload = buildTimeEntryPayload({
        technicianId: currentUserId,
        customerId,
        contractId,
        ticketId,
        workDate,
        hours: hoursNum,
        description: workDescription,
        workCategory: workCategory || null,
        scope,
        internalCostRate,
        contractHourlyRate,
      });
      const { error: timeError } = await supabase.from("time_entries").insert(timePayload);
      if (timeError) {
        setLoading(null);
        setError(timeError.message);
        return;
      }
    }

    if (includeCost && costNum != null) {
      const costPayload = buildDirectCostPayload({
        technicianId: currentUserId,
        customerId,
        contractId,
        ticketId,
        costDate: workDate,
        internalCost: costNum,
        description: costDescription,
        category: "other",
        vendor: costVendor.trim() || null,
        scope,
      });
      const { error: costError } = await supabase.from("direct_costs").insert(costPayload);
      if (costError) {
        setLoading(null);
        setError(costError.message);
        return;
      }
    }

    if (scope === "out_of_scope" && (nextStatus === "waiting_on_approval" || statusPatch.status === "waiting_on_approval")) {
      await supabase.from("additional_work_requests").insert({
        customer_id: customerId,
        contract_id: contractId,
        support_ticket_id: ticketId,
        requested_by: currentUserId,
        title: `Out-of-scope work on ticket`,
        description:
          workDescription.trim() ||
          workNote.trim() ||
          "Technician flagged this ticket work as outside contract scope. Manager approval required before billing.",
        estimated_hours: hoursNum,
        approval_status: "pending",
        customer_approval_status: "not_required",
      });
    }

    setLoading(null);
    setWorkNote("");
    setWorkDescription("");
    setHours("");
    setCostAmount("");
    setCostDescription("");
    setCostVendor("");
    setIncludeCost(false);
    setMessage(
      scope === "out_of_scope"
        ? "Work saved. Out-of-scope items are pending approval and will not be billed yet."
        : "Work documentation and status saved."
    );
    router.refresh();
  }

  async function markComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isAssignedTech) {
      setError("Only the assigned technician can mark this ticket complete.");
      return;
    }
    if (completionErrors.length > 0) {
      setError(completionErrors[0]);
      return;
    }

    setLoading("complete");
    const res = await fetch("/api/tickets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        completionNotes: completionNote,
        customerResolutionSummary: resolutionSummary,
        workDescription: completeWorkDescription || workDescription || workNote,
        noTimeExplanation,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(null);

    if (!res.ok) {
      setError(payload.error ?? "Could not complete this ticket.");
      return;
    }

    setMessage(payload.message ?? "Ticket marked complete successfully.");
    setSummaryIsDraft(false);
    router.refresh();
  }

  async function generateCustomerSummary() {
    setError(null);
    setSummaryNotice(null);
    if (resolutionSummary.trim()) {
      const ok = window.confirm(
        "A customer-visible summary already exists. Replace the draft text in this form? Nothing is saved until you Save or Mark Work Complete."
      );
      if (!ok) return;
    }

    setLoading("summary");
    const res = await fetch("/api/tickets/generate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(null);

    if (!res.ok) {
      setError(payload.error ?? "Could not generate a summary.");
      return;
    }

    if (typeof payload.summary === "string" && payload.summary.trim()) {
      setResolutionSummary(payload.summary.trim());
      setSummaryIsDraft(true);
      setSummaryNotice(
        [
          payload.message,
          payload.notice,
          payload.source === "fallback"
            ? "Source: non-AI fallback draft."
            : payload.source === "ai"
              ? "Source: AI draft."
              : null,
        ]
          .filter(Boolean)
          .join(" ")
      );
    } else {
      setError("Generation returned an empty summary. Write one manually.");
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-3 rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-semibold">Technician work</p>
        {priority === "critical" ? (
          <div className="alert alert-error text-sm" role="alert">
            <span>⚠ Critical priority — treat as highest urgency.</span>
          </div>
        ) : null}
        <div className="alert alert-warning text-sm" role="status">
          <span>
            {assignedTechnicianId
              ? "You are not the assigned technician for this ticket. Mark Work Complete is disabled. Only the assigned technician can complete this ticket."
              : "This ticket is unassigned. Ask a manager to assign it before documenting work or completing it."}
          </span>
        </div>
        <button className="btn btn-primary btn-sm" type="button" disabled>
          Mark Work Complete
        </button>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-semibold">Work complete</p>
        <p className="mt-1 opacity-70">
          This ticket is {statusLabel(status)}. Prior work notes and time entries are preserved. A
          manager must deliberately reopen the ticket if more work is required.
        </p>
        {message ? <div className="alert alert-success mt-3 text-sm">{message}</div> : null}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? "text-sm" : ""}`}>
      {priority === "critical" ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>⚠ Critical priority — treat as highest urgency.</span>
        </div>
      ) : null}

      <form
        className="space-y-4 rounded-box border border-base-300 bg-base-100 p-4"
        onSubmit={saveAll}
      >
        <div>
          <p className="text-sm font-semibold">Technician work documentation</p>
          <p className="mt-1 text-xs opacity-70">
            Update status, append work notes, and record time or costs. Notes and time entries are
            kept as history. Out-of-scope work stays unbillable until approved. Use Mark Work Complete
            below to resolve the ticket.
          </p>
        </div>

        {error ? <div className="alert alert-error text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control" id="tech-status-section">
            <span className="label-text mb-1 font-medium">Ticket status</span>
            <select
              className="select select-bordered select-sm"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as TechnicianStatus)}
            >
              {TECHNICIAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            {nextStatus === "in_progress" && !actualResponseAt ? (
              <span className="mt-1 text-xs opacity-60">
                First move to In Progress will record the actual response time.
              </span>
            ) : null}
            {actualResponseAt ? (
              <span className="mt-1 text-xs opacity-60">
                Response time already recorded — it will not be overwritten.
              </span>
            ) : null}
          </label>

          <label className="form-control" id="tech-scope-section">
            <span className="label-text mb-1 font-medium">Work scope</span>
            <select
              className="select select-bordered select-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value as WorkScope)}
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {scope === "out_of_scope" ? (
              <span className="mt-1 text-xs text-warning">
                Outside-scope work requires approval and will not appear as ready to bill until
                approved.
              </span>
            ) : null}
          </label>
        </div>

        <label className="form-control" id="tech-notes-section">
          <span className="label-text mb-1 font-medium">Work notes (appended to history)</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={compact ? 2 : 3}
            value={workNote}
            onChange={(e) => setWorkNote(e.target.value)}
            placeholder="What did you find or do? This is added to the existing note history."
          />
        </label>

        <div className="rounded-box border border-dashed border-base-300 p-3" id="tech-time-section">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Record time</p>
          <p className="mb-2 text-xs opacity-60">
            Recorded effort on this ticket: {liveHours.toFixed(2)} hrs
            {effortAfterSave > liveHours
              ? ` (will be ${effortAfterSave.toFixed(2)} hrs after this save)`
              : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1">Work date</span>
              <input
                type="date"
                className="input input-bordered input-sm"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Hours worked</span>
              <input
                type="number"
                min="0"
                step="0.25"
                className="input input-bordered input-sm"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 1.5"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Work category</span>
              <select
                className="select select-bordered select-sm"
                value={workCategory}
                onChange={(e) => setWorkCategory(e.target.value)}
              >
                {WORK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="form-control mt-3">
            <span className="label-text mb-1">Description of work performed</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="Describe the work performed for this time entry"
            />
          </label>
        </div>

        <div className="rounded-box border border-dashed border-base-300 p-3">
          <label className="label cursor-pointer justify-start gap-2 py-0">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={includeCost}
              onChange={(e) => setIncludeCost(e.target.checked)}
            />
            <span className="label-text font-medium">Add a direct cost</span>
          </label>
          {includeCost ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Internal cost ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input input-bordered input-sm"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Vendor (optional)</span>
                <input
                  className="input input-bordered input-sm"
                  value={costVendor}
                  onChange={(e) => setCostVendor(e.target.value)}
                />
              </label>
              <label className="form-control sm:col-span-2">
                <span className="label-text mb-1">Cost description</span>
                <input
                  className="input input-bordered input-sm"
                  value={costDescription}
                  onChange={(e) => setCostDescription(e.target.value)}
                  placeholder="Parts, software, shipping, etc."
                />
              </label>
              <p className="text-xs opacity-60 sm:col-span-2">
                Direct costs are saved for review. Customer billable amounts stay at $0 until approved —
                unapproved out-of-scope work cannot become billable here.
              </p>
            </div>
          ) : null}
        </div>

        <button className="btn btn-outline" type="submit" disabled={loading === "save"}>
          {loading === "save" ? "Saving…" : "Save status & work documentation"}
        </button>
      </form>

      <form
        id="tech-complete-section"
        className="space-y-3 rounded-box border border-success/40 bg-success/5 p-4"
        onSubmit={markComplete}
      >
        <div>
          <p className="text-sm font-semibold">Mark Work Complete</p>
          <p className="mt-1 text-xs opacity-70">
            Sets status to Resolved, records the completion timestamp, and saves completion notes.
            Previous notes and time entries are preserved. Enforced server-side and in the database.
          </p>
        </div>

        <label className="form-control">
          <span className="label-text mb-1 font-medium">Completion notes (internal) *</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1 font-medium">Customer-visible resolution summary *</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={3}
            value={resolutionSummary}
            onChange={(e) => {
              setResolutionSummary(e.target.value);
              setSummaryIsDraft(false);
            }}
            placeholder="Shown to the customer"
            required
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={generateCustomerSummary}
              disabled={loading !== null}
            >
              {loading === "summary" ? "Generating summary…" : "✨ Generate Summary"}
            </button>
            {summaryIsDraft ? (
              <span className="badge badge-warning badge-outline">Draft — not saved yet</span>
            ) : null}
          </div>
          {summaryNotice ? (
            <p className="mt-2 text-xs opacity-70" role="status">
              {summaryNotice}
            </p>
          ) : (
            <p className="mt-2 text-xs opacity-60">
              Optional AI draft from your work notes. Review and edit before Save or Mark Work Complete.
              Generation never saves the summary by itself.
            </p>
          )}
        </label>

        <label className="form-control">
          <span className="label-text mb-1 font-medium">
            Description of work performed
            {!technicianNotes?.trim() && !liveHasDescriptions ? " *" : " (optional if already documented)"}
          </span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={completeWorkDescription}
            onChange={(e) => setCompleteWorkDescription(e.target.value)}
            placeholder="Summarize work performed if not already captured in notes or time entries"
          />
        </label>

        {liveHours <= 0 ? (
          <label className="form-control">
            <span className="label-text mb-1 font-medium">Why was no time recorded? *</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={noTimeExplanation}
              onChange={(e) => setNoTimeExplanation(e.target.value)}
              placeholder="Required when recorded effort is zero. Save time entries above before completing if you have hours to log."
              required
            />
          </label>
        ) : (
          <p className="text-xs opacity-60">
            Recorded effort on this ticket: {liveHours.toFixed(2)} hrs (meets the effort requirement).
          </p>
        )}
        {effortAfterSave > liveHours ? (
          <p className="text-xs text-warning">
            You have unsaved hours in the form above. Save work documentation first so that effort is
            recorded before completion.
          </p>
        ) : null}

        {completionErrors.length > 0 ? (
          <div className="alert alert-warning text-sm">
            <ul className="list-disc pl-4">
              {completionErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          className="btn btn-success"
          type="submit"
          disabled={!canComplete || loading === "complete"}
          title={
            !isAssignedTech
              ? "Only the assigned technician can complete this ticket."
              : completionErrors[0] ?? "Mark work complete"
          }
        >
          {loading === "complete" ? "Completing…" : "Mark Work Complete"}
        </button>
      </form>
    </div>
  );
}
