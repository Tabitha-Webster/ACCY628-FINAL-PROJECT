"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

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

type SortKey = "dueDate" | "daysPastDue" | "status" | "bucket" | "balance";
type SortDir = "asc" | "desc";

const AGING_ORDER = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", ">90 Days"];

function agingBadgeClass(daysPastDue: number): string {
  if (daysPastDue > 60) return "badge-error";
  if (daysPastDue > 0) return "badge-warning";
  return "badge-aging-current";
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
      [
        row.invoiceNumber,
        row.customerName,
        row.dueDate,
        row.daysPastDue,
        row.status,
        row.bucket,
        row.remainingBalance.toFixed(2),
      ]
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

function matchesDaysPastDueFilter(days: number, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "current") return days === 0;
  if (filter === "1-30") return days >= 1 && days <= 30;
  if (filter === "31-60") return days >= 31 && days <= 60;
  if (filter === "61-90") return days >= 61 && days <= 90;
  if (filter === "over-90") return days > 90;
  return true;
}

function compareRows(a: ArAgingRow, b: ArAgingRow, key: SortKey): number {
  switch (key) {
    case "dueDate":
      return a.dueDate.localeCompare(b.dueDate);
    case "daysPastDue":
      return a.daysPastDue - b.daysPastDue;
    case "status":
      return a.status.localeCompare(b.status);
    case "bucket":
      return AGING_ORDER.indexOf(a.bucket) - AGING_ORDER.indexOf(b.bucket);
    case "balance":
      return a.remainingBalance - b.remainingBalance;
    default:
      return 0;
  }
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function AccountsReceivableClient({ rows }: { rows: ArAgingRow[] }) {
  const [customer, setCustomer] = useState("all");
  const [dueDate, setDueDate] = useState("");
  const [daysPastDueFilter, setDaysPastDueFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [agingBucket, setAgingBucket] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const customers = useMemo(
    () => Array.from(new Set(rows.map((row) => row.customerName))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const statuses = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const buckets = useMemo(
    () => AGING_ORDER.filter((label) => rows.some((row) => row.bucket === label)),
    [rows]
  );

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (customer !== "all" && row.customerName !== customer) return false;
      if (dueDate && row.dueDate !== dueDate) return false;
      if (!matchesDaysPastDueFilter(row.daysPastDue, daysPastDueFilter)) return false;
      if (status !== "all" && row.status !== status) return false;
      if (agingBucket !== "all" && row.bucket !== agingBucket) return false;
      return true;
    });

    if (!sortKey) return next;

    return [...next].sort((a, b) => {
      const result = compareRows(a, b, sortKey);
      return sortDir === "asc" ? result : -result;
    });
  }, [rows, customer, dueDate, daysPastDueFilter, status, agingBucket, sortKey, sortDir]);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-box border border-base-300 bg-base-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="form-control">
          <span className="label-text mb-1">Customer</span>
          <select
            className="select select-bordered select-sm w-full"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="all">All customers</option>
            {customers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Due Date</span>
          <input
            type="date"
            className="input input-bordered input-sm w-full"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Days Past Due</span>
          <select
            className="select select-bordered select-sm w-full"
            value={daysPastDueFilter}
            onChange={(e) => setDaysPastDueFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="current">Current (0)</option>
            <option value="1-30">1–30</option>
            <option value="31-60">31–60</option>
            <option value="61-90">61–90</option>
            <option value="over-90">Over 90</option>
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Status</span>
          <select
            className="select select-bordered select-sm w-full"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Aging</span>
          <select
            className="select select-bordered select-sm w-full"
            value={agingBucket}
            onChange={(e) => setAgingBucket(e.target.value)}
          >
            <option value="all">All aging</option>
            {buckets.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices match these filters"
          description="Try clearing one or more filters to widen the results."
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <SortHeader label="Due Date" column="dueDate" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader
                  label="Days Past Due"
                  column="daysPastDue"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Aging" column="bucket" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Balance" column="balance" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/invoices/${row.id}`} className="link link-hover font-medium">
                      {row.invoiceNumber}
                    </Link>
                  </td>
                  <td>{row.customerName}</td>
                  <td className={`text-xs ${row.daysPastDue > 0 ? "font-medium" : ""}`}>
                    {formatDate(row.dueDate)}
                  </td>
                  <td className={row.daysPastDue > 0 ? "font-medium" : ""}>
                    {row.daysPastDue > 0 ? row.daysPastDue : "—"}
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`badge whitespace-nowrap ${agingBadgeClass(row.daysPastDue)}`}>
                      {row.bucket}
                    </span>
                  </td>
                  <td className="font-medium">
                    <Money value={row.remainingBalance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={filtered.length === 0}
          onClick={() => downloadArCsv(filtered)}
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>
  );
}
