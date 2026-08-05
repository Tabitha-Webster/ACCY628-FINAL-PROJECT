"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hours, Money } from "@/components/ui";

type ProjectApprovalItem = {
  id: string;
  name: string;
  description: string | null;
  fixed_fee: number | null;
  estimated_billing_amount: number | null;
};

type ChangeRequestApprovalItem = {
  id: string;
  title: string;
  description: string;
  project_id: string | null;
  project_name?: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
};

export function CustomerProjectApprovalCard({
  project,
  currentUserId,
}: {
  project: ProjectApprovalItem;
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setLoading(decision);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        customer_approval_status: decision,
        status: decision === "approved" ? "approved" : "canceled",
      })
      .eq("id", project.id);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    void currentUserId;
    void notes;
    router.refresh();
  }

  return (
    <div className="rounded-box border border-warning/50 bg-warning/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-warning">Needs your approval</p>
          <p className="mt-1 font-semibold">{project.name}</p>
          {project.description ? <p className="mt-1 text-sm opacity-80">{project.description}</p> : null}
          <p className="mt-2 text-sm">
            Proposed amount:{" "}
            <Money value={Number(project.fixed_fee ?? 0) || Number(project.estimated_billing_amount ?? 0)} />
          </p>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      <textarea
        className="textarea textarea-bordered textarea-sm mt-3 w-full"
        rows={2}
        placeholder="Optional notes (kept for your records on this screen)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-success btn-sm" onClick={() => decide("approved")} disabled={loading !== null}>
          {loading === "approved" ? "Approving…" : "Approve Project"}
        </button>
        <button className="btn btn-error btn-outline btn-sm" onClick={() => decide("rejected")} disabled={loading !== null}>
          {loading === "rejected" ? "Rejecting…" : "Reject Project"}
        </button>
      </div>
    </div>
  );
}

export function CustomerChangeRequestApprovalCard({
  request,
  currentUserId,
}: {
  request: ChangeRequestApprovalItem;
  currentUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function decide(decision: "approved" | "rejected") {
    setError(null);
    setLoading(decision);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("additional_work_requests")
      .update({
        approval_status: decision,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes.trim() || `Customer ${decision} additional hours/price request.`,
      })
      .eq("id", request.id);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-box border border-warning/50 bg-base-100 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-warning">Additional cost approval</p>
      <p className="mt-1 font-semibold">{request.title}</p>
      {request.project_name ? <p className="text-xs opacity-60">Project: {request.project_name}</p> : null}
      <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{request.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-base-300 bg-base-200/40 p-2 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-60">Requested additional hours</p>
          <p className="font-semibold">
            {request.estimated_hours != null ? <Hours value={Number(request.estimated_hours)} /> : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide opacity-60">Requested additional price</p>
          <p className="font-semibold">
            {request.estimated_amount != null ? <Money value={Number(request.estimated_amount)} /> : "—"}
          </p>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      <textarea
        className="textarea textarea-bordered textarea-sm mt-3 w-full"
        rows={2}
        placeholder="Optional approval notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-success btn-sm" onClick={() => decide("approved")} disabled={loading !== null}>
          {loading === "approved" ? "Approving…" : "Approve Additional Work"}
        </button>
        <button className="btn btn-error btn-outline btn-sm" onClick={() => decide("rejected")} disabled={loading !== null}>
          {loading === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </div>
  );
}
