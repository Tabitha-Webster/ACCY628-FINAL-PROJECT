"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, StatusBadge } from "@/components/ui";
import { TicketSlaAlerts, SlaConditionBadge } from "@/components/SlaBadges";
import { formatDateTime } from "@/lib/format";
import { evaluateTicketSla, type SlaCondition } from "@/lib/sla";
import type { UserRole } from "@/lib/constants";

export type TicketListItem = {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  customer_id: string;
  customer_name: string;
  contract_id: string | null;
  contract_label: string | null;
  priority: string;
  service_category: string | null;
  status: string;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  submitted_at: string;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
};

type FilterOption = { id: string; name: string };

type Props = {
  tickets: TicketListItem[];
  role: UserRole;
  customers: FilterOption[];
  technicians: FilterOption[];
  categories: string[];
  initialPriority?: string;
};

const STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
  "resolved",
  "closed",
  "canceled",
] as const;

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

function CriticalPriorityBadge({ priority }: { priority: string }) {
  if (priority === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-box border border-error/40 bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
        <span aria-hidden>⚠</span>
        Critical
      </span>
    );
  }
  return <StatusBadge status={priority} />;
}

function liveSla(ticket: TicketListItem) {
  return evaluateTicketSla(ticket);
}

export function TicketListClient({
  tickets,
  role,
  customers,
  technicians,
  categories,
  initialPriority = "",
}: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState(
    PRIORITIES.includes(initialPriority as (typeof PRIORITIES)[number]) ? initialPriority : ""
  );
  const [category, setCategory] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const showCustomerFilter = role !== "customer";
  const showTechnicianFilter = role === "manager" || role === "billing";

  const enriched = useMemo(
    () =>
      tickets.map((t) => {
        const sla = liveSla(t);
        return { ticket: t, sla };
      }),
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ ticket: t, sla }) => {
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      if (category && (t.service_category ?? "") !== category) return false;
      if (customerId && t.customer_id !== customerId) return false;
      if (technicianId === "unassigned") {
        if (t.assigned_technician_id) return false;
      } else if (technicianId && t.assigned_technician_id !== technicianId) {
        return false;
      }
      if (overdueOnly && !sla.overdue) return false;
      if (q) {
        const haystack = [t.ticket_number, t.title, t.customer_name, t.description]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, status, priority, category, customerId, technicianId, overdueOnly]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPriority("");
    setCategory("");
    setCustomerId("");
    setTechnicianId("");
    setOverdueOnly(false);
  }

  return (
    <div className="space-y-4">
      {priority === "critical" ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>Showing critical-priority tickets only. Treat these as highest urgency.</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="form-control w-full sm:max-w-xs">
          <span className="label-text text-xs">Search</span>
          <input
            className="input input-bordered input-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket #, title, customer…"
          />
        </label>
        <label className="form-control w-full sm:w-40">
          <span className="label-text text-xs">Status</span>
          <select
            className="select select-bordered select-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full sm:w-36">
          <span className="label-text text-xs">Priority</span>
          <select
            className="select select-bordered select-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full sm:w-44">
          <span className="label-text text-xs">Category</span>
          <select
            className="select select-bordered select-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {showCustomerFilter ? (
          <label className="form-control w-full sm:w-48">
            <span className="label-text text-xs">Customer</span>
            <select
              className="select select-bordered select-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showTechnicianFilter ? (
          <label className="form-control w-full sm:w-48">
            <span className="label-text text-xs">Technician</span>
            <select
              className="select select-bordered select-sm"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
            >
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="label cursor-pointer gap-2 justify-start">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-error"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          <span className="label-text text-xs">Overdue only</span>
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
          Clear
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No tickets match"
          description={
            tickets.length === 0
              ? role === "technician"
                ? "No tickets are currently assigned to you."
                : "Support tickets from customers will appear here once submitted."
              : "Try clearing filters or adjusting your search."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {filtered.map(({ ticket: t, sla }) => {
              const isCritical = t.priority === "critical";
              const overall = sla.overall as SlaCondition;
              return (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className={`block rounded-box border bg-base-100 p-4 shadow-sm transition hover:border-primary/40 ${
                    isCritical || sla.overdue
                      ? "border-error/50"
                      : overall === "at_risk"
                        ? "border-warning/40"
                        : "border-base-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t.ticket_number}</p>
                      <p className="mt-0.5 text-sm">{t.title}</p>
                    </div>
                    <CriticalPriorityBadge priority={t.priority} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge status={t.status} />
                    <SlaConditionBadge condition={overall} />
                    {t.service_category ? <span className="badge badge-ghost">{t.service_category}</span> : null}
                  </div>
                  {(isCritical || sla.overdue || overall === "at_risk") && (
                    <div className="mt-3">
                      <TicketSlaAlerts ticket={t} />
                    </div>
                  )}
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="opacity-60">Customer</dt>
                      <dd>{t.customer_name}</dd>
                    </div>
                    <div>
                      <dt className="opacity-60">Contract</dt>
                      <dd>{t.contract_label ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="opacity-60">Technician</dt>
                      <dd>{t.assigned_technician_name ?? "Unassigned"}</dd>
                    </div>
                    <div>
                      <dt className="opacity-60">Submitted</dt>
                      <dd>{formatDateTime(t.submitted_at)}</dd>
                    </div>
                    <div>
                      <dt className="opacity-60">Response due</dt>
                      <dd>{formatDateTime(t.target_response_at)}</dd>
                    </div>
                    <div>
                      <dt className="opacity-60">Resolution due</dt>
                      <dd>{formatDateTime(t.target_resolution_at)}</dd>
                    </div>
                  </dl>
                </Link>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-box border border-base-300 bg-base-100 lg:block">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Contract</th>
                  <th>Priority</th>
                  <th>Category</th>
                  <th>Technician</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Response due</th>
                  <th>Resolution due</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ ticket: t, sla }) => {
                  const overall = sla.overall as SlaCondition;
                  const rowTone =
                    t.priority === "critical" || sla.overdue
                      ? "bg-error/5"
                      : overall === "at_risk"
                        ? "bg-warning/[0.04]"
                        : "";
                  return (
                    <tr key={t.id} className={`hover ${rowTone}`}>
                      <td className="min-w-48">
                        <Link className="link link-hover font-medium" href={`/tickets/${t.id}`}>
                          {t.ticket_number}
                        </Link>
                        <div className="max-w-xs truncate text-xs opacity-70">{t.title}</div>
                        {sla.overdue || t.priority === "critical" ? (
                          <div className="mt-1 max-w-xs">
                            <TicketSlaAlerts ticket={t} />
                          </div>
                        ) : null}
                      </td>
                      <td>{t.customer_name}</td>
                      <td className="max-w-40 truncate">{t.contract_label ?? "—"}</td>
                      <td>
                        <CriticalPriorityBadge priority={t.priority} />
                      </td>
                      <td>{t.service_category ?? "—"}</td>
                      <td>{t.assigned_technician_name ?? "Unassigned"}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(t.submitted_at)}</td>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(t.target_response_at)}</td>
                      <td className="whitespace-nowrap text-xs">{formatDateTime(t.target_resolution_at)}</td>
                      <td>
                        <SlaConditionBadge condition={overall} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
