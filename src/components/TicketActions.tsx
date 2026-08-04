"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";

type Props = {
  ticketId: string;
  customerId: string;
  contractId: string | null;
  status: string;
  assignedTechnicianId: string | null;
  technicianNotes: string | null;
  customerResolutionSummary: string | null;
  customerConfirmed: boolean | null;
  hasTimeLogged: boolean;
  currentUserId: string;
  role: UserRole;
};

export function TicketActions({
  ticketId,
  customerId,
  contractId,
  status,
  assignedTechnicianId,
  technicianNotes,
  customerResolutionSummary,
  customerConfirmed,
  hasTimeLogged,
  currentUserId,
  role,
}: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState(customerResolutionSummary ?? "");
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagTitle, setFlagTitle] = useState("");
  const [flagDescription, setFlagDescription] = useState("");
  const [flagHours, setFlagHours] = useState("");
  const [flagAmount, setFlagAmount] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isMyTicket = assignedTechnicianId === currentUserId;
  const isTechnician = role === "technician";
  const canWorkTicket = isTechnician && (isMyTicket || !assignedTechnicianId);
  const isOpenStatus = !["resolved", "closed", "canceled"].includes(status);

  async function startWork() {
    setError(null);
    setMessage(null);
    setLoading("start");
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({
        status: "in_progress",
        assigned_technician_id: assignedTechnicianId ?? currentUserId,
      })
      .eq("id", ticketId);
    if (!updateError) {
      await supabase
        .from("support_tickets")
        .update({ actual_response_at: nowIso })
        .eq("id", ticketId)
        .is("actual_response_at", null);
    }
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Work started.");
    router.refresh();
  }

  async function saveNote() {
    if (!note.trim()) return;
    setError(null);
    setMessage(null);
    setLoading("note");
    const supabase = createClient();
    const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const nextNotes = technicianNotes ? `${technicianNotes}\n\n[${stamp}] ${note.trim()}` : `[${stamp}] ${note.trim()}`;
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ technician_notes: nextNotes })
      .eq("id", ticketId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNote("");
    setMessage("Note added.");
    router.refresh();
  }

  async function markComplete() {
    setError(null);
    setMessage(null);

    const warnings: string[] = [];
    if (!resolutionSummary.trim()) warnings.push("no resolution summary has been entered");
    if (!hasTimeLogged) warnings.push("no time has been logged against this ticket");
    if (warnings.length) {
      const proceed = window.confirm(
        `Heads up: ${warnings.join(" and ")}. Mark this ticket complete anyway?`
      );
      if (!proceed) return;
    }

    setLoading("complete");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({
        status: "resolved",
        completed_at: new Date().toISOString(),
        customer_resolution_summary: resolutionSummary.trim() || null,
      })
      .eq("id", ticketId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Ticket marked resolved.");
    router.refresh();
  }

  async function submitFlag(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!flagTitle.trim() || !flagDescription.trim()) {
      setError("Please provide a title and description for the additional work request.");
      return;
    }
    setLoading("flag");
    const supabase = createClient();
    const { error: insertError } = await supabase.from("additional_work_requests").insert({
      customer_id: customerId,
      contract_id: contractId,
      support_ticket_id: ticketId,
      requested_by: currentUserId,
      title: flagTitle.trim(),
      description: flagDescription.trim(),
      estimated_hours: flagHours ? Number(flagHours) : null,
      estimated_amount: flagAmount ? Number(flagAmount) : null,
    });
    if (!insertError) {
      await supabase
        .from("support_tickets")
        .update({ classification: "out_of_scope", status: "waiting_on_approval", billable_approval_status: "pending" })
        .eq("id", ticketId);
    }
    setLoading(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowFlagForm(false);
    setFlagTitle("");
    setFlagDescription("");
    setFlagHours("");
    setFlagAmount("");
    setMessage("Flagged as out of scope. An additional work request was created for manager review.");
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
        <button className="btn btn-success btn-sm mt-3" onClick={confirmResolved} disabled={loading === "confirm"}>
          {loading === "confirm" ? "Confirming…" : "Confirm Resolved"}
        </button>
      </div>
    );
  }

  if (!isTechnician) return null;

  return (
    <div className="space-y-4 rounded-box border border-base-300 bg-base-100 p-4">
      <p className="text-sm font-semibold">Technician Actions</p>

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {!canWorkTicket ? (
        <p className="text-sm opacity-60">This ticket is assigned to another technician.</p>
      ) : (
        <>
          {isOpenStatus && status !== "in_progress" ? (
            <button className="btn btn-primary btn-sm" onClick={startWork} disabled={loading === "start"}>
              {loading === "start" ? "Starting…" : "Start Work"}
            </button>
          ) : null}

          <div className="form-control">
            <label className="label-text mb-1 text-sm font-medium">Add a note</label>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you find or do?"
            />
            <button className="btn btn-outline btn-sm mt-2 w-fit" onClick={saveNote} disabled={loading === "note" || !note.trim()}>
              {loading === "note" ? "Saving…" : "Add Note"}
            </button>
          </div>

          {isOpenStatus ? (
            <div className="form-control border-t border-base-300 pt-3">
              <label className="label-text mb-1 text-sm font-medium">Resolution summary (shown to customer)</label>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Summarize what was resolved…"
              />
              <button className="btn btn-success btn-sm mt-2 w-fit" onClick={markComplete} disabled={loading === "complete"}>
                {loading === "complete" ? "Completing…" : "Mark Complete"}
              </button>
            </div>
          ) : null}

          <div className="border-t border-base-300 pt-3">
            {!showFlagForm ? (
              <button className="btn btn-warning btn-outline btn-sm" onClick={() => setShowFlagForm(true)}>
                Flag as Out of Scope
              </button>
            ) : (
              <form className="space-y-2" onSubmit={submitFlag}>
                <p className="text-sm font-medium">Additional Work Request</p>
                <input
                  className="input input-bordered w-full input-sm"
                  placeholder="Short title"
                  value={flagTitle}
                  onChange={(e) => setFlagTitle(e.target.value)}
                  required
                />
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  placeholder="Why is this outside the contract's included scope?"
                  value={flagDescription}
                  onChange={(e) => setFlagDescription(e.target.value)}
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input input-bordered input-sm"
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder="Est. hours"
                    value={flagHours}
                    onChange={(e) => setFlagHours(e.target.value)}
                  />
                  <input
                    className="input input-bordered input-sm"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Est. amount ($)"
                    value={flagAmount}
                    onChange={(e) => setFlagAmount(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-warning btn-sm" disabled={loading === "flag"}>
                    {loading === "flag" ? "Submitting…" : "Submit Request"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFlagForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
