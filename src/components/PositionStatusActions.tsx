"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { HrPositionStatus } from "@/lib/types";

type Props = {
  positionId: string;
  status: HrPositionStatus;
};

export function PositionStatusActions({ positionId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"open" | "filled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "open" | "filled") {
    if (status === next || status === "closed") return;
    setError(null);
    setLoading(next);
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);

    const { error: updateError } = await supabase
      .from("hr_positions")
      .update({
        status: next,
        filled_at: next === "filled" ? today : null,
      })
      .eq("id", positionId);

    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  if (status === "closed") {
    return <span className="text-xs opacity-50">Closed</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {status !== "filled" ? (
          <button
            type="button"
            className="btn btn-xs btn-success"
            disabled={loading !== null}
            onClick={() => setStatus("filled")}
          >
            {loading === "filled" ? "…" : "Mark filled"}
          </button>
        ) : null}
        {status !== "open" ? (
          <button
            type="button"
            className="btn btn-xs btn-ghost"
            disabled={loading !== null}
            onClick={() => setStatus("open")}
          >
            {loading === "open" ? "…" : "Mark open"}
          </button>
        ) : null}
      </div>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}
