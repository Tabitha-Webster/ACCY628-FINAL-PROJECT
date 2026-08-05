"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
  warning: string;
};

type SortKey = "dueDate" | "daysPastDue" | "status" | "bucket" | "warning" | "balance";
type SortDir = "asc" | "desc";

const AGING_ORDER = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", ">90 Days"];

const WARNING_ORDER = ["Current", "Overdue", "Follow Up", "Escalate", "Critical"];

function bucketTone(label: string): "default" | "warning" | "error" {
  if (label === "Current") return "default";
  if (label === "61-90 Days" || label === ">90 Days") return "error";
  return "warning";
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
    case "warning":
      return WARNING_ORDER.indexOf(a.warning) - WARNING_ORDER.indexOf(b.warning);
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
  const [warning, setWarning] = useState("all");
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
  const warnings = useMemo(
    () => WARNING_ORDER.filter((label) => rows.some((row) => row.warning === label)),
    [rows]
  );

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (customer !== "all" && row.customerName !== customer) return false;
      if (dueDate && row.dueDate !== dueDate) return false;
      if (!matchesDaysPastDueFilter(row.daysPastDue, daysPastDueFilter)) return false;
      if (status !== "all" && row.status !== status) return false;
      if (agingBucket !== "all" && row.bucket !== agingBucket) return false;
      if (warning !== "all" && row.warning !== warning) return false;
      return true;
    });

    if (!sortKey) return next;

    return [...next].sort((a, b) => {
      const result = compareRows(a, b, sortKey);
      return sortDir === "asc" ? result : -result;
    });
  }, [rows, customer, dueDate, daysPastDueFilter, status, agingBucket, warning, sortKey, sortDir]);

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
          <span className="label-text mb-1">Aging Bucket</span>
          <select
            className="select select-bordered select-sm w-full"
            value={agingBucket}
            onChange={(e) => setAgingBucket(e.target.value)}
          >
            <option value="all">All buckets</option>
            {buckets.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Warning</span>
          <select
            className="select select-bordered select-sm w-full"
            value={warning}
            onChange={(e) => setWarning(e.target.value)}
          >
            <option value="all">All warnings</option>
            {warnings.map((value) => (
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
                <SortHeader
                  label="Aging Bucket"
                  column="bucket"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortHeader label="Warning" column="warning" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
                  <td className={`text-xs ${row.daysPastDue > 0 ? "font-medium text-error" : ""}`}>
                    {formatDate(row.dueDate)}
                  </td>
                  <td className={row.daysPastDue > 0 ? "font-medium text-error" : ""}>
                    {row.daysPastDue > 0 ? row.daysPastDue : "—"}
                  </td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        bucketTone(row.bucket) === "error"
                          ? "badge-error"
                          : bucketTone(row.bucket) === "warning"
                            ? "badge-warning"
                            : "badge-ghost"
                      }`}
                    >
                      {row.bucket}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        row.daysPastDue > 60
                          ? "badge-error"
                          : row.daysPastDue > 0
                            ? "badge-warning"
                            : "badge-success"
                      }`}
                    >
                      {row.warning}
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
    </div>
  );
}
