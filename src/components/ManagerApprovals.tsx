"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hours, Money, StatusBadge } from "@/components/ui";

type PendingProject = {
  id: string;
  name: string;
  status: string;
  customer_name: string;
  customer_approval_status: string | null;
};

type PendingChangeRequest = {
  id: string;
  title: string;
  project_id: string | null;
  project_name: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
};

type PendingMilestone = {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
};

export function ManagerApprovalQueue({
  currentUserId,
  projectsAwaitingCustomer,
  proposedProjects,
  pendingChangeRequests,
  pendingMilestones,
}: {
  currentUserId: string;
  projectsAwaitingCustomer: PendingProject[];
  proposedProjects: PendingProject[];
  pendingChangeRequests: PendingChangeRequest[];
  pendingMilestones: PendingMilestone[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const total =
    projectsAwaitingCustomer.length +
    proposedProjects.length +
    pendingChangeRequests.length +
    pendingMilestones.length;

  async function decideChangeRequest(requestId: string, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`cr-${requestId}-${decision}`);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("additional_work_requests")
      .update({
        approval_status: decision,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes.trim() || null,
      })
      .eq("id", requestId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function decideMilestone(milestoneId: string, decision: "approved" | "rejected") {
    setError(null);
    setLoading(`ms-${milestoneId}-${decision}`);
    const supabase = createClient();
    const patch: Record<string, unknown> = { approval_status: decision };
    if (decision === "approved") {
      patch.completed = true;
      patch.completed_at = new Date().toISOString();
    }
    const { error: updateError } = await supabase.from("project_milestones").update(patch).eq("id", milestoneId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function sendForCustomerApproval(projectId: string) {
    setError(null);
    setLoading(`send-${projectId}`);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        status: "awaiting_customer_approval",
        customer_approval_status: "pending",
      })
      .eq("id", projectId);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  if (total === 0) {
    return (
      <div className="mb-6 rounded-box border border-dashed border-base-300 bg-base-100 p-6 text-center">
        <p className="font-medium">Manager approval queue is clear</p>
        <p className="mt-1 text-sm opacity-70">No proposed projects, pending change requests, or milestone approvals right now.</p>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Manager Approval Queue</h2>
          <p className="text-xs opacity-70">{total} item{total === 1 ? "" : "s"} need attention</p>
        </div>
      </div>
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}

      {proposedProjects.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-60">Send to customer</h3>
          {proposedProjects.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-3">
              <div>
                <Link href={`/projects/${p.id}`} className="link link-hover font-medium">
                  {p.name}
                </Link>
                <p className="text-xs opacity-60">{p.customer_name}</p>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => sendForCustomerApproval(p.id)}
                disabled={loading !== null}
              >
                {loading === `send-${p.id}` ? "Sending…" : "Send for Customer Approval"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {projectsAwaitingCustomer.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-60">Waiting on customer</h3>
          {projectsAwaitingCustomer.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-3">
              <div>
                <Link href={`/projects/${p.id}`} className="link link-hover font-medium">
                  {p.name}
                </Link>
                <p className="text-xs opacity-60">{p.customer_name}</p>
              </div>
              <StatusBadge status="pending" />
            </div>
          ))}
        </div>
      ) : null}

      {pendingChangeRequests.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-60">Out-of-scope / change requests</h3>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full max-w-xl"
            rows={1}
            placeholder="Optional review notes for your next decision"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {pendingChangeRequests.map((r) => (
            <div key={r.id} className="rounded-box border border-warning/40 bg-base-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <Link href={r.project_id ? `/projects/${r.project_id}` : "/projects"} className="text-xs link link-hover opacity-70">
                    {r.project_name}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span>
                      Hours: <strong>{r.estimated_hours != null ? <Hours value={Number(r.estimated_hours)} /> : "—"}</strong>
                    </span>
                    <span>
                      Price: <strong>{r.estimated_amount != null ? <Money value={Number(r.estimated_amount)} /> : "—"}</strong>
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => decideChangeRequest(r.id, "approved")}
                    disabled={loading !== null}
                  >
                    {loading === `cr-${r.id}-approved` ? "…" : "Approve"}
                  </button>
                  <button
                    className="btn btn-error btn-outline btn-sm"
                    onClick={() => decideChangeRequest(r.id, "rejected")}
                    disabled={loading !== null}
                  >
                    {loading === `cr-${r.id}-rejected` ? "…" : "Reject"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pendingMilestones.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-60">Milestone approvals</h3>
          {pendingMilestones.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 bg-base-100 p-3">
              <div>
                <p className="font-medium">{m.name}</p>
                <Link href={`/projects/${m.project_id}`} className="text-xs link link-hover opacity-70">
                  {m.project_name}
                </Link>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => decideMilestone(m.id, "approved")}
                  disabled={loading !== null}
                >
                  {loading === `ms-${m.id}-approved` ? "…" : "Approve"}
                </button>
                <button
                  className="btn btn-error btn-outline btn-sm"
                  onClick={() => decideMilestone(m.id, "rejected")}
                  disabled={loading !== null}
                >
                  {loading === `ms-${m.id}-rejected` ? "…" : "Reject"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
