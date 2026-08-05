"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DataTable, EmptyState, Money, StatusBadge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";

export type InvoiceListRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  total_amount: number;
  amount_paid: number;
  remaining_balance: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_name: string;
  contract_name: string | null;
};

export function InvoiceListClient({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (status !== "all" && invoice.status !== status) return false;
      if (!q) return true;
      return (
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.customer_name.toLowerCase().includes(q) ||
        (invoice.contract_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, status, query]);

  const openBalance = invoices
    .filter((invoice) => !["canceled", "draft", "paid"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.remaining_balance, 0);
  const overdueBalance = invoices
    .filter((invoice) => invoice.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.remaining_balance, 0);

  async function generateMonthly() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/invoices/generate-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not generate monthly invoices." });
        return;
      }
      const createdCount = body.created?.length ?? 0;
      const skipCount = body.skipped?.length ?? 0;
      const errorCount = body.errors?.length ?? 0;
      const createdText =
        createdCount > 0
          ? `Created ${createdCount} monthly invoice(s) for ${body.periodLabel}.`
          : `No new monthly invoices were created for ${body.periodLabel}.`;
      const extra = [
        skipCount ? `${skipCount} skipped.` : "",
        errorCount ? `${errorCount} error(s).` : "",
      ]
        .filter(Boolean)
        .join(" ");
      setMessage({
        type: createdCount > 0 && errorCount === 0 ? "success" : errorCount ? "error" : "success",
        text: `${createdText} ${extra}`.trim(),
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong generating monthly invoices." });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Invoices</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{invoices.length}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Open balance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(openBalance)}</p>
        </div>
        <div className="rounded-box border border-warning/40 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Overdue</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(overdueBalance)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text mb-1">Search</span>
            <input
              className="input input-bordered input-sm w-full"
              placeholder="Invoice #, customer, or contract"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Status</span>
            <select className="select select-bordered select-sm w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="disputed">Disputed</option>
              <option value="canceled">Canceled</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={generateMonthly} disabled={generating}>
          {generating ? "Generating…" : "Generate monthly contract invoices"}
        </button>
      </div>

      {message ? (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}>
          <span>{message.text}</span>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices match this view"
          description="Generate monthly contract invoices or create one from Billing Review."
        />
      ) : (
        <DataTable
          headers={["Invoice", "Customer", "Contract", "Period", "Status", "Total", "Paid", "Balance", ""]}
        >
          {filtered.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <div className="font-medium">{invoice.invoice_number}</div>
                <div className="text-xs opacity-60">
                  {formatDate(invoice.invoice_date)} · due {formatDate(invoice.due_date)}
                </div>
              </td>
              <td>{invoice.customer_name}</td>
              <td className="text-sm">{invoice.contract_name ?? "—"}</td>
              <td className="text-xs">
                {invoice.billing_period_start
                  ? `${formatDate(invoice.billing_period_start)} – ${formatDate(invoice.billing_period_end)}`
                  : "—"}
              </td>
              <td>
                <StatusBadge status={invoice.status} />
              </td>
              <td>
                <Money value={invoice.total_amount} />
              </td>
              <td>
                <Money value={invoice.amount_paid} />
              </td>
              <td className="font-medium">
                <Money value={invoice.remaining_balance} />
              </td>
              <td className="text-right">
                <div className="flex justify-end gap-1">
                  {invoice.remaining_balance > 0 && !["draft", "canceled"].includes(invoice.status) ? (
                    <Link href={`/payments?invoiceId=${invoice.id}`} className="btn btn-primary btn-xs">
                      Record Payment
                    </Link>
                  ) : null}
                  <Link href={`/invoices/${invoice.id}`} className="btn btn-ghost btn-xs">
                    View
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
