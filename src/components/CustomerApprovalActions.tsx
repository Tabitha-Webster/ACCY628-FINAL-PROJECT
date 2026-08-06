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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function decide(decision: "approve" | "reject") {
    setError(null);
    setLoading(decision);
    const supabase = createClient();
    const approved = decision === "approve";
    const nextStatus = approved ? "active" : "rejected";
    const reviewedAt = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("customers")
      .update({
        status: nextStatus,
        customer_status: nextStatus,
        approval_note: null,
        reviewed_at: reviewedAt,
        reviewed_by: managerId,
      })
      .eq("id", customerId)
      .eq("status", "pending_approval")
      .select("id, status, name")
      .maybeSingle();

    if (updateError || !updated) {
      // Fallback when manager-approval columns / rejected enum are not applied yet.
      let preferRejected = await supabase
        .from("customers")
        .update({
          status: nextStatus,
          customer_status: nextStatus,
        })
        .eq("id", customerId)
        .eq("status", "pending_approval")
        .select("id, status, name")
        .maybeSingle();

      if (preferRejected.error && !approved && /rejected/i.test(preferRejected.error.message)) {
        preferRejected = await supabase
          .from("customers")
          .update({
            status: "inactive",
            customer_status: "inactive",
          })
          .eq("id", customerId)
          .eq("status", "pending_approval")
          .select("id, status, name")
          .maybeSingle();
      }

      if (preferRejected.error || !preferRejected.data) {
        setLoading(null);
        setError(
          preferRejected.error?.message ||
            updateError?.message ||
            "Could not update this customer. Refresh and try again."
        );
        return;
      }
    }

    setLoading(null);
    // Active customers appear on the shared Customers directory for all internal roles.
    if (approved) {
      router.push("/customers");
      router.refresh();
      return;
    }
    router.refresh();
  }

  if (currentStatus !== "pending_approval") {
    return <p className="text-xs opacity-60">No action needed.</p>;
  }

  return (
    <div className="space-y-2">
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
