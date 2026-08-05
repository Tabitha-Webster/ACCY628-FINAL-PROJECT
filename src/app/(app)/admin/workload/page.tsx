import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, DataTable, EmptyState, ErrorState, StatCard, StatusBadge, Hours } from "@/components/ui";

export default async function AdminWorkloadPage() {
  await requireAdmin();
  const supabase = await createClient();
  const monthStart = new Date();
  const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const [techRes, ticketsRes, assignmentsRes, timeRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, is_active, internal_cost_rate")
      .eq("role", "technician")
      .order("full_name"),
    supabase
      .from("support_tickets")
      .select("id, assigned_technician_id, priority, status")
      .in("status", OPEN_TICKET_STATUSES),
    supabase.from("technician_assignments").select("id, technician_id, due_at, support_ticket_id, project_id"),
    supabase
      .from("time_entries")
      .select("technician_id, hours_worked")
      .gte("work_date", monthKey),
  ]);

  const error = techRes.error || ticketsRes.error || assignmentsRes.error || timeRes.error;
  const techs = techRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const timeEntries = timeRes.data ?? [];
  const nowIso = new Date().toISOString();

  const rows = techs.map((tech) => {
    const openTickets = tickets.filter((t) => t.assigned_technician_id === tech.id);
    const highPriority = openTickets.filter((t) => ["high", "critical"].includes(t.priority)).length;
    const techAssignments = assignments.filter((a) => a.technician_id === tech.id);
    const overdue = techAssignments.filter((a) => a.due_at && a.due_at < nowIso).length;
    const hours = timeEntries
      .filter((e) => e.technician_id === tech.id)
      .reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
    return {
      ...tech,
      openTickets: openTickets.length,
      highPriority,
      assignments: techAssignments.length,
      overdue,
      hours,
    };
  });

  const busiest = [...rows].sort((a, b) => b.openTickets - a.openTickets)[0];
  const unassigned = tickets.filter((t) => !t.assigned_technician_id).length;

  return (
    <div>
      <PageHeader
        title="Technician Workload"
        description="Open tickets, assignments, and hours logged this month by technician."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Technicians" value={String(techs.length)} />
        <StatCard label="Active Technicians" value={String(techs.filter((t) => t.is_active).length)} />
        <StatCard label="Unassigned Open Tickets" value={String(unassigned)} tone={unassigned ? "warning" : "success"} />
        <StatCard
          label="Busiest Technician"
          value={busiest ? String(busiest.openTickets) : "0"}
          hint={busiest ? busiest.full_name : "—"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No technicians found" />
      ) : (
        <DataTable
          headers={["Technician", "Status", "Open tickets", "High / Critical", "Assignments", "Overdue", "Hours this month", "Cost rate"]}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <p className="font-medium">{row.full_name}</p>
                <p className="text-xs opacity-60">{row.email}</p>
              </td>
              <td>
                <StatusBadge status={row.is_active ? "active" : "inactive"} />
              </td>
              <td>{row.openTickets}</td>
              <td>{row.highPriority}</td>
              <td>{row.assignments}</td>
              <td>
                <span className={row.overdue > 0 ? "text-error font-medium" : undefined}>{row.overdue}</span>
              </td>
              <td>
                <Hours value={row.hours} />
              </td>
              <td>{row.internal_cost_rate != null ? `$${Number(row.internal_cost_rate).toFixed(2)}` : "—"}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
