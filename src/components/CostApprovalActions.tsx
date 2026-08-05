"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ApprovalStatus } from "@/lib/types";

type Stage = "manager" | "billing";

type Props = {
  costId: string;
  reviewerId: string;
  /** manager: pending → awaiting_billing; billing: awaiting_billing → approved */
  stage: Stage;
};

export function CostApprovalActions({ costId, reviewerId, stage }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setError(null);
    setLoading(decision);
    const supabase = createClient();

    const nextStatus: ApprovalStatus =
      decision === "reject" ? "rejected" : stage === "manager" ? "awaiting_billing" : "approved";

    const { error: updateError } = await supabase
      .from("direct_costs")
      .update({
        approval_status: nextStatus,
        approved_by: reviewerId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", costId);

    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  const approveLabel = stage === "manager" ? "Send to billing" : "Final approve";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn btn-xs btn-success"
          disabled={loading !== null}
          onClick={() => decide("approve")}
        >
          {loading === "approve" ? "…" : approveLabel}
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          disabled={loading !== null}
          onClick={() => decide("reject")}
        >
          {loading === "reject" ? "…" : "Reject"}
        </button>
      </div>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
