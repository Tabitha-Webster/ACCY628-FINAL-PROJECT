"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { EmptyState, Money, StatusBadge } from "@/components/ui";
import { ExportContractsButton } from "@/components/ExportContractsButton";
import { formatDate, statusLabel } from "@/lib/format";
import type { UserRole } from "@/lib/constants";
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPES,
  contractHighlightClass,
  getContractHighlight,
  getContractRenewalDate,
  getContractWarnings,
  unwrapAssignedManager,
  unwrapCustomer,
  type ContractListRow,
} from "@/lib/contracts";

export type ContractsListItem = ContractListRow;

type SortKey =
  | "contract_number"
  | "customer"
  | "name"
  | "status"
  | "contract_type"
  | "start_date"
  | "end_date"
  | "mrr"
  | "renewal_date"
  | "manager";

type SortDir = "asc" | "desc";

type DatePreset = "" | "next_30" | "next_60" | "next_90" | "past" | "custom";

function inDateRange(
  value: string | null,
  preset: DatePreset,
  from: string,
  to: string,
  now: Date
): boolean {
  if (!preset) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "past") return date < startOfToday;
  if (preset === "next_30" || preset === "next_60" || preset === "next_90") {
    const days = preset === "next_30" ? 30 : preset === "next_60" ? 60 : 90;
    const end = new Date(startOfToday);
    end.setDate(end.getDate() + days);
    return date >= startOfToday && date <= end;
  }
  if (preset === "custom") {
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime()) && date < fromDate) return false;
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime()) && date > toDate) return false;
    }
    return true;
  }
  return true;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareDate(a: string | null, b: string | null) {
  const aMs = a ? new Date(a).getTime() : Number.POSITIVE_INFINITY;
  const bMs = b ? new Date(b).getTime() : Number.POSITIVE_INFINITY;
  const aSafe = Number.isNaN(aMs) ? Number.POSITIVE_INFINITY : aMs;
  const bSafe = Number.isNaN(bMs) ? Number.POSITIVE_INFINITY : bMs;
  return aSafe - bSafe;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

export function ContractsListClient({
  contracts,
  initialStatus = "",
  canEdit = false,
  role,
}: {
  contracts: ContractsListItem[];
  initialStatus?: string;
  canEdit?: boolean;
  role?: UserRole;
}) {
  const now = useMemo(() => new Date(), []);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [contractType, setContractType] = useState("");
  const [managerId, setManagerId] = useState("");
  const [expirationPreset, setExpirationPreset] = useState<DatePreset>("");
  const [expirationFrom, setExpirationFrom] = useState("");
  const [expirationTo, setExpirationTo] = useState("");
  const [renewalPreset, setRenewalPreset] = useState<DatePreset>("");
  const [renewalFrom, setRenewalFrom] = useState("");
  const [renewalTo, setRenewalTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("end_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const customers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of contracts) {
      const customer = unwrapCustomer(row);
      if (customer) map.set(customer.id, customer.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareText(a.name, b.name));
  }, [contracts]);

  const managers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of contracts) {
      const manager = unwrapAssignedManager(row);
      if (manager && "id" in manager && manager.id) {
        map.set(manager.id, manager.full_name);
      } else if (row.assigned_manager_id && manager?.full_name) {
        map.set(row.assigned_manager_id, manager.full_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareText(a.name, b.name));
  }, [contracts]);

  const enriched = useMemo(() => {
    return contracts.map((row) => {
      const customer = unwrapCustomer(row);
      const manager = unwrapAssignedManager(row);
      const renewalDate = getContractRenewalDate(row);
      const warnings = getContractWarnings(row, now).filter((w) =>
        [
          "ends_soon",
          "past_end_date",
          "renewal_soon",
          "renewal_90",
          "renewal_60",
          "renewal_30",
          "expiration_warning",
        ].includes(w.code)
      );
      // Prefer specific reminder badges over the generic renewal_soon duplicate
      const displayWarnings = warnings.filter((w) => {
        if (w.code === "renewal_soon") {
          return !warnings.some((x) =>
            ["renewal_90", "renewal_60", "renewal_30"].includes(x.code)
          );
        }
        if (w.code === "ends_soon") {
          return !warnings.some((x) => x.code === "expiration_warning");
        }
        return true;
      });
      const highlight = getContractHighlight(row, now);
      return {
        row,
        customer,
        manager,
        renewalDate,
        warnings: displayWarnings,
        highlight,
        mrr: Number(row.monthly_recurring_fee ?? 0),
      };
    });
  }, [contracts, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let rows = enriched.filter(({ row, customer, manager, renewalDate }) => {
      if (customerId && row.customer_id !== customerId) return false;
      if (status && row.status !== status) return false;
      if (contractType && row.contract_type !== contractType) return false;
      if (managerId && row.assigned_manager_id !== managerId) return false;
      if (!inDateRange(row.end_date, expirationPreset, expirationFrom, expirationTo, now)) {
        return false;
      }
      if (!inDateRange(renewalDate, renewalPreset, renewalFrom, renewalTo, now)) {
        return false;
      }
      if (q) {
        const haystack = [
          row.contract_number,
          row.name,
          customer?.name ?? "",
          manager?.full_name ?? "",
          row.status,
          row.contract_type,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "contract_number":
          result = compareText(a.row.contract_number, b.row.contract_number);
          break;
        case "customer":
          result = compareText(a.customer?.name ?? "", b.customer?.name ?? "");
          break;
        case "name":
          result = compareText(a.row.name, b.row.name);
          break;
        case "status":
          result = compareText(a.row.status, b.row.status);
          break;
        case "contract_type":
          result = compareText(String(a.row.contract_type), String(b.row.contract_type));
          break;
        case "start_date":
          result = compareDate(a.row.start_date, b.row.start_date);
          break;
        case "end_date":
          result = compareDate(a.row.end_date, b.row.end_date);
          break;
        case "mrr":
          result = a.mrr - b.mrr;
          break;
        case "renewal_date":
          result = compareDate(a.renewalDate, b.renewalDate);
          break;
        case "manager":
          result = compareText(a.manager?.full_name ?? "", b.manager?.full_name ?? "");
          break;
      }
      return sortDir === "asc" ? result : -result;
    });

    return rows;
  }, [
    enriched,
    search,
    customerId,
    status,
    contractType,
    managerId,
    expirationPreset,
    expirationFrom,
    expirationTo,
    renewalPreset,
    renewalFrom,
    renewalTo,
    sortKey,
    sortDir,
    now,
  ]);

  const highlightCounts = useMemo(() => {
    const counts = {
      ends_soon: 0,
      renewal_soon: 0,
      past_end_date: 0,
      renewal_90: 0,
      renewal_60: 0,
      renewal_30: 0,
    };
    for (const item of enriched) {
      if (item.highlight === "ends_soon" || item.highlight === "renewal_30") counts.ends_soon += 1;
      if (
        item.highlight === "renewal_soon" ||
        item.highlight === "renewal_60" ||
        item.highlight === "renewal_90"
      ) {
        counts.renewal_soon += 1;
      }
      if (item.highlight === "past_end_date") counts.past_end_date += 1;
      if (item.highlight === "renewal_90") counts.renewal_90 += 1;
      if (item.highlight === "renewal_60") counts.renewal_60 += 1;
      if (item.highlight === "renewal_30") counts.renewal_30 += 1;
    }
    return counts;
  }, [enriched]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "mrr" || key === "end_date" || key === "renewal_date" ? "asc" : "asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setCustomerId("");
    setStatus("");
    setContractType("");
    setManagerId("");
    setExpirationPreset("");
    setExpirationFrom("");
    setExpirationTo("");
    setRenewalPreset("");
    setRenewalFrom("");
    setRenewalTo("");
  }

  const hasFilters =
    search ||
    customerId ||
    status ||
    contractType ||
    managerId ||
    expirationPreset ||
    renewalPreset;

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold"
        onClick={() => toggleSort(column)}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    );
  }

  if (contracts.length === 0) {
    return <EmptyState title="No contracts on file" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/70 to-base-100 p-3 shadow-sm">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 font-medium uppercase tracking-wide opacity-60">
                Search
              </span>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-50" />
                <input
                  type="search"
                  className="input input-bordered input-sm h-8 w-full pl-9"
                  placeholder="Search contract #, name, customer, manager…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </label>
            <div className="flex h-8 items-center justify-end sm:pb-0">
              {hasFilters ? (
                <button type="button" className="btn btn-ghost btn-sm h-8 min-h-8" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                  Clear filters
                </button>
              ) : (
                <span className="hidden h-8 w-[7.5rem] sm:block" aria-hidden />
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Customer</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Status</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {CONTRACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CONTRACT_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Contract type</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
              >
                <option value="">All types</option>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONTRACT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Account manager</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">All managers</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Expiration date</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={expirationPreset}
                onChange={(e) => setExpirationPreset(e.target.value as DatePreset)}
              >
                <option value="">Any expiration</option>
                <option value="next_30">Next 30 days</option>
                <option value="next_60">Next 60 days</option>
                <option value="next_90">Next 90 days</option>
                <option value="past">Already expired</option>
                <option value="custom">Custom range</option>
              </select>
            </label>

            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Renewal date</span>
              <select
                className="select select-bordered select-sm h-8 w-full"
                value={renewalPreset}
                onChange={(e) => setRenewalPreset(e.target.value as DatePreset)}
              >
                <option value="">Any renewal</option>
                <option value="next_30">Next 30 days</option>
                <option value="next_60">Next 60 days</option>
                <option value="next_90">Next 90 days</option>
                <option value="past">Past renewal date</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
          </div>
        </div>

        {expirationPreset === "custom" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Expiration from</span>
              <input
                type="date"
                className="input input-bordered input-sm h-8 w-full"
                value={expirationFrom}
                onChange={(e) => setExpirationFrom(e.target.value)}
              />
            </label>
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Expiration to</span>
              <input
                type="date"
                className="input input-bordered input-sm h-8 w-full"
                value={expirationTo}
                onChange={(e) => setExpirationTo(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {renewalPreset === "custom" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Renewal from</span>
              <input
                type="date"
                className="input input-bordered input-sm h-8 w-full"
                value={renewalFrom}
                onChange={(e) => setRenewalFrom(e.target.value)}
              />
            </label>
            <label className="form-control w-full min-w-0">
              <span className="mb-1 block h-4 text-xs leading-4 opacity-60">Renewal to</span>
              <input
                type="date"
                className="input input-bordered input-sm h-8 w-full"
                value={renewalTo}
                onChange={(e) => setRenewalTo(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="opacity-60">
              Showing {filtered.length} of {contracts.length}
            </span>
            <span className="badge badge-ghost badge-sm">90-day: {highlightCounts.renewal_90}</span>
            <span className="badge badge-info badge-sm">60-day: {highlightCounts.renewal_60}</span>
            <span className="badge badge-warning badge-sm">30-day: {highlightCounts.renewal_30}</span>
            <span className="badge badge-warning badge-outline badge-sm">
              Expiring soon: {highlightCounts.ends_soon}
            </span>
            <span className="badge badge-error badge-sm">
              Past end date: {highlightCounts.past_end_date}
            </span>
          </div>
          {role ? (
            <ExportContractsButton rows={filtered.map((item) => item.row)} role={role} />
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/70 to-base-100 shadow-sm">
        <div className="border-b border-violet-200/70 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
            Contract directory ({filtered.length})
          </h2>
        </div>
        <div className="p-3">
          {filtered.length === 0 ? (
            <EmptyState
              title="No contracts match your filters"
              description="Clear filters or adjust search to see more agreements."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-violet-100 bg-white/85">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>
                      <SortHeader label="Contract #" column="contract_number" />
                    </th>
                    <th>
                      <SortHeader label="Customer" column="customer" />
                    </th>
                    <th>
                      <SortHeader label="Contract name" column="name" />
                    </th>
                    <th>
                      <SortHeader label="Status" column="status" />
                    </th>
                    <th>
                      <SortHeader label="Type" column="contract_type" />
                    </th>
                    <th>
                      <SortHeader label="Start" column="start_date" />
                    </th>
                    <th>
                      <SortHeader label="End" column="end_date" />
                    </th>
                    <th>
                      <SortHeader label="MRR" column="mrr" />
                    </th>
                    <th>
                      <SortHeader label="Renewal" column="renewal_date" />
                    </th>
                    <th>
                      <SortHeader label="Account manager" column="manager" />
                    </th>
                    <th>Alerts</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(
                    ({ row, customer, manager, renewalDate, warnings, highlight, mrr }) => (
                      <tr key={row.id} className={contractHighlightClass(highlight)}>
                        <td className="font-mono text-xs">{row.contract_number}</td>
                        <td>
                          {customer ? (
                            <Link href={`/customers/${customer.id}`} className="link link-hover">
                              {customer.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/contracts/${row.id}`}
                            className="link link-hover font-medium"
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="min-w-[7.5rem] max-w-[11rem]">
                          <StatusBadge
                            status={row.status}
                            label={
                              CONTRACT_STATUS_LABELS[
                                row.status as keyof typeof CONTRACT_STATUS_LABELS
                              ] ?? statusLabel(row.status)
                            }
                            className="badge-sm h-auto max-w-full whitespace-normal px-2.5 py-1 text-left text-[0.7rem] font-medium leading-snug"
                          />
                        </td>
                        <td className="text-xs">
                          {CONTRACT_TYPE_LABELS[
                            row.contract_type as keyof typeof CONTRACT_TYPE_LABELS
                          ] ?? statusLabel(String(row.contract_type))}
                        </td>
                        <td className="whitespace-nowrap text-xs">{formatDate(row.start_date)}</td>
                        <td className="whitespace-nowrap text-xs">{formatDate(row.end_date)}</td>
                        <td className="whitespace-nowrap">
                          <Money value={mrr} />
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {renewalDate ? formatDate(renewalDate) : "—"}
                          {row.renewal_type && row.renewal_type !== "none" ? (
                            <div className="opacity-50">{statusLabel(String(row.renewal_type))}</div>
                          ) : null}
                        </td>
                        <td className="text-xs">{manager?.full_name ?? "—"}</td>
                        <td className="min-w-[11rem] max-w-[16rem]">
                          {warnings.length > 0 ? (
                            <div className="flex flex-col items-start gap-1">
                              {warnings.map((warning) => (
                                <span
                                  key={warning.code}
                                  className={`badge badge-sm h-auto max-w-full whitespace-normal px-2.5 py-1 text-left text-[0.7rem] font-medium leading-snug ${
                                    warning.code === "past_end_date"
                                      ? "badge-error"
                                      : warning.code === "renewal_90"
                                        ? "badge-ghost"
                                        : warning.code === "renewal_60" ||
                                            warning.code === "renewal_soon"
                                          ? "badge-info"
                                          : "badge-warning"
                                  }`}
                                >
                                  {warning.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs opacity-40">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link href={`/contracts/${row.id}`} className="btn btn-ghost btn-xs">
                              View
                            </Link>
                            {canEdit ? (
                              <Link
                                href={`/contracts/${row.id}/edit`}
                                className="btn btn-ghost btn-xs"
                              >
                                Edit
                              </Link>
                            ) : null}
                            {row.status === "pending_approval" ? (
                              <Link href={`/contracts/${row.id}`} className="btn btn-primary btn-xs">
                                Approve
                              </Link>
                            ) : null}
                            {row.status === "active" || row.status === "expired" ? (
                              <Link href={`/contracts/${row.id}`} className="btn btn-outline btn-xs">
                                Renew / Cancel
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
