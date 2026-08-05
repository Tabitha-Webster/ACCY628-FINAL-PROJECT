/**
 * Technician schedule helpers for calendar conflicts and overload checks.
 * Uses scheduled_start_at / scheduled_end_at only — never SLA deadlines as appointments.
 */

export type ScheduledTicket = {
  id: string;
  ticket_number: string;
  title: string;
  priority: string;
  status: string;
  scheduled_start_at: string;
  scheduled_end_at: string | null;
  target_resolution_at: string | null;
};

export function eventEndIso(ticket: Pick<ScheduledTicket, "scheduled_start_at" | "scheduled_end_at">) {
  if (ticket.scheduled_end_at) return ticket.scheduled_end_at;
  // Default 1-hour block when end is missing
  return new Date(new Date(ticket.scheduled_start_at).getTime() + 60 * 60 * 1000).toISOString();
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

export function findScheduleConflicts(tickets: ScheduledTicket[]) {
  const conflicts: { aId: string; bId: string; aNumber: string; bNumber: string }[] = [];
  for (let i = 0; i < tickets.length; i++) {
    for (let j = i + 1; j < tickets.length; j++) {
      const a = tickets[i];
      const b = tickets[j];
      if (
        rangesOverlap(a.scheduled_start_at, eventEndIso(a), b.scheduled_start_at, eventEndIso(b))
      ) {
        conflicts.push({
          aId: a.id,
          bId: b.id,
          aNumber: a.ticket_number,
          bNumber: b.ticket_number,
        });
      }
    }
  }
  return conflicts;
}

export function findPastDeadlineSchedules(tickets: ScheduledTicket[]) {
  return tickets.filter((t) => {
    if (!t.target_resolution_at) return false;
    return new Date(t.scheduled_start_at).getTime() > new Date(t.target_resolution_at).getTime();
  });
}

/** Days with more than `limit` scheduled visits. */
export function findOverloadedDays(tickets: ScheduledTicket[], limit = 5) {
  const byDay = new Map<string, number>();
  for (const t of tickets) {
    const d = new Date(t.scheduled_start_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return Array.from(byDay.entries())
    .filter(([, count]) => count > limit)
    .map(([day, count]) => ({ day, count }));
}

export function findUnscheduledCritical(tickets: {
  id: string;
  ticket_number: string;
  priority: string;
  status: string;
  scheduled_start_at: string | null;
}[]) {
  const open = new Set(["new", "assigned", "in_progress", "waiting_on_customer", "waiting_on_approval"]);
  return tickets.filter(
    (t) =>
      t.priority === "critical" &&
      open.has(t.status) &&
      !t.scheduled_start_at
  );
}
