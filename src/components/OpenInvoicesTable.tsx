"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { AR_AGING_BUCKETS } from "@/lib/calculations";
import { formatDate } from "@/lib/format";
import {
  type CompareOp,
  CompareFilter,
  DateFilter,
  DropdownHeader,
  FilterOption,
  StickyFilterTable,
  TextFilter,
  matchesCompare,
  matchesDateSearch,
  matchesText,
  useHeaderFilter,
} from "@/components/table-filters";

export type OpenInvoiceRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  due_date: string;
  status: string;
  aging_bucket: string;
  balance: number;
};

const STATUS_OPTIONS = ["issued", "sent", "partially_paid", "overdue", "disputed"];

type FilterKey = "invoice" | "customer" | "dueDate" | "status" | "aging" | "balance";

function bucketBadgeClass(bucket: string) {
  if (bucket === "Current") return "aging-current border-0";
  if (bucket === "1-30 Days") return "aging-30 border-0";
  if (bucket === "31-60 Days") return "aging-60 border-0";
  if (bucket === "61-90 Days") return "aging-90 border-0";
  return "aging-over-90 border-0";
}

export function OpenInvoicesTable({ invoices }: { invoices: OpenInvoiceRow[] }) {
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<FilterKey>();
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [dueDateQuery, setDueDateQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState("all");
  const [balanceOp, setBalanceOp] = useState<CompareOp>("gt");
  const [balanceValue, setBalanceValue] = useState("");

  const filtered = useMemo(
    () =>
      invoices.filter(
        (row) =>
          matchesText(row.invoice_number, invoiceQuery) &&
          matchesText(row.customer_name, customerQuery) &&
          matchesDateSearch(row.due_date, dueDateQuery) &&
          (statusFilter === "all" || row.status === statusFilter) &&
          (agingFilter === "all" || row.aging_bucket === agingFilter) &&
          matchesCompare(row.balance, balanceOp, balanceValue)
      ),
    [invoices, invoiceQuery, customerQuery, dueDateQuery, statusFilter, agingFilter, balanceOp, balanceValue]
  );

  const activeCount = [
    invoiceQuery.trim(),
    customerQuery.trim(),
    dueDateQuery.trim(),
    statusFilter !== "all" ? statusFilter : "",
    agingFilter !== "all" ? agingFilter : "",
    balanceValue.trim(),
  ].filter(Boolean).length;

  function clearFilters() {
    setInvoiceQuery("");
    setCustomerQuery("");
    setDueDateQuery("");
    setStatusFilter("all");
    setAgingFilter("all");
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
            Showing {filtered.length} of {invoices.length}
          </span>
          {activeCount > 0 ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {invoices.length === 0 ? (
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
              <DropdownHeader label="Due Date" active={Boolean(dueDateQuery.trim())} open={openFilter === "dueDate"} onToggle={() => toggleFilter("dueDate")}>
                <DateFilter value={dueDateQuery} onChange={setDueDateQuery} />
              </DropdownHeader>
              <DropdownHeader label="Status" active={statusFilter !== "all"} open={openFilter === "status"} onToggle={() => toggleFilter("status")}>
                <FilterOption selected={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                  (All)
                </FilterOption>
                {STATUS_OPTIONS.map((status) => (
                  <FilterOption
                    key={status}
                    selected={statusFilter === status}
                    onClick={() => {
                      setStatusFilter(status);
                      setOpenFilter(null);
                    }}
                  >
                    {status.replace(/_/g, " ")}
                  </FilterOption>
                ))}
              </DropdownHeader>
              <DropdownHeader
                label="Aging Bucket"
                active={agingFilter !== "all"}
                open={openFilter === "aging"}
                align="right"
                onToggle={() => toggleFilter("aging")}
              >
                <FilterOption selected={agingFilter === "all"} onClick={() => setAgingFilter("all")}>
                  (All)
                </FilterOption>
                {AR_AGING_BUCKETS.map((bucket) => (
                  <FilterOption
                    key={bucket}
                    selected={agingFilter === bucket}
                    onClick={() => {
                      setAgingFilter(bucket);
                      setOpenFilter(null);
                    }}
                  >
                    {bucket}
                  </FilterOption>
                ))}
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
                <td colSpan={6} className="py-8 text-center opacity-70">
                  No open invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/invoices/${row.id}`} className="link link-hover font-medium">
                      {row.invoice_number}
                    </Link>
                  </td>
                  <td>{row.customer_name}</td>
                  <td className="text-xs">{formatDate(row.due_date)}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <span className={`badge ${bucketBadgeClass(row.aging_bucket)}`}>{row.aging_bucket}</span>
                  </td>
                  <td className="font-medium">
                    <Money value={row.balance} />
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
