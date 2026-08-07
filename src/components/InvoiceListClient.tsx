"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { DocumentNumber } from "@/components/SystemConfigProvider";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  type CompareOp,
  type MultiFilter,
  CompareFilter,
  DatePeriodFilter,
  DropdownHeader,
  MultiSelectFilter,
  StickyFilterTable,
  TextFilter,
  matchesAnySelected,
  matchesCompare,
  matchesDatePeriod,
  matchesText,
  useHeaderFilter,
} from "@/components/table-filters";
import type { InvoiceTicketRef } from "@/lib/invoice-tickets";

export type InvoiceListRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  remaining_balance: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_name: string;
  contract_name: string | null;
  tickets: InvoiceTicketRef[];
  contract_agreement_fee: number | null;
  sla_outcome: "gain" | "loss" | "even" | "unknown";
  sla_label: string;
};

const STATUS_OPTIONS = ["draft", "issued", "sent", "partially_paid", "paid", "overdue", "disputed", "canceled"];

type FilterKey =
  | "invoice"
  | "customer"
  | "tickets"
  | "dueDate"
  | "status"
  | "total"
  | "contractFee"
  | "sla";

export function InvoiceListClient({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter();
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<FilterKey>();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [ticketQuery, setTicketQuery] = useState("");
  const [dueYears, setDueYears] = useState<MultiFilter>(null);
  const [dueMonths, setDueMonths] = useState<MultiFilter>(null);
  const [statusFilter, setStatusFilter] = useState<MultiFilter>(null);
  const [totalOp, setTotalOp] = useState<CompareOp>("gt");
  const [totalValue, setTotalValue] = useState("");
  const [feeOp, setFeeOp] = useState<CompareOp>("gt");
  const [feeValue, setFeeValue] = useState("");
  const [slaFilter, setSlaFilter] = useState<MultiFilter>(null);

  const filtered = useMemo(
    () =>
      invoices.filter((invoice) => {
        const ticketHay = invoice.tickets.map((t) => `${t.ticket_number} ${t.title}`).join(" ");
        return (
          matchesText(invoice.invoice_number, invoiceQuery) &&
          matchesText(invoice.customer_name, customerQuery) &&
          matchesText(ticketHay, ticketQuery) &&
          matchesDatePeriod(invoice.due_date, dueYears, dueMonths) &&
          matchesAnySelected(invoice.status, statusFilter) &&
          matchesCompare(invoice.total_amount, totalOp, totalValue) &&
          matchesCompare(invoice.contract_agreement_fee ?? 0, feeOp, feeValue) &&
          matchesAnySelected(invoice.sla_outcome, slaFilter)
        );
      }),
    [
      invoices,
      invoiceQuery,
      customerQuery,
      ticketQuery,
      dueYears,
      dueMonths,
      statusFilter,
      totalOp,
      totalValue,
      feeOp,
      feeValue,
      slaFilter,
    ]
  );

  const activeCount = [
    invoiceQuery.trim(),
    customerQuery.trim(),
    ticketQuery.trim(),
    dueYears == null && dueMonths == null ? "" : "dueDate",
    statusFilter == null ? "" : "status",
    totalValue.trim(),
    feeValue.trim(),
    slaFilter == null ? "" : "sla",
  ].filter(Boolean).length;

  const openBalance = invoices
    .filter((invoice) => !["canceled", "draft", "paid"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.remaining_balance, 0);
  const overdueBalance = invoices
    .filter((invoice) => invoice.status === "overdue")
    .reduce((sum, invoice) => sum + invoice.remaining_balance, 0);

  function clearFilters() {
    setInvoiceQuery("");
    setCustomerQuery("");
    setTicketQuery("");
    setDueYears(null);
    setDueMonths(null);
    setStatusFilter(null);
    setTotalOp("gt");
    setTotalValue("");
    setFeeOp("gt");
    setFeeValue("");
    setSlaFilter(null);
    setOpenFilter(null);
  }

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
          ? `Created ${createdCount} draft monthly invoice(s) for ${body.periodLabel}. Review each draft before sending.`
          : `No new monthly invoices were created for ${body.periodLabel}.`;
      const extra = [skipCount ? `${skipCount} skipped.` : "", errorCount ? `${errorCount} error(s).` : ""]
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

  function slaClass(outcome: InvoiceListRow["sla_outcome"]) {
    if (outcome === "gain") return "text-success";
    if (outcome === "loss") return "text-error";
    return "opacity-70";
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-60">
            Showing {filtered.length} of {invoices.length}
          </span>
          {activeCount > 0 ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          ) : null}
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

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices match this view"
          description="Generate monthly contract invoices, complete a ticket (auto-creates a draft invoice), or create one from the billing Overview."
        />
      ) : (
        <StickyFilterTable tableRef={tableRef}>
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr>
              <DropdownHeader
                label="Invoice"
                active={Boolean(invoiceQuery.trim())}
                open={openFilter === "invoice"}
                onToggle={() => toggleFilter("invoice")}
              >
                <TextFilter value={invoiceQuery} onChange={setInvoiceQuery} placeholder="Search invoice #" />
              </DropdownHeader>
              <DropdownHeader
                label="Customer"
                active={Boolean(customerQuery.trim())}
                open={openFilter === "customer"}
                onToggle={() => toggleFilter("customer")}
              >
                <TextFilter value={customerQuery} onChange={setCustomerQuery} placeholder="Search customer" />
              </DropdownHeader>
              <DropdownHeader
                label="Tickets"
                active={Boolean(ticketQuery.trim())}
                open={openFilter === "tickets"}
                onToggle={() => toggleFilter("tickets")}
              >
                <TextFilter value={ticketQuery} onChange={setTicketQuery} placeholder="Search ticket #" />
              </DropdownHeader>
              <DropdownHeader
                label="Due Date"
                active={dueYears != null || dueMonths != null}
                open={openFilter === "dueDate"}
                onToggle={() => toggleFilter("dueDate")}
              >
                <DatePeriodFilter
                  dates={invoices.map((invoice) => invoice.due_date)}
                  years={dueYears}
                  months={dueMonths}
                  onYearsChange={setDueYears}
                  onMonthsChange={setDueMonths}
                />
              </DropdownHeader>
              <DropdownHeader
                label="Status"
                active={statusFilter != null}
                open={openFilter === "status"}
                onToggle={() => toggleFilter("status")}
              >
                <MultiSelectFilter
                  options={STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  formatLabel={(status) => status.replace(/_/g, " ")}
                />
              </DropdownHeader>
              <DropdownHeader
                label="Total"
                active={Boolean(totalValue.trim())}
                open={openFilter === "total"}
                align="right"
                onToggle={() => toggleFilter("total")}
              >
                <CompareFilter op={totalOp} value={totalValue} onOpChange={setTotalOp} onValueChange={setTotalValue} />
              </DropdownHeader>
              <DropdownHeader
                label="Contract fee"
                active={Boolean(feeValue.trim())}
                open={openFilter === "contractFee"}
                align="right"
                onToggle={() => toggleFilter("contractFee")}
              >
                <CompareFilter op={feeOp} value={feeValue} onOpChange={setFeeOp} onValueChange={setFeeValue} />
              </DropdownHeader>
              <DropdownHeader
                label="SLA gain/loss"
                active={slaFilter != null}
                open={openFilter === "sla"}
                onToggle={() => toggleFilter("sla")}
              >
                <MultiSelectFilter
                  options={["gain", "loss", "even", "unknown"]}
                  selected={slaFilter}
                  onChange={setSlaFilter}
                  formatLabel={(v) => (v === "unknown" ? "No SLA data" : v)}
                />
              </DropdownHeader>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center opacity-70">
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/invoices/${invoice.id}`} className="link link-hover font-medium">
                      <DocumentNumber kind="invoice" value={invoice.invoice_number} />
                    </Link>
                  </td>
                  <td>{invoice.customer_name}</td>
                  <td>
                    {invoice.tickets.length === 0 ? (
                      <span className="opacity-50">—</span>
                    ) : (
                      <ul className="space-y-0.5 text-xs">
                        {invoice.tickets.slice(0, 3).map((ticket) => (
                          <li key={ticket.id}>
                            <Link href={`/tickets/${ticket.id}`} className="link link-hover">
                              {ticket.ticket_number}
                            </Link>
                            <span className="opacity-60"> · {ticket.title}</span>
                          </li>
                        ))}
                        {invoice.tickets.length > 3 ? (
                          <li className="opacity-60">+{invoice.tickets.length - 3} more</li>
                        ) : null}
                      </ul>
                    )}
                  </td>
                  <td className="text-xs">{formatDate(invoice.due_date)}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td>
                    <Money value={invoice.total_amount} />
                  </td>
                  <td>
                    {invoice.contract_agreement_fee == null ? (
                      <span className="opacity-50">—</span>
                    ) : (
                      <Money value={invoice.contract_agreement_fee} />
                    )}
                  </td>
                  <td className={`text-xs font-medium ${slaClass(invoice.sla_outcome)}`}>
                    {invoice.sla_label}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </StickyFilterTable>
      )}
    </div>
  );
}
