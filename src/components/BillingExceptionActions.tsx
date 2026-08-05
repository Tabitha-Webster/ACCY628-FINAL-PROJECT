"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ExceptionAction = {
  recordId: string;
  kind: "time_entry" | "direct_cost" | "additional_work";
  supportTicketId?: string | null;
};

export function BillingExceptionActions({ exception }: { exception: ExceptionAction }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setBusy(decision);
    const supabase = createClient();

    if (exception.kind === "time_entry") {
      const { error: updateError } = await supabase
        .from("time_entries")
        .update({ approval_status: decision })
        .eq("id", exception.recordId)
        .eq("approval_status", "pending");
      if (updateError) {
        setError(updateError.message);
        setBusy(null);
        return;
      }
    } else if (exception.kind === "direct_cost") {
      const { error: updateError } = await supabase
        .from("direct_costs")
        .update({ approval_status: decision })
        .eq("id", exception.recordId)
        .eq("approval_status", "pending");
      if (updateError) {
        setError(updateError.message);
        setBusy(null);
        return;
      }
    } else {
      const { error: updateError } = await supabase
        .from("additional_work_requests")
        .update({
          approval_status: decision,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", exception.recordId)
        .eq("approval_status", "pending");
      if (updateError) {
        setError(updateError.message);
        setBusy(null);
        return;
      }
      if (exception.supportTicketId) {
        await supabase
          .from("support_tickets")
          .update({ billable_approval_status: decision })
          .eq("id", exception.supportTicketId);
        if (decision === "approved") {
          await supabase
            .from("time_entries")
            .update({ approval_status: "approved" })
            .eq("support_ticket_id", exception.supportTicketId)
            .eq("approval_status", "pending");
        }
      }
    }

    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-success btn-xs" disabled={busy !== null} onClick={() => decide("approved")}>
        {busy === "approved" ? "Saving…" : "Approve"}
      </button>
      <button type="button" className="btn btn-error btn-outline btn-xs" disabled={busy !== null} onClick={() => decide("rejected")}>
        {busy === "rejected" ? "Saving…" : "Reject"}
      </button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
