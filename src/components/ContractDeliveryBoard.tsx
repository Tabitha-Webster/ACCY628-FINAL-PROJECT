"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MarkContractCompletedButton } from "@/components/MarkContractCompletedButton";
import { StatusBadge } from "@/components/ui";
import {
  isIncompleteProjectStatus,
  ticketProgressPercent,
} from "@/lib/contracts/delivery-completion";
import { CONTRACT_STATUS_LABELS } from "@/lib/contracts/constants";
import type { ContractStatus } from "@/lib/types";

export type DeliveryTicket = {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  technicianName: string | null;
};

export type DeliveryProject = {
  id: string;
  name: string;
  status: string;
  progressPercent: number;
};

export type DeliveryContractCard = {
  id: string;
  contract_number: string;
  name: string;
  status: ContractStatus;
  customerName: string;
  ready: boolean;
  openTicketCount: number;
  incompleteProjectCount: number;
  tickets: DeliveryTicket[];
  projects: DeliveryProject[];
};

type Props = {
  profileId: string;
  contracts: DeliveryContractCard[];
  unlinkedTickets: { id: string; ticket_number: string; title: string }[];
  unlinkedProjects: { id: string; name: string; status: string }[];
};

function progressBubbleClass(pct: number) {
  if (pct >= 100) return "bg-emerald-600 text-white border-emerald-700";
  if (pct >= 75) return "bg-violet-500 text-white border-violet-600";
  if (pct >= 50) return "bg-amber-500 text-white border-amber-600";
  if (pct >= 25) return "bg-sky-500 text-white border-sky-600";
  return "bg-slate-400 text-white border-slate-500";
}

function ticketStatusBubbleClass(status: string) {
  switch (status) {
    case "resolved":
    case "closed":
      return "bg-emerald-600 text-white border-emerald-700";
    case "in_progress":
      return "bg-amber-500 text-white border-amber-600";
    case "assigned":
      return "bg-sky-500 text-white border-sky-600";
    case "waiting_on_customer":
      return "bg-violet-500 text-white border-violet-600";
    case "waiting_on_approval":
      return "bg-fuchsia-600 text-white border-fuchsia-700";
    case "new":
      return "bg-slate-500 text-white border-slate-600";
    case "canceled":
      return "bg-zinc-500 text-white border-zinc-600";
    default:
      return "bg-slate-400 text-white border-slate-500";
  }
}

function Bubble({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize tabular-nums ${className}`}
    >
      {label}
    </span>
  );
}

export function ContractDeliveryBoard({
  profileId,
  contracts,
  unlinkedTickets,
  unlinkedProjects,
}: Props) {
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState<"all" | "ready" | "open">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (readiness === "ready" && !c.ready) return false;
      if (readiness === "open" && c.ready) return false;
      if (!q) return true;
      const haystack = `${c.contract_number} ${c.name} ${c.customerName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [contracts, query, readiness]);

  const readyCount = contracts.filter((c) => c.ready).length;
  const blockedCount = contracts.length - readyCount;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-box border border-slate-300 bg-slate-100 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-600">Active / on-hold</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
            {contracts.length}
          </p>
        </div>
        <div className="rounded-box border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Ready to complete</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
            {readyCount}
          </p>
        </div>
        <div className="rounded-box border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-800">Still have open work</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800">
            {blockedCount}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-3 sm:flex-row sm:items-center">
        <label className="form-control min-w-0 flex-1">
          <span className="sr-only">Search contracts</span>
          <input
            type="search"
            className="input input-bordered input-sm w-full"
            placeholder="Search by contract #, name, or customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="form-control w-full sm:w-52">
          <span className="sr-only">Filter by readiness</span>
          <select
            className="select select-bordered select-sm w-full"
            value={readiness}
            onChange={(e) => setReadiness(e.target.value as "all" | "ready" | "open")}
          >
            <option value="all">All contracts</option>
            <option value="ready">Ready to complete</option>
            <option value="open">Open work only</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-box border border-dashed border-base-300 p-6 text-center text-sm opacity-60">
          No contracts match your search or filter.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((contract) => (
            <section
              key={contract.id}
              className={`rounded-box border bg-base-100 p-4 ${
                contract.ready ? "border-emerald-300" : "border-base-300"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="link link-hover text-lg font-semibold"
                    >
                      {contract.contract_number} · {contract.name}
                    </Link>
                    <StatusBadge
                      status={contract.status}
                      label={CONTRACT_STATUS_LABELS[contract.status] ?? contract.status}
                    />
                    {contract.ready ? (
                      <Bubble
                        label="Ready to complete"
                        className="bg-emerald-600 text-white border-emerald-700"
                      />
                    ) : (
                      <Bubble
                        label="Open work"
                        className="bg-amber-500 text-white border-amber-600"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-sm opacity-70">{contract.customerName}</p>
                  <p className="mt-1 text-xs opacity-60">
                    {contract.tickets.length} ticket
                    {contract.tickets.length === 1 ? "" : "s"} · {contract.projects.length}{" "}
                    project{contract.projects.length === 1 ? "" : "s"}
                    {contract.openTicketCount > 0 || contract.incompleteProjectCount > 0
                      ? ` · ${contract.openTicketCount} open · ${contract.incompleteProjectCount} incomplete projects`
                      : null}
                  </p>
                </div>
                <MarkContractCompletedButton
                  contractId={contract.id}
                  contractNumber={contract.contract_number}
                  status={contract.status}
                  profileId={profileId}
                  openTicketCount={contract.openTicketCount}
                  totalTicketCount={contract.tickets.length}
                  incompleteProjectCount={contract.incompleteProjectCount}
                  totalProjectCount={contract.projects.length}
                />
              </div>

              <div className="mt-4 space-y-3">
                <details className="rounded-box border border-base-300 bg-base-200/30">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-2">
                      <span>
                        Tickets
                        <span className="ml-2 font-normal opacity-60">
                          ({contract.tickets.length})
                        </span>
                      </span>
                      <span className="text-xs font-normal opacity-50">Show / hide</span>
                    </span>
                  </summary>
                  <div className="border-t border-base-300 p-2">
                    {contract.tickets.length === 0 ? (
                      <p className="px-1 py-2 text-sm opacity-60">
                        No tickets linked to this contract.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Ticket</th>
                              <th>Technician</th>
                              <th>Status</th>
                              <th className="text-right">Progress</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contract.tickets.map((ticket) => {
                              const pct = ticketProgressPercent(ticket.status);
                              return (
                                <tr key={ticket.id}>
                                  <td>
                                    <Link
                                      href={`/tickets/${ticket.id}`}
                                      className="link link-hover font-medium"
                                    >
                                      {ticket.ticket_number}
                                    </Link>
                                    <div className="text-xs opacity-60">{ticket.title}</div>
                                  </td>
                                  <td className="text-sm">
                                    {ticket.technicianName ?? "Unassigned"}
                                  </td>
                                  <td>
                                    <Bubble
                                      label={ticket.status.replace(/_/g, " ")}
                                      className={ticketStatusBubbleClass(ticket.status)}
                                    />
                                  </td>
                                  <td className="text-right">
                                    <Bubble
                                      label={`${pct}%`}
                                      className={progressBubbleClass(pct)}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Projects</h3>
                  {contract.projects.length === 0 ? (
                    <p className="text-sm opacity-60">No projects linked to this contract.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-box border border-base-300">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Project</th>
                            <th>Status</th>
                            <th className="text-right">Progress</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contract.projects.map((project) => {
                            const done =
                              !isIncompleteProjectStatus(project.status) ||
                              project.progressPercent >= 100;
                            return (
                              <tr key={project.id}>
                                <td>
                                  <Link
                                    href={`/projects/${project.id}`}
                                    className="link link-hover font-medium"
                                  >
                                    {project.name}
                                  </Link>
                                </td>
                                <td>
                                  <Bubble
                                    label={project.status.replace(/_/g, " ")}
                                    className={
                                      done
                                        ? "bg-emerald-600 text-white border-emerald-700"
                                        : project.status === "in_progress"
                                          ? "bg-amber-500 text-white border-amber-600"
                                          : project.status === "approved"
                                            ? "bg-sky-500 text-white border-sky-600"
                                            : "bg-slate-500 text-white border-slate-600"
                                    }
                                  />
                                </td>
                                <td className="text-right">
                                  <Bubble
                                    label={`${project.progressPercent}%`}
                                    className={progressBubbleClass(project.progressPercent)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {(unlinkedTickets.length > 0 || unlinkedProjects.length > 0) && (
        <section className="rounded-box border border-dashed border-base-300 bg-base-200/30 p-4">
          <h2 className="text-sm font-semibold">Unlinked work</h2>
          <p className="mt-1 text-xs opacity-60">
            These tickets or projects have no contract assigned, so they do not gate Mark Completed.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {unlinkedTickets.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {unlinkedTickets.slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="link link-hover">
                      {t.ticket_number}
                    </Link>{" "}
                    <span className="opacity-60">· {t.title}</span>
                  </li>
                ))}
                {unlinkedTickets.length > 12 ? (
                  <li className="text-xs opacity-60">+{unlinkedTickets.length - 12} more</li>
                ) : null}
              </ul>
            ) : null}
            {unlinkedProjects.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {unlinkedProjects.slice(0, 12).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/projects/${p.id}`} className="link link-hover">
                      {p.name}
                    </Link>
                    <Bubble
                      label={p.status.replace(/_/g, " ")}
                      className="bg-slate-500 text-white border-slate-600"
                    />
                  </li>
                ))}
                {unlinkedProjects.length > 12 ? (
                  <li className="text-xs opacity-60">+{unlinkedProjects.length - 12} more</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
