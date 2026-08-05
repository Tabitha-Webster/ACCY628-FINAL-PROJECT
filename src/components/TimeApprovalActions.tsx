"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  entryId: string;
  reviewerId: string;
};

export function TimeApprovalActions({ entryId, reviewerId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setLoading(decision === "approved" ? "approve" : "reject");
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("time_entries")
      .update({
        approval_status: decision,
        approved_by: reviewerId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="btn btn-xs btn-success"
          disabled={loading !== null}
          onClick={() => decide("approved")}
        >
          {loading === "approve" ? "…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn btn-xs btn-ghost"
          disabled={loading !== null}
          onClick={() => decide("rejected")}
        >
          {loading === "reject" ? "…" : "Reject"}
        </button>
      </div>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
