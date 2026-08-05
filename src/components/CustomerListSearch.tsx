"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Table, TableCell } from "@/components/Table";
import { EmptyState } from "@/components/ui";
import { matchesText } from "@/components/table-filters";
import { statusBadgeClass, statusLabel } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";

/** Live customers columns used by the dashboard / list page. */
export type CustomerListRow = {
  id: string;
  name: string | null;
  status: string | null;
  industry: string | null;
  primary_contact: string | null;
  contact_email: string | null;
};

const CUSTOMER_COLUMNS = [
  { key: "id", header: "Customer ID" },
  { key: "name", header: "Customer name" },
  { key: "status", header: "Status" },
  { key: "industry", header: "Industry" },
  { key: "contact_name", header: "Primary contact" },
  { key: "contact_email", header: "Contact email" },
];

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

/** Short readable form of the UUID for list display; full id remains the record key. */
function displayIdentifier(row: CustomerListRow) {
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
    matchesText(row.industry, q) ||
    matchesText(row.primary_contact, q) ||
    matchesText(row.contact_email, q)
  );
}

function matchesCustomerStatus(row: CustomerListRow, statusFilter: StatusFilterValue) {
  if (statusFilter === "all") return true;
  return displayStatus(row).toLowerCase() === statusFilter;
}

export function CustomerListSearch({ customers }: { customers: CustomerListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const deferredQuery = useDeferredValue(query);

  /** Open detail using the customer's unique database UUID (`customers.id`). */
  function openCustomer(customerId: string) {
    const id = customerId?.trim();
    if (!id) return;
    startTransition(() => {
      router.push(`/customers/${encodeURIComponent(id)}`);
    });
  }

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

  const activeQuery = deferredQuery.trim();
  const searching = activeQuery.length > 0;
  const filteringByStatus = statusFilter !== "all";
  const narrowed = searching || filteringByStatus;

  return (
    <div className="space-y-4">
      {isPending ? (
        <p className="text-sm opacity-70" aria-live="polite">
          Opening customer…
        </p>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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

        <p className="text-sm opacity-70 lg:text-right" aria-live="polite">
          {narrowed
            ? `Showing ${filtered.length} of ${customers.length} customer${customers.length === 1 ? "" : "s"}`
            : `${customers.length} customer${customers.length === 1 ? "" : "s"}`}
        </p>
      </div>

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
              : "There are no customer records in Supabase yet."
          }
        />
      ) : (
        <Table columns={CUSTOMER_COLUMNS}>
          {filtered.map((customer) => (
            <tr
              key={customer.id}
              data-customer-id={customer.id}
              className={`cursor-pointer border-b border-base-200 transition-colors last:border-b-0 hover:bg-base-200/60 ${
                isPending ? "opacity-70" : ""
              }`}
              tabIndex={0}
              aria-label={`Open customer ${displayName(customer)}`}
              aria-busy={isPending || undefined}
              onClick={() => openCustomer(customer.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCustomer(customer.id);
                }
              }}
            >
              <TableCell className="font-mono text-xs tabular-nums" title={customer.id}>
                {displayIdentifier(customer)}
              </TableCell>
              <TableCell className="font-medium">{displayName(customer)}</TableCell>
              <TableCell>
                <CustomerStatusBadge status={displayStatus(customer)} />
              </TableCell>
              <TableCell>{customer.industry?.trim() || "—"}</TableCell>
              <TableCell>{displayContactName(customer)}</TableCell>
              <TableCell className="text-sm">{displayContactEmail(customer)}</TableCell>
            </tr>
          ))}
        </Table>
      )}

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
