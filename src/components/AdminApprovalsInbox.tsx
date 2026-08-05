"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Hours, Money, StatusBadge } from "@/components/ui";

export type PendingWork = {
  id: string;
  title: string;
  estimated_hours: number | null;
  estimated_amount: number | null;
  created_at: string;
  support_ticket_id: string | null;
  customerName: string;
};

export type PendingTime = {
  id: string;
  hours_worked: number;
  work_date: string;
  description: string;
  technicianName: string;
  customerName: string;
};

export type PendingCost = {
  id: string;
  cost_category: string;
  internal_cost: number;
  billable_amount: number | null;
  cost_date: string;
  description: string;
  customerName: string;
};

type Props = {
  reviewerId: string;
  pendingWork: PendingWork[];
  pendingTime: PendingTime[];
  pendingCosts: PendingCost[];
};

export function AdminApprovalsInbox({ reviewerId, pendingWork, pendingTime, pendingCosts }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function noteFor(key: string) {
    return notes[key] ?? "";
  }

  async function decideWork(id: string, supportTicketId: string | null, decision: "approved" | "rejected") {
    const key = `work:${id}:${decision}`;
    setError(null);
    setLoadingKey(key);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("additional_work_requests")
      .update({
        approval_status: decision,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: noteFor(`work:${id}`).trim() || null,
      })
      .eq("id", id);

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

    setLoadingKey(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setHidden((prev) => new Set(prev).add(`work:${id}`));
    router.refresh();
  }

  async function decideTime(id: string, decision: "approved" | "rejected") {
    const key = `time:${id}:${decision}`;
    setError(null);
    setLoadingKey(key);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("time_entries")
      .update({ approval_status: decision })
      .eq("id", id);
    setLoadingKey(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setHidden((prev) => new Set(prev).add(`time:${id}`));
    router.refresh();
  }

  async function decideCost(id: string, decision: "approved" | "rejected") {
    const key = `cost:${id}:${decision}`;
    setError(null);
    setLoadingKey(key);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("direct_costs")
      .update({ approval_status: decision })
      .eq("id", id);
    setLoadingKey(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setHidden((prev) => new Set(prev).add(`cost:${id}`));
    router.refresh();
  }

  const work = pendingWork.filter((w) => !hidden.has(`work:${w.id}`));
  const time = pendingTime.filter((t) => !hidden.has(`time:${t.id}`));
  const costs = pendingCosts.filter((c) => !hidden.has(`cost:${c.id}`));
  const total = work.length + time.length + costs.length;

  return (
    <div className="space-y-8">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      <p className="text-sm opacity-70">
        {total === 0 ? "Inbox clear — nothing pending approval." : `${total} item${total === 1 ? "" : "s"} waiting on a decision.`}
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Additional work ({work.length})
        </h2>
        {work.length === 0 ? (
          <p className="text-sm opacity-50">No pending additional work requests.</p>
        ) : (
          <div className="space-y-3">
            {work.map((w) => {
              const nk = `work:${w.id}`;
              return (
                <div key={w.id} className="rounded-box border border-base-300 bg-base-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{w.title}</p>
                      <p className="text-xs opacity-60">
                        {w.customerName} · est. <Hours value={Number(w.estimated_hours ?? 0)} /> ·{" "}
                        <Money value={Number(w.estimated_amount ?? 0)} />
                      </p>
                    </div>
                    <StatusBadge status="pending" />
                  </div>
                  <textarea
                    className="textarea textarea-bordered textarea-sm mt-3 w-full"
                    rows={1}
                    placeholder="Review notes (optional)"
                    value={noteFor(nk)}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [nk]: e.target.value }))}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      className="btn btn-success btn-sm"
                      disabled={loadingKey !== null}
                      onClick={() => decideWork(w.id, w.support_ticket_id, "approved")}
                    >
                      {loadingKey === `work:${w.id}:approved` ? "Approving…" : "Approve"}
                    </button>
                    <button
                      className="btn btn-error btn-outline btn-sm"
                      disabled={loadingKey !== null}
                      onClick={() => decideWork(w.id, w.support_ticket_id, "rejected")}
                    >
                      {loadingKey === `work:${w.id}:rejected` ? "Rejecting…" : "Reject"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Time entries ({time.length})
        </h2>
        {time.length === 0 ? (
          <p className="text-sm opacity-50">No pending time entries.</p>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Technician</th>
                  <th>Customer</th>
                  <th>Hours</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {time.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap">{t.work_date}</td>
                    <td>{t.technicianName}</td>
                    <td>{t.customerName}</td>
                    <td>
                      <Hours value={Number(t.hours_worked)} />
                    </td>
                    <td className="max-w-xs truncate text-xs">{t.description}</td>
                    <td className="whitespace-nowrap">
                      <button
                        className="btn btn-success btn-xs mr-1"
                        disabled={loadingKey !== null}
                        onClick={() => decideTime(t.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-error btn-outline btn-xs"
                        disabled={loadingKey !== null}
                        onClick={() => decideTime(t.id, "rejected")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Direct costs ({costs.length})
        </h2>
        {costs.length === 0 ? (
          <p className="text-sm opacity-50">No pending direct costs.</p>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Internal</th>
                  <th>Billable</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">{c.cost_date}</td>
                    <td>{c.customerName}</td>
                    <td className="text-xs">{c.cost_category}</td>
                    <td>
                      <Money value={Number(c.internal_cost)} />
                    </td>
                    <td>
                      <Money value={Number(c.billable_amount ?? 0)} />
                    </td>
                    <td className="max-w-xs truncate text-xs">{c.description}</td>
                    <td className="whitespace-nowrap">
                      <button
                        className="btn btn-success btn-xs mr-1"
                        disabled={loadingKey !== null}
                        onClick={() => decideCost(c.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-error btn-outline btn-xs"
                        disabled={loadingKey !== null}
                        onClick={() => decideCost(c.id, "rejected")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
