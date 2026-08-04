"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

export type PayableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  remainingBalance: number;
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "ach", label: "ACH Transfer" },
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "wire", label: "Wire Transfer" },
  { value: "other", label: "Other" },
];

export function PaymentForm({ invoices }: { invoices: PayableInvoice[] }) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("ach");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedInvoice = useMemo(() => invoices.find((inv) => inv.id === invoiceId), [invoices, invoiceId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const amountValue = Number(amount);
    if (!invoiceId) {
      setMessage({ type: "error", text: "Select an invoice to apply this payment to." });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage({ type: "error", text: "Enter a payment amount greater than zero." });
      return;
    }
    if (selectedInvoice && amountValue > selectedInvoice.remainingBalance + 0.01) {
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
          invoiceId,
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
        text: `Payment ${body.payment.paymentNumber} recorded for ${formatCurrency(body.payment.amount)}.`,
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
        <h2 className="card-title text-base">Record a Payment</h2>

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
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              required
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} · {inv.customerName} · Balance {formatCurrency(inv.remainingBalance)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control w-full">
            <span className="label-text mb-1">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className="input input-bordered w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
            {selectedInvoice ? (
              <span className="mt-1 text-xs opacity-60">
                Remaining balance: {formatCurrency(selectedInvoice.remainingBalance)}
              </span>
            ) : null}
          </label>

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

          <label className="form-control w-full">
            <span className="label-text mb-1">Payment Method</span>
            <select
              className="select select-bordered w-full"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

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
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>
      </div>
    </form>
  );
}
