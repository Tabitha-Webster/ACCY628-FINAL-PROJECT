"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  requestId: string;
  supportTicketId: string | null;
  reviewerId: string;
};

export function AdditionalWorkActions({ requestId, supportTicketId, reviewerId }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setLoading(decision === "approved" ? "approve" : "reject");
    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("additional_work_requests")
      .update({
        approval_status: decision,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes.trim() || null,
      })
      .eq("id", requestId);

    if (updateError) {
      setLoading(null);
      setError(updateError.message);
      return;
    }

    if (supportTicketId) {
      await supabase
        .from("support_tickets")
        .update({ billable_approval_status: decision })
        .eq("id", supportTicketId);

      if (decision === "approved") {
        const { data: pendingTime, error: pendingError } = await supabase
          .from("time_entries")
          .select("id")
          .eq("support_ticket_id", supportTicketId)
          .eq("approval_status", "pending");
        if (pendingError) {
          setLoading(null);
          setError(pendingError.message);
          return;
        }
        for (const row of pendingTime ?? []) {
          const res = await fetch("/api/billing/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "time_entry", id: row.id }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setLoading(null);
            setError(body.error ?? "The request was approved, but a related time entry could not be approved for billing.");
            return;
          }
        }
      }
    }

    setLoading(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <textarea
        className="textarea textarea-bordered textarea-sm w-full"
        rows={1}
        placeholder="Review notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn btn-success btn-sm" onClick={() => decide("approved")} disabled={loading !== null}>
          {loading === "approve" ? "Approving…" : "Approve"}
        </button>
        <button className="btn btn-error btn-outline btn-sm" onClick={() => decide("rejected")} disabled={loading !== null}>
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
