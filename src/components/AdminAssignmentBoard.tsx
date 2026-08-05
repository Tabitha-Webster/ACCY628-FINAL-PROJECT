"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui";

export type BoardTicket = {
  id: string;
  ticket_number: string;
  title: string;
  priority: string;
  status: string;
  customerName: string;
  assigned_technician_id: string | null;
};

export type TechOption = {
  id: string;
  full_name: string;
};

type Props = {
  unassigned: BoardTicket[];
  assigned: BoardTicket[];
  technicians: TechOption[];
};

export function AdminAssignmentBoard({ unassigned, assigned, technicians }: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());

  async function assign(ticketId: string, technicianId: string) {
    if (!technicianId) {
      setError("Select a technician first.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoadingId(ticketId);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({
        assigned_technician_id: technicianId,
        status: "assigned",
      })
      .eq("id", ticketId);

    if (!updateError) {
      const { error: assignError } = await supabase.from("technician_assignments").insert({
        technician_id: technicianId,
        support_ticket_id: ticketId,
        assigned_at: new Date().toISOString(),
        notes: "Assigned from Admin Assignment Board",
      });
      // Ticket update is the source of truth; assignment row is best-effort history.
      if (assignError) {
        console.warn("technician_assignments insert:", assignError.message);
      }
    }

    setLoadingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setGone((prev) => new Set(prev).add(ticketId));
    setMessage("Ticket assigned.");
    router.refresh();
  }

  const openUnassigned = unassigned.filter((t) => !gone.has(t.id));

  return (
    <div className="space-y-6">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Unassigned ({openUnassigned.length})
        </h2>
        {openUnassigned.length === 0 ? (
          <p className="text-sm opacity-50">All open tickets have an assignee.</p>
        ) : (
          <div className="space-y-3">
            {openUnassigned.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-3 rounded-box border border-warning/40 bg-base-100 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link href={`/tickets/${t.id}`} className="link link-hover font-medium">
                    {t.ticket_number}: {t.title}
                  </Link>
                  <p className="text-xs opacity-60">
                    {t.customerName} · <StatusBadge status={t.priority} /> · <StatusBadge status={t.status} />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="select select-bordered select-sm"
                    value={picks[t.id] ?? ""}
                    onChange={(e) => setPicks((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  >
                    <option value="">Assign to…</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={loadingId === t.id}
                    onClick={() => assign(t.id, picks[t.id] ?? "")}
                  >
                    {loadingId === t.id ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Recently assigned open tickets ({assigned.length})
        </h2>
        {assigned.length === 0 ? (
          <p className="text-sm opacity-50">No assigned open tickets yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Reassign</th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((t) => {
                  const techName =
                    technicians.find((x) => x.id === t.assigned_technician_id)?.full_name ?? "—";
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/tickets/${t.id}`} className="link link-hover">
                          {t.ticket_number}
                        </Link>
                        <div className="max-w-xs truncate text-xs opacity-60">{t.title}</div>
                      </td>
                      <td>{t.customerName}</td>
                      <td>
                        <StatusBadge status={t.priority} />
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>{techName}</td>
                      <td>
                        <div className="flex gap-1">
                          <select
                            className="select select-bordered select-xs"
                            value={picks[t.id] ?? t.assigned_technician_id ?? ""}
                            onChange={(e) => setPicks((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          >
                            {technicians.map((tech) => (
                              <option key={tech.id} value={tech.id}>
                                {tech.full_name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            disabled={loadingId === t.id}
                            onClick={() =>
                              assign(t.id, picks[t.id] ?? t.assigned_technician_id ?? "")
                            }
                          >
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
