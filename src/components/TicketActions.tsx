"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

type TechnicianOption = { id: string; full_name: string };

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
  customerConfirmed: boolean | null;
  classification: string | null;
  billableApprovalStatus: string | null;
  noTimeExplanation: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  serviceMode?: string | null;
  serviceLocation?: string | null;
  scheduleNotes?: string | null;
  currentUserId: string;
  role: UserRole;
  internalCostRate: number;
  contractHourlyRate: number | null;
  recordedHours: number;
  hasTimeEntryDescriptions: boolean;
  technicians?: TechnicianOption[];
};

function toLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string) {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function TicketActions({
  ticketId,
  status,
  assignedTechnicianId,
  customerConfirmed,
  noTimeExplanation,
  reopenedAt,
  reopenReason,
  scheduledStartAt = null,
  scheduledEndAt = null,
  serviceMode = null,
  serviceLocation = null,
  scheduleNotes = null,
  role,
  recordedHours,
  technicians = [],
}: Props) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState(assignedTechnicianId ?? "");
  const [scheduleStart, setScheduleStart] = useState(toLocalInputValue(scheduledStartAt));
  const [scheduleEnd, setScheduleEnd] = useState(toLocalInputValue(scheduledEndAt));
  const [mode, setMode] = useState(serviceMode ?? "");
  const [location, setLocation] = useState(serviceLocation ?? "");
  const [schedNotes, setSchedNotes] = useState(scheduleNotes ?? "");
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isCompleted = status === "resolved" || status === "closed";

  async function assignTechnician(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedAssignee = String(formData.get("assignee") || assigneeId).trim();
    if (!selectedAssignee) {
      setError("Select a technician to assign.");
      return;
    }
    const startIso = fromLocalInputValue(String(formData.get("schedule_start") || scheduleStart));
    const endIso = fromLocalInputValue(String(formData.get("schedule_end") || scheduleEnd));
    const selectedMode = String(formData.get("service_mode") || mode);
    const selectedLocation = String(formData.get("service_location") || location);
    const selectedNotes = String(formData.get("schedule_notes") || schedNotes);
    if (startIso && endIso && new Date(endIso) < new Date(startIso)) {
      setError("Scheduled end must be after the start time.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading("assign");
    const supabase = createClient();
    // Prefer assigned_at when the column exists; fall back if schema cache lacks it.
    let updateError = (
      await supabase
        .from("support_tickets")
        .update({
          assigned_technician_id: selectedAssignee,
          status: status === "new" ? "assigned" : status,
          assigned_at: new Date().toISOString(),
        })
        .eq("id", ticketId)
    ).error;

    if (updateError?.message?.includes("assigned_at")) {
      updateError = (
        await supabase
          .from("support_tickets")
          .update({
            assigned_technician_id: selectedAssignee,
            status: status === "new" ? "assigned" : status,
          })
          .eq("id", ticketId)
      ).error;
    }

    if (updateError) {
      setLoading(null);
      setError(updateError.message);
      return;
    }

    setAssigneeId(selectedAssignee);

    // Optional schedule — ignore if migration not applied yet.
    if (startIso || endIso || selectedMode || selectedLocation.trim() || selectedNotes.trim()) {
      const { error: scheduleError } = await supabase
        .from("support_tickets")
        .update({
          scheduled_start_at: startIso,
          scheduled_end_at: endIso,
          service_mode: selectedMode || null,
          service_location: selectedLocation.trim() || null,
          schedule_notes: selectedNotes.trim() || null,
        })
        .eq("id", ticketId);
      setLoading(null);
      if (
        scheduleError?.message?.includes("scheduled_start_at") ||
        scheduleError?.message?.includes("schedule_notes") ||
        scheduleError?.message?.includes("service_mode") ||
        scheduleError?.message?.includes("schema cache")
      ) {
        setMessage("Technician assignment saved. Apply the schedule migration to store visit times.");
        router.refresh();
        return;
      }
      if (scheduleError) {
        setError(`Assigned, but schedule was not saved: ${scheduleError.message}`);
        router.refresh();
        return;
      }
      setMessage("Technician assignment and schedule saved.");
      router.refresh();
      return;
    }

    setLoading(null);
    setMessage("Technician assignment saved.");
    router.refresh();
  }

  async function reopenTicket(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (reopenReasonInput.trim().length < 10) {
      setError("Provide a clear reopen reason (at least a short sentence).");
      return;
    }
    setLoading("reopen");
    const res = await fetch("/api/tickets/reopen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, reason: reopenReasonInput }),
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(payload.error ?? "Could not reopen this ticket.");
      return;
    }
    setMessage(payload.message ?? "Ticket reopened.");
    setReopenReasonInput("");
    router.refresh();
  }

  async function confirmResolved() {
    setError(null);
    setMessage(null);
    setLoading("confirm");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ customer_confirmed: true, status: "closed" })
      .eq("id", ticketId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Thanks for confirming — this ticket is now closed.");
    router.refresh();
  }

  if (role === "customer") {
    if (status !== "resolved" || customerConfirmed) return null;
    return (
      <div className="rounded-box border border-base-300 bg-base-100 p-4">
        <p className="text-sm font-semibold">Was this resolved to your satisfaction?</p>
        <p className="mt-1 text-xs opacity-70">Confirming will close this ticket.</p>
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
        {message ? <p className="mt-2 text-sm text-success">{message}</p> : null}
        <button
          className="btn btn-success btn-sm mt-3"
          onClick={confirmResolved}
          disabled={loading === "confirm"}
        >
          {loading === "confirm" ? "Confirming…" : "Confirm Resolved"}
        </button>
      </div>
    );
  }

  if (role === "billing") {
    return (
      <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-semibold">Billing view</p>
        <p className="mt-1 opacity-70">
          You can review billing classification and approval status. Work cannot be billed until the
          ticket is completed or the work has received the required approval. Unapproved out-of-scope
          work will not appear as ready to bill. Internal completion notes are read-only here.
        </p>
      </div>
    );
  }

  if (role === "manager") {
    return (
      <div className="space-y-4 rounded-box border border-base-300 bg-base-100 p-4">
        <p className="text-sm font-semibold">Manager Actions</p>
        {error ? <div className="alert alert-error text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}
        <form className="space-y-2" onSubmit={assignTechnician}>
          <label className="form-control">
            <span className="label-text mb-1 text-sm font-medium">Assign / reassign technician</span>
            <select
              name="assignee"
              className="select select-bordered select-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Select technician</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.full_name}
                </option>
              ))}
            </select>
          </label>

          {!isCompleted ? (
            <div className="space-y-2 border-t border-base-300 pt-3">
              <p className="text-sm font-medium">Schedule visit (optional)</p>
              <p className="text-xs opacity-70">
                Sets appointment times for the technician calendar. Do not use SLA deadlines as visit
                times.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="form-control">
                  <span className="label-text mb-1 text-xs">Start</span>
                  <input
                    type="datetime-local"
                    name="schedule_start"
                    className="input input-bordered input-sm"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                    disabled={loading === "assign"}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-xs">End</span>
                  <input
                    type="datetime-local"
                    name="schedule_end"
                    className="input input-bordered input-sm"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                    disabled={loading === "assign"}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-xs">Mode</span>
                  <select
                    name="service_mode"
                    className="select select-bordered select-sm"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    disabled={loading === "assign"}
                  >
                    <option value="">Not set</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-xs">Location</span>
                  <input
                    name="service_location"
                    className="input input-bordered input-sm"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Address or remote note"
                    disabled={loading === "assign"}
                  />
                </label>
              </div>
              <label className="form-control">
                <span className="label-text mb-1 text-xs">Schedule notes</span>
                <textarea
                  name="schedule_notes"
                  className="textarea textarea-bordered textarea-sm w-full"
                  rows={2}
                  value={schedNotes}
                  onChange={(e) => setSchedNotes(e.target.value)}
                  disabled={loading === "assign"}
                />
              </label>
            </div>
          ) : null}

          <button className="btn btn-primary btn-sm" disabled={loading === "assign" || isCompleted}>
            {loading === "assign" ? "Saving…" : "Save Assignment"}
          </button>
          {isCompleted ? (
            <p className="text-xs opacity-60">Reopen the ticket before changing assignment.</p>
          ) : null}
        </form>

        {isCompleted ? (
          <form className="space-y-2 border-t border-base-300 pt-4" onSubmit={reopenTicket}>
            <p className="text-sm font-medium">Deliberate reopen</p>
            <p className="text-xs opacity-70">
              Reopening is recorded with your user id, timestamp, and reason. This cannot be done
              silently.
            </p>
            {reopenedAt ? (
              <p className="text-xs opacity-60">
                Last reopen: {formatDateTime(reopenedAt)}
                {reopenReason ? ` — ${reopenReason}` : ""}
              </p>
            ) : null}
            <label className="form-control">
              <span className="label-text mb-1 text-sm">Reopen reason *</span>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                value={reopenReasonInput}
                onChange={(e) => setReopenReasonInput(e.target.value)}
                placeholder="Explain why this completed ticket must be reopened"
                required
              />
            </label>
            <button className="btn btn-warning btn-sm" disabled={loading === "reopen"}>
              {loading === "reopen" ? "Reopening…" : "Reopen completed ticket"}
            </button>
          </form>
        ) : (
          <p className="text-xs opacity-60">
            Managers can review work in progress. Completing a ticket is reserved for the assigned
            technician.
          </p>
        )}

        {noTimeExplanation ? (
          <p className="text-xs opacity-70">
            Zero-time explanation on file: {noTimeExplanation}
          </p>
        ) : null}
      </div>
    );
  }

  if (role !== "technician") return null;

  // Technician work documentation / Mark Work Complete live on My Assignments,
  // not on Support Ticket detail.
  return null;
}
