"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, X } from "lucide-react";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { AR_AGING_BUCKETS } from "@/lib/calculations";
import { formatDate } from "@/lib/format";
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

export type ArAgingRow = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  status: string;
  remainingBalance: number;
  bucket: string;
  daysPastDue: number;
};

const STATUS_OPTIONS = ["issued", "sent", "partially_paid", "overdue", "disputed"];

type FilterKey = "invoice" | "customer" | "dueDate" | "daysPastDue" | "status" | "aging" | "balance";

function bucketBadgeClass(bucket: string) {
  if (bucket === "Current") return "aging-current border-0";
  if (bucket === "1-30 Days") return "aging-30 border-0";
  if (bucket === "31-60 Days") return "aging-60 border-0";
  if (bucket === "61-90 Days") return "aging-90 border-0";
  return "aging-over-90 border-0";
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadArCsv(rows: ArAgingRow[]) {
  const headers = ["Invoice", "Customer", "Due Date", "Days Past Due", "Status", "Aging", "Balance"];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [row.invoiceNumber, row.customerName, row.dueDate, row.daysPastDue, row.status, row.bucket, row.remainingBalance.toFixed(2)]
        .map(csvEscape)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `accounts-receivable-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountsReceivableClient({ rows }: { rows: ArAgingRow[] }) {
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<FilterKey>();
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [dueYears, setDueYears] = useState<MultiFilter>(null);
  const [dueMonths, setDueMonths] = useState<MultiFilter>(null);
  const [daysOp, setDaysOp] = useState<CompareOp>("gt");
  const [daysValue, setDaysValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<MultiFilter>(null);
  const [agingFilter, setAgingFilter] = useState<MultiFilter>(null);
  const [balanceOp, setBalanceOp] = useState<CompareOp>("gt");
  const [balanceValue, setBalanceValue] = useState("");

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesText(row.invoiceNumber, invoiceQuery) &&
          matchesText(row.customerName, customerQuery) &&
          matchesDatePeriod(row.dueDate, dueYears, dueMonths) &&
          matchesCompare(row.daysPastDue, daysOp, daysValue) &&
          matchesAnySelected(row.status, statusFilter) &&
          matchesAnySelected(row.bucket, agingFilter) &&
          matchesCompare(row.remainingBalance, balanceOp, balanceValue)
      ),
    [rows, invoiceQuery, customerQuery, dueYears, dueMonths, daysOp, daysValue, statusFilter, agingFilter, balanceOp, balanceValue]
  );

  const activeCount = [
    invoiceQuery.trim(),
    customerQuery.trim(),
    dueYears == null && dueMonths == null ? "" : "dueDate",
    daysValue.trim(),
    statusFilter == null ? "" : "status",
    agingFilter == null ? "" : "aging",
    balanceValue.trim(),
  ].filter(Boolean).length;

  function clearFilters() {
    setInvoiceQuery("");
    setCustomerQuery("");
    setDueYears(null);
    setDueMonths(null);
    setDaysOp("gt");
    setDaysValue("");
    setStatusFilter(null);
    setAgingFilter(null);
    setBalanceOp("gt");
    setBalanceValue("");
    setOpenFilter(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Open Invoices</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-60">
            Showing {filtered.length} of {rows.length}
          </span>
          {activeCount > 0 ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No open receivables" description="Every issued invoice has been paid in full." />
      ) : (
        <StickyFilterTable tableRef={tableRef}>
          <thead>
            <tr>
              <DropdownHeader label="Invoice" active={Boolean(invoiceQuery.trim())} open={openFilter === "invoice"} onToggle={() => toggleFilter("invoice")}>
                <TextFilter value={invoiceQuery} onChange={setInvoiceQuery} placeholder="Search invoice #" />
              </DropdownHeader>
              <DropdownHeader label="Customer" active={Boolean(customerQuery.trim())} open={openFilter === "customer"} onToggle={() => toggleFilter("customer")}>
                <TextFilter value={customerQuery} onChange={setCustomerQuery} placeholder="Search customer" />
              </DropdownHeader>
              <DropdownHeader
                label="Due Date"
                active={dueYears != null || dueMonths != null}
                open={openFilter === "dueDate"}
                onToggle={() => toggleFilter("dueDate")}
              >
                <DatePeriodFilter
                  dates={rows.map((row) => row.dueDate)}
                  years={dueYears}
                  months={dueMonths}
                  onYearsChange={setDueYears}
                  onMonthsChange={setDueMonths}
                />
              </DropdownHeader>
              <DropdownHeader
                label="Days Past Due"
                active={Boolean(daysValue.trim())}
                open={openFilter === "daysPastDue"}
                onToggle={() => toggleFilter("daysPastDue")}
              >
                <CompareFilter op={daysOp} value={daysValue} onOpChange={setDaysOp} onValueChange={setDaysValue} />
              </DropdownHeader>
              <DropdownHeader label="Status" active={statusFilter != null} open={openFilter === "status"} onToggle={() => toggleFilter("status")}>
                <MultiSelectFilter
                  options={STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  formatLabel={(status) => status.replace(/_/g, " ")}
                />
              </DropdownHeader>
              <DropdownHeader label="Aging" active={agingFilter != null} open={openFilter === "aging"} onToggle={() => toggleFilter("aging")}>
                <MultiSelectFilter options={AR_AGING_BUCKETS} selected={agingFilter} onChange={setAgingFilter} />
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
                  No open invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/invoices/${row.id}`} className="link link-hover font-medium">
                      {row.invoiceNumber}
                    </Link>
                  </td>
                  <td>{row.customerName}</td>
                  <td className={`text-xs ${row.daysPastDue > 0 ? "font-medium text-error" : ""}`}>{formatDate(row.dueDate)}</td>
                  <td className={row.daysPastDue > 0 ? "font-medium text-error" : ""}>{row.daysPastDue > 0 ? row.daysPastDue : "—"}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <span className={`badge whitespace-nowrap ${bucketBadgeClass(row.bucket)}`}>{row.bucket}</span>
                  </td>
                  <td className="font-medium">
                    <Money value={row.remainingBalance} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </StickyFilterTable>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn btn-outline btn-sm" disabled={filtered.length === 0} onClick={() => downloadArCsv(filtered)}>
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>
  );
}
