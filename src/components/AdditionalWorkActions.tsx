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

    if (!updateError && decision === "approved" && supportTicketId) {
      await supabase
        .from("time_entries")
        .update({ approval_status: "approved" })
        .eq("support_ticket_id", supportTicketId)
        .eq("approval_status", "pending");
      await supabase
        .from("support_tickets")
        .update({ billable_approval_status: "approved" })
        .eq("id", supportTicketId);
    }
    if (!updateError && decision === "rejected" && supportTicketId) {
      await supabase
        .from("support_tickets")
        .update({ billable_approval_status: "rejected" })
        .eq("id", supportTicketId);
    }

    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
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
