"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string;
  managerId: string;
  currentStatus: string;
};

export function CustomerApprovalActions({ customerId, managerId, currentStatus }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function decide(decision: "approve" | "reject") {
    setError(null);
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError("Please enter a short approval or rejection note.");
      return;
    }
    setLoading(decision);
    const supabase = createClient();
    const approved = decision === "approve";

    const nextStatus = approved ? "active" : "rejected";
    const reviewedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("customers")
      .update({
        status: nextStatus,
        customer_status: nextStatus,
        approval_note: trimmedNote,
        reviewed_at: reviewedAt,
        reviewed_by: managerId,
      })
      .eq("id", customerId)
      .eq("status", "pending_approval");

    if (updateError) {
      // Fallback when manager-approval columns / rejected enum are not applied yet.
      // Prefer rejected when possible; only use inactive if rejected is unavailable.
      const preferRejected = await supabase
        .from("customers")
        .update({
          status: nextStatus,
          customer_status: nextStatus,
          notes: `${approved ? "Approved" : "Rejected"}: ${trimmedNote}`,
        })
        .eq("id", customerId)
        .eq("status", "pending_approval");

      let fallbackError = preferRejected.error;
      if (fallbackError && !approved && /rejected/i.test(fallbackError.message)) {
        const inactiveFallback = await supabase
          .from("customers")
          .update({
            status: "inactive",
            customer_status: "inactive",
            notes: `Rejected: ${trimmedNote}`,
          })
          .eq("id", customerId)
          .eq("status", "pending_approval");
        fallbackError = inactiveFallback.error;
      }

      if (fallbackError) {
        setLoading(null);
        setError(fallbackError.message || updateError.message);
        return;
      }
    }

    setLoading(null);
    setNote("");
    router.refresh();
  }

  if (currentStatus !== "pending_approval") {
    return <p className="text-xs opacity-60">No action needed.</p>;
  }

  return (
    <div className="space-y-2">
      <label className="form-control w-full">
        <span className="label-text mb-1 text-xs">Approval / rejection note</span>
        <textarea
          className="textarea textarea-bordered textarea-sm w-full"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Short note required"
        />
      </label>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={loading !== null}
          onClick={() => decide("approve")}
        >
          {loading === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={loading !== null}
          onClick={() => decide("reject")}
        >
          {loading === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </div>
  );
}
