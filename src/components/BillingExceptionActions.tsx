"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ExceptionAction = {
  recordId: string;
  kind: "time_entry" | "direct_cost" | "additional_work";
  supportTicketId?: string | null;
};

async function approveForBilling(type: "time_entry" | "direct_cost", id: string) {
  const res = await fetch("/api/billing/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Could not approve this item for billing.");
  }
}

export function BillingExceptionActions({ exception }: { exception: ExceptionAction }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setBusy(decision);
    const supabase = createClient();

    try {
      if (exception.kind === "time_entry" || exception.kind === "direct_cost") {
        if (decision === "approved") {
          await approveForBilling(exception.kind, exception.recordId);
        } else {
          const table = exception.kind === "time_entry" ? "time_entries" : "direct_costs";
          const { error: updateError } = await supabase
            .from(table)
            .update({ approval_status: "rejected" })
            .eq("id", exception.recordId)
            .eq("approval_status", "pending");
          if (updateError) throw new Error(updateError.message);
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
        if (updateError) throw new Error(updateError.message);

        if (exception.supportTicketId) {
          await supabase
            .from("support_tickets")
            .update({ billable_approval_status: decision })
            .eq("id", exception.supportTicketId);

          if (decision === "approved") {
            const { data: pendingTime, error: pendingError } = await supabase
              .from("time_entries")
              .select("id")
              .eq("support_ticket_id", exception.supportTicketId)
              .eq("approval_status", "pending");
            if (pendingError) throw new Error(pendingError.message);
            for (const row of pendingTime ?? []) {
              await approveForBilling("time_entry", row.id);
            }
          }
        }
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that decision.");
    } finally {
      setBusy(null);
    }
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
