"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CirclePause,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/Button";
import { ExportCustomersButton } from "@/components/ExportCustomersButton";
import { EmptyState } from "@/components/ui";
import { matchesText } from "@/components/table-filters";
import { statusBadgeClass, statusLabel } from "@/lib/format";
import type { CustomerListRow } from "@/lib/customers/queries";
import type { UserRole } from "@/lib/constants";
import type { CustomerStatus } from "@/lib/types";

export type { CustomerListRow };

/** Detail route uses the customers.id primary key only. */
function customerDetailPath(customerId: string) {
  return `/customers/${customerId}`;
}

/** Statuses supported by the customers table / app types. */
const DB_CUSTOMER_STATUSES: CustomerStatus[] = [
  "active",
  "inactive",
  "prospect",
  "on_hold",
  "pending_approval",
  "rejected",
];

/** Fallback when no supported statuses are available. */
const FALLBACK_CUSTOMER_STATUSES: CustomerStatus[] = ["active", "inactive", "prospect"];

type StatusFilterValue = "all" | CustomerStatus;

const TONE = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80",
    icon: "bg-sky-500/15 text-sky-700",
    value: "text-sky-900",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80",
    icon: "bg-amber-500/15 text-amber-800",
    value: "text-amber-950",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80",
    icon: "bg-violet-500/15 text-violet-700",
    value: "text-violet-900",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90",
    icon: "bg-rose-500/15 text-rose-700",
    value: "text-rose-900",
  },
} as const;

const STATUS_COLORS: Record<string, string> = {
  Active: "#10b981",
  Inactive: "#f43f5e",
  "On hold": "#f59e0b",
  Prospective: "#8b5cf6",
  Pending: "#0ea5e9",
  Other: "#94a3b8",
};

function displayName(row: CustomerListRow) {
  return row.name?.trim() || "—";
}

function displayStatus(row: CustomerListRow) {
  return row.status || "unknown";
}

function displayContactName(row: CustomerListRow) {
  return row.primary_contact?.trim() || "—";
}

function displayContactEmail(row: CustomerListRow) {
  return row.contact_email?.trim() || "—";
}

/** Prefer human customer_identifier when present so every role sees the same ID label. */
function displayIdentifier(row: CustomerListRow) {
  const identifier = row.customer_identifier?.trim();
  if (identifier) return identifier;
  const id = row.id?.trim();
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function filterStatusLabel(status: CustomerStatus) {
  if (status === "prospect") return "Prospective";
  return statusLabel(status);
}

/** Customer-list badge colors: active green, inactive red, on hold yellow. */
function customerStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "badge-success";
  if (s === "inactive") return "badge-error";
  if (s === "on_hold") return "badge-warning";
  return statusBadgeClass(s);
}

function CustomerStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${customerStatusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

function matchesCustomerSearch(row: CustomerListRow, query: string) {
  const q = query.trim();
  if (!q) return true;
  return (
    matchesText(row.name, q) ||
    matchesText(row.id, q) ||
    matchesText(row.customer_identifier, q) ||
    matchesText(row.industry, q) ||
    matchesText(row.primary_contact, q) ||
    matchesText(row.contact_email, q)
  );
}

function matchesCustomerStatus(row: CustomerListRow, statusFilter: StatusFilterValue) {
  if (statusFilter === "all") return true;
  return displayStatus(row).toLowerCase() === statusFilter;
}

export function CustomerListSearch({
  customers,
  role,
}: {
  customers: CustomerListRow[];
  role: UserRole;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const deferredQuery = useDeferredValue(query);

  const statusOptions =
    DB_CUSTOMER_STATUSES.length > 0 ? DB_CUSTOMER_STATUSES : FALLBACK_CUSTOMER_STATUSES;

  const filtered = useMemo(
    () =>
      customers.filter(
        (row) =>
          matchesCustomerStatus(row, statusFilter) && matchesCustomerSearch(row, deferredQuery)
      ),
    [customers, deferredQuery, statusFilter]
  );

  const counts = useMemo(() => {
    let active = 0;
    let onHold = 0;
    let pending = 0;
    let inactive = 0;
    let prospect = 0;
    for (const row of customers) {
      const s = displayStatus(row).toLowerCase();
      if (s === "active") active += 1;
      else if (s === "on_hold") onHold += 1;
      else if (s === "pending_approval") pending += 1;
      else if (s === "inactive" || s === "rejected") inactive += 1;
      else if (s === "prospect") prospect += 1;
    }
    return { active, onHold, pending, inactive, prospect, total: customers.length };
  }, [customers]);

  const statusMix = useMemo(() => {
    const rows = [
      { name: "Active", count: counts.active },
      { name: "On hold", count: counts.onHold },
      { name: "Prospective", count: counts.prospect },
      { name: "Pending", count: counts.pending },
      { name: "Inactive", count: counts.inactive },
    ].filter((r) => r.count > 0);
    if (rows.length === 0) rows.push({ name: "Other", count: 0 });
    return rows;
  }, [counts]);

  const mixMax = Math.max(1, ...statusMix.map((d) => d.count));

  const activeQuery = deferredQuery.trim();
  const searching = activeQuery.length > 0;
  const filteringByStatus = statusFilter !== "all";
  const narrowed = searching || filteringByStatus;

  const metricTiles = [
    {
      label: "Customers",
      value: String(counts.total),
      tone: "sky" as const,
      icon: <Users className="h-4 w-4" />,
    },
    {
      label: "Active",
      value: String(counts.active),
      tone: "emerald" as const,
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      label: "On hold",
      value: String(counts.onHold),
      tone: counts.onHold > 0 ? ("amber" as const) : ("emerald" as const),
      icon: <CirclePause className="h-4 w-4" />,
    },
    {
      label: role === "technician" ? "Industries" : "Pending",
      value:
        role === "technician"
          ? String(
              new Set(
                customers.map((c) => c.industry?.trim()).filter((v): v is string => Boolean(v))
              ).size
            )
          : String(counts.pending),
      tone: "violet" as const,
      icon: <Building2 className="h-4 w-4" />,
      hint: role === "technician" ? "Among assigned accounts" : "Awaiting approval",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          {metricTiles.map((m) => {
            const tone = TONE[m.tone];
            return (
              <div key={m.label} className={`rounded-2xl border p-3 shadow-sm ${tone.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {m.label}
                  </p>
                  <span className={`rounded-lg p-1.5 ${tone.icon}`}>{m.icon}</span>
                </div>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>{m.value}</p>
                {"hint" in m && m.hint ? (
                  <p className="mt-0.5 text-[10px] opacity-60">{m.hint}</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex min-h-[11rem] flex-col rounded-2xl border border-base-300 bg-base-100 p-3 shadow-sm lg:col-span-5">
          <p className="mb-0.5 text-xs font-semibold">Status mix</p>
          <p className="mb-2 text-[10px] opacity-60">How your customer list is distributed</p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusMix} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <XAxis type="number" hide domain={[0, Math.ceil(mixMax * 1.15) || 1]} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  formatter={(value) => [value ?? 0, "Customers"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={16}>
                  {statusMix.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? STATUS_COLORS.Other} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/70 to-base-100 p-3 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
          <label className="form-control w-full max-w-xl">
            <span className="sr-only">Search customers</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, ID, industry, or contact…"
                className="input input-bordered w-full pl-10 pr-10"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </label>

          <label className="form-control w-full max-w-xs">
            <span className="label-text mb-1 text-xs opacity-70">Status</span>
            <select
              className="select select-bordered w-full"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
              aria-label="Filter by customer status"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {filterStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 lg:w-auto lg:items-end">
          <p className="text-sm opacity-70 lg:text-right" aria-live="polite">
            {narrowed
              ? `Showing ${filtered.length} of ${customers.length} customer${customers.length === 1 ? "" : "s"}`
              : `${customers.length} customer${customers.length === 1 ? "" : "s"}`}
          </p>
          <ExportCustomersButton rows={filtered} role={role} />
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/70 to-base-100 shadow-sm">
        <div className="border-b border-violet-200/70 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
            {role === "technician" ? "Assigned customers" : "Customer directory"} ({filtered.length})
          </h2>
        </div>
        <div className="p-3">
          {filtered.length === 0 ? (
            <EmptyState
              title={
                narrowed
                  ? searching
                    ? "No customers match your search"
                    : "No customers with this status"
                  : "No customers found"
              }
              description={
                narrowed
                  ? searching
                    ? `Nothing matched “${activeQuery}”. Try another name, customer ID, industry, or contact detail.`
                    : `No customers are currently marked as ${filterStatusLabel(statusFilter as CustomerStatus)}. Choose All statuses to see everyone.`
                  : role === "technician"
                    ? "Active customers appear here when you are assigned to their support tickets."
                    : "There are no customer records in Supabase yet."
              }
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((customer) => {
                const databaseId = customer.id?.trim();
                if (!databaseId) return null;
                const href = customerDetailPath(databaseId);
                const status = displayStatus(customer);
                return (
                  <li key={databaseId}>
                    <Link
                      href={href}
                      data-customer-id={databaseId}
                      className="block h-full rounded-xl border border-violet-100 bg-white/85 px-3 py-3 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/50"
                      aria-label={`Open customer ${displayName(customer)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{displayName(customer)}</p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums opacity-60">
                            {displayIdentifier(customer)}
                          </p>
                        </div>
                        <CustomerStatusBadge status={status} />
                      </div>
                      <dl className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between gap-2">
                          <dt className="opacity-60">Industry</dt>
                          <dd className="truncate font-medium">{customer.industry?.trim() || "—"}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="opacity-60">Contact</dt>
                          <dd className="truncate font-medium">{displayContactName(customer)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="opacity-60">Email</dt>
                          <dd className="truncate font-medium">{displayContactEmail(customer)}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {narrowed && filtered.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {searching ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : null}
          {filteringByStatus ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              Show all statuses
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
