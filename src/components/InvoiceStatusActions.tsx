"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

export function InvoiceStatusActions({
  invoiceId,
  status,
  sentAt,
  reviewedAt,
  disputeStatus,
  remainingBalance,
}: {
  invoiceId: string;
  status: string;
  sentAt: string | null;
  reviewedAt: string | null;
  disputeStatus: boolean;
  remainingBalance: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"review" | "sent" | "dispute" | "resolve" | null>(null);
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [amount, setAmount] = useState(remainingBalance > 0 ? remainingBalance.toFixed(2) : "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDispute, setShowDispute] = useState(false);

  const isDraft = status === "draft";
  const canReview = isDraft && !reviewedAt;
  const canMarkSent = !["canceled", "draft", "paid"].includes(status) && Boolean(reviewedAt);
  const alreadySent = Boolean(sentAt) || status === "sent";
  const isDisputed = disputeStatus || status === "disputed";

  async function reviewInvoice() {
    setBusy("review");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reviewNotes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not review this invoice." });
        return;
      }
      setMessage({ type: "success", text: "Invoice reviewed and issued. It can now be marked sent." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong reviewing this invoice." });
    } finally {
      setBusy(null);
    }
  }

  async function markSent() {
    setBusy("sent");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/mark-sent`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not mark invoice sent." });
        return;
      }
      setMessage({ type: "success", text: "Invoice marked as sent." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong marking this invoice sent." });
    } finally {
      setBusy(null);
    }
  }

  async function markDisputed() {
    setBusy("dispute");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, amount: Number(amount) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not mark invoice disputed." });
        return;
      }
      setShowDispute(false);
      setReason("");
      setMessage({ type: "success", text: "Invoice marked as disputed." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong opening this dispute." });
    } finally {
      setBusy(null);
    }
  }

  async function resolveDispute() {
    setBusy("resolve");
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not resolve the dispute." });
        return;
      }
      setMessage({ type: "success", text: "Dispute resolved. Invoice status was recalculated." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong resolving this dispute." });
    } finally {
      setBusy(null);
    }
  }

  if (status === "canceled" && !isDisputed) return null;

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Invoice actions</h2>
          {isDraft ? (
            <p className="mt-1 text-sm opacity-70">This is a draft. Review and issue it before sending.</p>
          ) : reviewedAt ? (
            <p className="mt-1 text-sm">Reviewed {formatDateTime(reviewedAt)}</p>
          ) : (
            <p className="mt-1 text-sm opacity-70">Not reviewed yet.</p>
          )}
          {sentAt ? (
            <p className="mt-1 text-sm">Sent {formatDateTime(sentAt)}</p>
          ) : isDraft ? null : (
            <p className="mt-1 text-sm opacity-70">Not marked sent yet.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canReview ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={reviewInvoice} disabled={busy !== null}>
              {busy === "review" ? "Saving…" : "Review and issue"}
            </button>
          ) : null}
          {canMarkSent ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={markSent} disabled={busy !== null || alreadySent}>
              {busy === "sent" ? "Saving…" : alreadySent ? "Marked sent" : "Mark as sent"}
            </button>
          ) : null}
          {isDisputed ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={resolveDispute} disabled={busy !== null}>
              {busy === "resolve" ? "Saving…" : "Resolve dispute"}
            </button>
          ) : status !== "canceled" && !isDraft ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowDispute((open) => !open)}>
              Mark as disputed
            </button>
          ) : null}
        </div>
      </div>

      {canReview ? (
        <label className="form-control">
          <span className="label-text mb-1">Review notes (optional)</span>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            rows={2}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Confirm amounts, period, and customer before issuing."
          />
        </label>
      ) : null}

      {showDispute && !isDisputed ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control sm:col-span-2">
            <span className="label-text mb-1">Dispute reason</span>
            <textarea
              className="textarea textarea-bordered textarea-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What is the customer disputing?"
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Disputed amount</span>
            <input
              className="input input-bordered input-sm"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn btn-error btn-sm" onClick={markDisputed} disabled={busy !== null}>
              {busy === "dispute" ? "Saving…" : "Save disputed status"}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"} py-2`}>
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
