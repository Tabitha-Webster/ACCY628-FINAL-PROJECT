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
};

const STATUS_OPTIONS = ["draft", "issued", "sent", "partially_paid", "paid", "overdue", "disputed", "canceled"];

type FilterKey = "invoice" | "customer" | "contract" | "dueDate" | "status" | "total" | "balance";

export function InvoiceListClient({ invoices }: { invoices: InvoiceListRow[] }) {
  const router = useRouter();
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<FilterKey>();
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [contractQuery, setContractQuery] = useState("");
  const [dueYears, setDueYears] = useState<MultiFilter>(null);
  const [dueMonths, setDueMonths] = useState<MultiFilter>(null);
  const [statusFilter, setStatusFilter] = useState<MultiFilter>(null);
  const [totalOp, setTotalOp] = useState<CompareOp>("gt");
  const [totalValue, setTotalValue] = useState("");
  const [balanceOp, setBalanceOp] = useState<CompareOp>("gt");
  const [balanceValue, setBalanceValue] = useState("");

  const filtered = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          matchesText(invoice.invoice_number, invoiceQuery) &&
          matchesText(invoice.customer_name, customerQuery) &&
          matchesText(invoice.contract_name, contractQuery) &&
          matchesDatePeriod(invoice.due_date, dueYears, dueMonths) &&
          matchesAnySelected(invoice.status, statusFilter) &&
          matchesCompare(invoice.total_amount, totalOp, totalValue) &&
          matchesCompare(invoice.remaining_balance, balanceOp, balanceValue)
      ),
    [invoices, invoiceQuery, customerQuery, contractQuery, dueYears, dueMonths, statusFilter, totalOp, totalValue, balanceOp, balanceValue]
  );

  const activeCount = [
    invoiceQuery.trim(),
    customerQuery.trim(),
    contractQuery.trim(),
    dueYears == null && dueMonths == null ? "" : "dueDate",
    statusFilter == null ? "" : "status",
    totalValue.trim(),
    balanceValue.trim(),
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
    setContractQuery("");
    setDueYears(null);
    setDueMonths(null);
    setStatusFilter(null);
    setTotalOp("gt");
    setTotalValue("");
    setBalanceOp("gt");
    setBalanceValue("");
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
      const extra = [skipCount ? `${skipCount} skipped.` : "", errorCount ? `${errorCount} error(s).` : ""].filter(Boolean).join(" ");
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
          description="Generate monthly contract invoices or create one from the billing Overview."
        />
      ) : (
        <StickyFilterTable tableRef={tableRef}>
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr>
              <DropdownHeader label="Invoice" active={Boolean(invoiceQuery.trim())} open={openFilter === "invoice"} onToggle={() => toggleFilter("invoice")}>
                <TextFilter value={invoiceQuery} onChange={setInvoiceQuery} placeholder="Search invoice #" />
              </DropdownHeader>
              <DropdownHeader label="Customer" active={Boolean(customerQuery.trim())} open={openFilter === "customer"} onToggle={() => toggleFilter("customer")}>
                <TextFilter value={customerQuery} onChange={setCustomerQuery} placeholder="Search customer" />
              </DropdownHeader>
              <DropdownHeader label="Contract" active={Boolean(contractQuery.trim())} open={openFilter === "contract"} onToggle={() => toggleFilter("contract")}>
                <TextFilter value={contractQuery} onChange={setContractQuery} placeholder="Search contract" />
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
              <DropdownHeader label="Status" active={statusFilter != null} open={openFilter === "status"} onToggle={() => toggleFilter("status")}>
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
                label="Balance"
                active={Boolean(balanceValue.trim())}
                open={openFilter === "balance"}
                align="right"
                onToggle={() => toggleFilter("balance")}
              >
                <CompareFilter op={balanceOp} value={balanceValue} onOpChange={setBalanceOp} onValueChange={setBalanceValue} />
              </DropdownHeader>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center opacity-70">
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
                  <td>{invoice.contract_name ?? "—"}</td>
                  <td className="text-xs">{formatDate(invoice.due_date)}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td>
                    <Money value={invoice.total_amount} />
                  </td>
                  <td className="font-medium">
                    <Money value={invoice.remaining_balance} />
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
