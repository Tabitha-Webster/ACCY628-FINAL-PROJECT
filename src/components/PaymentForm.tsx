"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, statusLabel } from "@/lib/format";

export type PayableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  status: string;
  remainingBalance: number;
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "ach", label: "ACH Transfer" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "wire", label: "Wire Transfer" },
  { value: "other", label: "Other" },
];

export function PaymentForm({
  invoices,
  initialInvoiceId,
  mode = "staff",
}: {
  invoices: PayableInvoice[];
  initialInvoiceId?: string;
  mode?: "staff" | "customer";
}) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(() =>
    invoices.some((invoice) => invoice.id === initialInvoiceId) ? initialInvoiceId! : (invoices[0]?.id ?? "")
  );
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("ach");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const effectiveInvoiceId = invoices.some((invoice) => invoice.id === invoiceId)
    ? invoiceId
    : (invoices[0]?.id ?? "");
  const selectedInvoice = useMemo(
    () => invoices.find((inv) => inv.id === effectiveInvoiceId),
    [invoices, effectiveInvoiceId]
  );
  const paymentMethods =
    mode === "customer"
      ? PAYMENT_METHODS.filter((method) => ["ach", "credit_card"].includes(method.value))
      : PAYMENT_METHODS;
  const enteredAmount = Number(amount);
  const enteredCents = Math.round(enteredAmount * 100);
  const balanceCents = Math.round((selectedInvoice?.remainingBalance ?? 0) * 100);
  const hasValidProjection =
    amount.trim() !== "" &&
    Number.isFinite(enteredAmount) &&
    enteredCents > 0 &&
    enteredCents <= balanceCents;
  const projectedRemainingBalance = hasValidProjection ? Math.max(0, balanceCents - enteredCents) / 100 : null;
  const projectedStatus =
    projectedRemainingBalance == null ? null : projectedRemainingBalance === 0 ? "paid" : "partially_paid";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const amountValue = Number(amount);
    if (!effectiveInvoiceId) {
      setMessage({ type: "error", text: "Select an invoice to apply this payment to." });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage({ type: "error", text: "Enter a payment amount greater than zero." });
      return;
    }
    if (
      selectedInvoice &&
      Math.round(amountValue * 100) > Math.round(selectedInvoice.remainingBalance * 100)
    ) {
      setMessage({
        type: "error",
        text: `Payment cannot exceed the remaining balance of ${formatCurrency(selectedInvoice.remainingBalance)}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: effectiveInvoiceId,
          amount: amountValue,
          paymentDate,
          paymentMethod,
          referenceNumber: referenceNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Failed to record payment." });
        return;
      }
      setMessage({
        type: "success",
        text:
          mode === "customer"
            ? `Demo payment ${body.payment.paymentNumber} submitted for ${formatCurrency(body.payment.amount)}. Remaining balance: ${formatCurrency(body.invoice.remainingBalance)}. Status: ${statusLabel(body.invoice.status)}.`
            : `Payment ${body.payment.paymentNumber} recorded for ${formatCurrency(body.payment.amount)}. Remaining balance: ${formatCurrency(body.invoice.remainingBalance)}. Status: ${statusLabel(body.invoice.status)}.`,
      });
      setAmount("");
      setReferenceNumber("");
      setNotes("");
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong recording the payment. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-6 text-center text-sm opacity-70">
        There are no invoices with an outstanding balance right now.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div>
          <h2 className="card-title text-base">{mode === "customer" ? "Make a Payment" : "Record a Payment"}</h2>
          <p className="mt-1 text-sm opacity-70">
            {mode === "customer"
              ? "Choose an open invoice and submit a full or partial demo payment."
              : "Apply received cash to one open customer invoice. Partial payments are supported."}
          </p>
        </div>

        {mode === "customer" ? (
          <div className="alert alert-info text-sm">
            <span>
              Class demo only: no bank or card details are collected, and no real funds will be transferred.
            </span>
          </div>
        ) : null}

        {message ? (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"} text-sm`}>
            <span>{message.text}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="form-control w-full">
            <span className="label-text mb-1">Invoice</span>
            <select
              className="select select-bordered w-full"
              value={effectiveInvoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setAmount("");
              }}
              required
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber}
                  {mode === "staff" ? ` · ${inv.customerName}` : ""} · Due {inv.dueDate}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">Balance</span>
            <input
              type="text"
              className="input input-bordered w-full bg-base-200"
              value={selectedInvoice ? formatCurrency(selectedInvoice.remainingBalance) : ""}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={selectedInvoice?.remainingBalance}
              className="input input-bordered w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
            {selectedInvoice ? (
              <div className="mt-1 flex justify-end text-xs">
                <button
                  type="button"
                  className="link link-primary"
                  onClick={() => setAmount(selectedInvoice.remainingBalance.toFixed(2))}
                >
                  Apply full balance
                </button>
              </div>
            ) : null}
          </label>

          {mode === "staff" ? (
            <label className="form-control w-full">
              <span className="label-text mb-1">Payment Date</span>
              <input
                type="date"
                className="input input-bordered w-full"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </label>
          ) : null}

          <label className="form-control w-full">
            <span className="label-text mb-1">Payment Method</span>
            <select
              className="select select-bordered w-full"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {paymentMethods.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          {mode === "staff" ? (
            <>
              <label className="form-control w-full">
                <span className="label-text mb-1">Reference Number</span>
                <input
                  className="input input-bordered w-full"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Check #, transaction ID, etc."
                />
              </label>

              <label className="form-control w-full sm:col-span-2">
                <span className="label-text mb-1">Notes</span>
                <textarea
                  className="textarea textarea-bordered w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </label>
            </>
          ) : null}
        </div>

        {selectedInvoice ? (
          <div className="rounded-box bg-base-200 p-4 text-sm">
            <p>
              <span className="font-medium">{selectedInvoice.invoiceNumber}</span>
              <span className="opacity-70"> · {selectedInvoice.customerName}</span>
              <span className="opacity-70"> · Due {selectedInvoice.dueDate}</span>
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-60">Current Balance</dt>
                <dd className="font-medium">{formatCurrency(selectedInvoice.remainingBalance)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-60">Payment</dt>
                <dd className="font-medium">
                  {hasValidProjection ? formatCurrency(enteredAmount) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-60">Balance After Payment</dt>
                <dd className="font-medium">
                  {projectedRemainingBalance == null ? "—" : formatCurrency(projectedRemainingBalance)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-60">Status After Payment</dt>
                <dd className="font-medium">
                  {projectedStatus ? statusLabel(projectedStatus) : statusLabel(selectedInvoice.status)}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting
              ? mode === "customer"
                ? "Submitting…"
                : "Recording…"
              : mode === "customer"
                ? "Submit Demo Payment"
                : "Record Payment"}
          </button>
        </div>
      </div>
    </form>
  );
}
