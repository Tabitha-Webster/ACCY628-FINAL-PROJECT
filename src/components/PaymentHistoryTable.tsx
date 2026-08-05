"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { EmptyState, Money } from "@/components/ui";
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

export type PaymentHistoryRow = {
  id: string;
  payment_number: string;
  customer_name: string;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  payment_amount: number;
};

const METHOD_OPTIONS = ["ach", "check", "credit_card", "wire", "other"];

type FilterKey = "payment" | "customer" | "date" | "method" | "reference" | "amount";

export function PaymentHistoryTable({ payments }: { payments: PaymentHistoryRow[] }) {
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<FilterKey>();
  const [paymentQuery, setPaymentQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [referenceQuery, setReferenceQuery] = useState("");
  const [amountOp, setAmountOp] = useState<CompareOp>("gt");
  const [amountValue, setAmountValue] = useState("");

  const filtered = useMemo(
    () =>
      payments.filter(
        (row) =>
          matchesText(row.payment_number, paymentQuery) &&
          matchesText(row.customer_name, customerQuery) &&
          matchesDateSearch(row.payment_date, dateQuery) &&
          (methodFilter === "all" || row.payment_method === methodFilter) &&
          matchesText(row.reference_number, referenceQuery) &&
          matchesCompare(row.payment_amount, amountOp, amountValue)
      ),
    [payments, paymentQuery, customerQuery, dateQuery, methodFilter, referenceQuery, amountOp, amountValue]
  );

  const activeCount = [
    paymentQuery.trim(),
    customerQuery.trim(),
    dateQuery.trim(),
    methodFilter !== "all" ? methodFilter : "",
    referenceQuery.trim(),
    amountValue.trim(),
  ].filter(Boolean).length;

  function clearFilters() {
    setPaymentQuery("");
    setCustomerQuery("");
    setDateQuery("");
    setMethodFilter("all");
    setReferenceQuery("");
    setAmountOp("gt");
    setAmountValue("");
    setOpenFilter(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Payment History</h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="opacity-60">
            Showing {filtered.length} of {payments.length}
          </span>
          {activeCount > 0 ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="No payments recorded yet" />
      ) : (
        <StickyFilterTable tableRef={tableRef}>
          <thead>
            <tr>
              <DropdownHeader label="Payment" active={Boolean(paymentQuery.trim())} open={openFilter === "payment"} onToggle={() => toggleFilter("payment")}>
                <TextFilter value={paymentQuery} onChange={setPaymentQuery} placeholder="Search payment #" />
              </DropdownHeader>
              <DropdownHeader label="Customer" active={Boolean(customerQuery.trim())} open={openFilter === "customer"} onToggle={() => toggleFilter("customer")}>
                <TextFilter value={customerQuery} onChange={setCustomerQuery} placeholder="Search customer" />
              </DropdownHeader>
              <DropdownHeader label="Date" active={Boolean(dateQuery.trim())} open={openFilter === "date"} onToggle={() => toggleFilter("date")}>
                <DateFilter value={dateQuery} onChange={setDateQuery} />
              </DropdownHeader>
              <DropdownHeader label="Method" active={methodFilter !== "all"} open={openFilter === "method"} onToggle={() => toggleFilter("method")}>
                <FilterOption selected={methodFilter === "all"} onClick={() => setMethodFilter("all")}>
                  (All)
                </FilterOption>
                {METHOD_OPTIONS.map((method) => (
                  <FilterOption
                    key={method}
                    selected={methodFilter === method}
                    onClick={() => {
                      setMethodFilter(method);
                      setOpenFilter(null);
                    }}
                  >
                    {method.replace(/_/g, " ")}
                  </FilterOption>
                ))}
              </DropdownHeader>
              <DropdownHeader
                label="Reference"
                active={Boolean(referenceQuery.trim())}
                open={openFilter === "reference"}
                onToggle={() => toggleFilter("reference")}
              >
                <TextFilter value={referenceQuery} onChange={setReferenceQuery} placeholder="Search reference" />
              </DropdownHeader>
              <DropdownHeader
                label="Amount"
                active={Boolean(amountValue.trim())}
                open={openFilter === "amount"}
                align="right"
                onToggle={() => toggleFilter("amount")}
              >
                <CompareFilter op={amountOp} value={amountValue} onOpChange={setAmountOp} onValueChange={setAmountValue} />
              </DropdownHeader>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center opacity-70">
                  No payments match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.payment_number}</td>
                  <td>{row.customer_name}</td>
                  <td className="text-xs">{formatDate(row.payment_date)}</td>
                  <td className="text-xs capitalize">{row.payment_method.replace(/_/g, " ")}</td>
                  <td className="text-xs">{row.reference_number ?? "—"}</td>
                  <td className="font-medium">
                    <Money value={row.payment_amount} />
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
