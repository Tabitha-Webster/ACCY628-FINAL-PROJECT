"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";
import { TechnicianWorkPanel } from "@/components/TechnicianWorkPanel";
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
  currentUserId: string;
  role: UserRole;
  internalCostRate: number;
  contractHourlyRate: number | null;
  recordedHours: number;
  hasTimeEntryDescriptions: boolean;
  technicians?: TechnicianOption[];
};

export function TicketActions({
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
  customerConfirmed,
  classification,
  billableApprovalStatus,
  noTimeExplanation,
  reopenedAt,
  reopenReason,
  currentUserId,
  role,
  internalCostRate,
  contractHourlyRate,
  recordedHours,
  hasTimeEntryDescriptions,
  technicians = [],
}: Props) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState(assignedTechnicianId ?? "");
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isCompleted = status === "resolved" || status === "closed";

  async function assignTechnician(e: React.FormEvent) {
    e.preventDefault();
    if (!assigneeId) {
      setError("Select a technician to assign.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading("assign");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({
        assigned_technician_id: assigneeId,
        status: status === "new" ? "assigned" : status,
      })
      .eq("id", ticketId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
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

  return (
    <TechnicianWorkPanel
      ticketId={ticketId}
      customerId={customerId}
      contractId={contractId}
      status={status}
      priority={priority}
      assignedTechnicianId={assignedTechnicianId}
      actualResponseAt={actualResponseAt}
      technicianNotes={technicianNotes}
      completionNotes={completionNotes}
      customerResolutionSummary={customerResolutionSummary}
      classification={classification}
      billableApprovalStatus={billableApprovalStatus}
      currentUserId={currentUserId}
      internalCostRate={internalCostRate}
      contractHourlyRate={contractHourlyRate}
      recordedHours={recordedHours}
      hasTimeEntryDescriptions={hasTimeEntryDescriptions}
    />
  );
}
