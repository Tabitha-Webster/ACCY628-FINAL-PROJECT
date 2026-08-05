"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export function ArSummaryHeader({
  openInvoiceCount,
  totalOutstanding,
  pastDueAmount,
  pastDueCount,
  escalatedCount,
}: {
  openInvoiceCount: number;
  totalOutstanding: number;
  pastDueAmount: number;
  pastDueCount: number;
  escalatedCount: number;
}) {
  const [showWarning, setShowWarning] = useState(pastDueCount > 0);

  useEffect(() => {
    if (!showWarning) return;
    const timer = window.setTimeout(() => setShowWarning(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showWarning]);

  const overdueMessage =
    pastDueCount > 0
      ? `${pastDueCount} invoice${pastDueCount === 1 ? "" : "s"} totaling ${formatCurrency(pastDueAmount)} ${
          pastDueCount === 1 ? "is" : "are"
        } past due.${
          escalatedCount > 0
            ? ` ${escalatedCount} ${
                escalatedCount === 1 ? "invoice is" : "invoices are"
              } more than 60 days overdue and should be escalated.`
            : ""
        }`
      : "No past-due invoices right now.";

  return (
    <>
      <div className="space-y-3">
        <div className="inline-block rounded-box border border-base-300 bg-base-100 px-3 py-2">
          <p className="text-xs uppercase tracking-wide opacity-60">Open Invoices</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{openInvoiceCount}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-box border border-base-300 bg-base-100 px-3 py-2">
            <p className="text-xs uppercase tracking-wide opacity-60">Total Outstanding</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(totalOutstanding)}</p>
          </div>

          <div className="group relative">
            <div
              className={`rounded-box border px-3 py-2 ${
                pastDueAmount > 0
                  ? "border-error bg-error/10 text-error"
                  : "border-success bg-success/10 text-success"
              }`}
            >
              <p className="text-xs uppercase tracking-wide opacity-80">Past Due</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(pastDueAmount)}</p>
            </div>
            <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-72 rounded-box border border-base-300 bg-base-100 p-3 text-sm text-base-content opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              <p className="font-semibold">Past due details</p>
              <p className="mt-1 opacity-80">{overdueMessage}</p>
            </div>
          </div>
        </div>
      </div>

      {showWarning ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-box border border-warning bg-warning px-4 py-2 text-sm text-warning-content shadow-lg"
        >
          <span>Overdue receivables require attention.</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            aria-label="Dismiss overdue warning"
            onClick={() => setShowWarning(false)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </>
  );
}
