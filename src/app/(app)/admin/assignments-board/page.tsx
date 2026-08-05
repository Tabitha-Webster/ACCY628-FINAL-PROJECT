import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";
import { AdminAssignmentBoard, type BoardTicket } from "@/components/AdminAssignmentBoard";
import { CsvExportButton } from "@/components/CsvExportButton";

export default async function AdminAssignmentsBoardPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [ticketsRes, techsRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, priority, status, assigned_technician_id, customers(name)")
      .in("status", OPEN_TICKET_STATUSES)
      .order("priority", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "technician")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const error = ticketsRes.error || techsRes.error;
  if (error) {
    return (
      <div>
        <PageHeader title="Assignment Board" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const toBoard = (t: {
    id: string;
    ticket_number: string;
    title: string;
    priority: string;
    status: string;
    assigned_technician_id: string | null;
    customers: { name: string } | { name: string }[] | null;
  }): BoardTicket => {
    const customer = Array.isArray(t.customers) ? t.customers[0] : t.customers;
    return {
      id: t.id,
      ticket_number: t.ticket_number,
      title: t.title,
      priority: t.priority,
      status: t.status,
      customerName: customer?.name ?? "—",
      assigned_technician_id: t.assigned_technician_id,
    };
  };

  const all = (ticketsRes.data ?? []).map(toBoard);
  const unassigned = all.filter((t) => !t.assigned_technician_id);
  const assigned = all.filter((t) => t.assigned_technician_id);
  const technicians = techsRes.data ?? [];

  const csvRows = all.map((t) => [
    t.ticket_number,
    t.title,
    t.customerName,
    t.priority,
    t.status,
    t.assigned_technician_id
      ? technicians.find((x) => x.id === t.assigned_technician_id)?.full_name ?? t.assigned_technician_id
      : "UNASSIGNED",
  ]);

  return (
    <div>
      <PageHeader
        title="Assignment Board"
        description="Quick-assign unassigned tickets and rebalance open work across technicians."
        actions={
          <div className="flex flex-wrap gap-2">
            <CsvExportButton
              filename="open-ticket-assignments"
              headers={["Ticket #", "Title", "Customer", "Priority", "Status", "Technician"]}
              rows={csvRows}
            />
            <Link href="/admin/workload" className="btn btn-sm btn-outline">
              Workload
            </Link>
            <Link href="/admin" className="btn btn-sm btn-ghost">
              Admin
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Unassigned" value={String(unassigned.length)} tone={unassigned.length ? "warning" : "success"} />
        <StatCard label="Assigned open" value={String(assigned.length)} />
        <StatCard label="Active technicians" value={String(technicians.length)} />
      </div>

      <AdminAssignmentBoard unassigned={unassigned} assigned={assigned} technicians={technicians} />
    </div>
  );
}
