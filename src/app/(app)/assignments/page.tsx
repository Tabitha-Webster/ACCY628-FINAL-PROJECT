import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { roleHomePath } from "@/lib/constants";
import {
  PageHeader,
  StatCard,
  EmptyState,
  DataTable,
  StatusBadge,
  DateText,
  ErrorState,
} from "@/components/ui";
import { AdHocWorkForm } from "@/components/AdHocWorkForm";
import { slaStatus } from "@/lib/calculations";
import type { SupportTicket } from "@/lib/types";

const OPEN_TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
];

function ticketSlaSeverity(t: {
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
}) {
  const response = slaStatus(t.target_response_at, t.actual_response_at);
  const resolution = slaStatus(t.target_resolution_at, t.completed_at);
  if (response === "missed" || resolution === "missed") return "missed";
  if (response === "at_risk" || resolution === "at_risk") return "at_risk";
  return "on_track";
}

export default async function AssignmentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "technician") redirect(roleHomePath(profile.role));

  const supabase = await createClient();

  const [assignmentsRes, ticketsRes, myTicketsRes, additionalWorkRes, customersRes, contractsRes] =
    await Promise.all([
      supabase
        .from("technician_assignments")
        .select("id, support_ticket_id, project_id, assigned_at, due_at, notes")
        .eq("technician_id", profile.id)
        .order("due_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("support_tickets")
        .select(
          "id, ticket_number, customer_id, contract_id, title, priority, status, target_response_at, target_resolution_at, actual_response_at, completed_at, assigned_technician_id"
        )
        .or(`assigned_technician_id.eq.${profile.id},assigned_technician_id.is.null`)
        .in("status", OPEN_TICKET_STATUSES)
        .order("priority", { ascending: true }),
      supabase
        .from("support_tickets")
        .select("id")
        .eq("assigned_technician_id", profile.id)
        .in("status", OPEN_TICKET_STATUSES),
      supabase
        .from("additional_work_requests")
        .select("id, title, customer_id, approval_status, created_at")
        .eq("requested_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("customers").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("contracts")
        .select("id, name, contract_number, customer_id")
        .eq("status", "active"),
    ]);

  if (assignmentsRes.error) {
    return (
      <div>
        <PageHeader title="My Assignments" />
        <ErrorState message={assignmentsRes.error.message} />
      </div>
    );
  }

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const customers = customersRes.data ?? [];
  const contracts = (contractsRes.data ?? []).map((c) => ({
    id: c.id as string,
    customerId: c.customer_id as string,
    label: `${c.contract_number} · ${c.name}`,
  }));

  const ticketIds = new Set(
    (assignmentsRes.data ?? []).map((a) => a.support_ticket_id).filter((v): v is string => Boolean(v))
  );
  const projectIds = new Set(
    (assignmentsRes.data ?? []).map((a) => a.project_id).filter((v): v is string => Boolean(v))
  );
  const [assignmentTicketsRes, assignmentProjectsRes] = await Promise.all([
    ticketIds.size
      ? supabase
          .from("support_tickets")
          .select("id, ticket_number, title, customer_id, contract_id")
          .in("id", Array.from(ticketIds))
      : Promise.resolve({
          data: [] as {
            id: string;
            ticket_number: string;
            title: string;
            customer_id: string;
            contract_id: string | null;
          }[],
        }),
    projectIds.size
      ? supabase.from("projects").select("id, name, customer_id").in("id", Array.from(projectIds))
      : Promise.resolve({ data: [] as { id: string; name: string; customer_id: string }[] }),
  ]);
  const ticketById = new Map((assignmentTicketsRes.data ?? []).map((t) => [t.id, t]));
  const projectById = new Map((assignmentProjectsRes.data ?? []).map((p) => [p.id, p]));

  const assignments = assignmentsRes.data ?? [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const overdueAssignments = assignments.filter((a) => a.due_at && a.due_at < now.toISOString());
  const todayAssignments = assignments.filter((a) => a.due_at && a.due_at.slice(0, 10) === todayStr);
  const upcomingAssignments = assignments.filter(
    (a) => a.due_at && a.due_at > now.toISOString() && a.due_at <= in7Days && a.due_at.slice(0, 10) !== todayStr
  );
  const unscheduledAssignments = assignments.filter((a) => !a.due_at);

  const tickets = (ticketsRes.data ?? []) as SupportTicket[];
  const myOpenTickets = tickets.filter((t) => t.assigned_technician_id === profile.id);
  const myOpenTicketCount = myTicketsRes.data?.length ?? 0;
  const highPriority = myOpenTickets.filter((t) => ["high", "critical"].includes(t.priority));
  const slaApproaching = myOpenTickets.filter((t) => ticketSlaSeverity(t) === "at_risk");

  const additionalWork = additionalWorkRes.data ?? [];

  function renderAssignment(a: (typeof assignments)[number]) {
    const ticket = a.support_ticket_id ? ticketById.get(a.support_ticket_id) : null;
    const project = a.project_id ? projectById.get(a.project_id) : null;
    const label = ticket ? `${ticket.ticket_number} · ${ticket.title}` : project ? project.name : "Assignment";
    const href = ticket ? `/tickets/${ticket.id}` : project ? `/projects/${project.id}` : "#";
    const customerId = ticket?.customer_id ?? project?.customer_id;
    const contractId = ticket?.contract_id ?? null;
    return (
      <tr key={a.id}>
        <td>
          <Link className="link link-hover" href={href}>
            {label}
          </Link>
        </td>
        <td>{customerId ? customerName.get(customerId) ?? "—" : "—"}</td>
        <td>
          {contractId ? (
            <Link className="link link-hover" href={`/contracts/${contractId}`}>
              Requirements
            </Link>
          ) : (
            "—"
          )}
        </td>
        <td>{a.due_at ? <DateText value={a.due_at} /> : "Unscheduled"}</td>
        <td className="max-w-xs truncate opacity-70">{a.notes ?? "—"}</td>
      </tr>
    );
  }

  const assignmentHeaders = ["Assignment", "Customer", "Contract", "Due", "Notes"];

  return (
    <div>
      <PageHeader
        title="My Assignments"
        description={`Welcome back, ${profile.full_name}. Review upcoming work, check contract requirements, complete tickets, and log time and materials.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Tickets Assigned to Me" value={String(myOpenTicketCount)} />
        <StatCard label="High Priority" value={String(highPriority.length)} tone={highPriority.length > 0 ? "warning" : "default"} />
        <StatCard label="SLA Approaching" value={String(slaApproaching.length)} tone={slaApproaching.length > 0 ? "error" : "success"} />
        <StatCard
          label="Overdue Assignments"
          value={String(overdueAssignments.length)}
          tone={overdueAssignments.length > 0 ? "error" : "success"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Overdue</h2>
          {overdueAssignments.length === 0 ? (
            <EmptyState title="Nothing overdue" description="Great work — no assignments are past due." />
          ) : (
            <DataTable headers={assignmentHeaders}>{overdueAssignments.map(renderAssignment)}</DataTable>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Due Today</h2>
          {todayAssignments.length === 0 ? (
            <EmptyState title="Nothing due today" />
          ) : (
            <DataTable headers={assignmentHeaders}>{todayAssignments.map(renderAssignment)}</DataTable>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Upcoming (7 Days)</h2>
          {upcomingAssignments.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="No assignments due in the next 7 days." />
          ) : (
            <DataTable headers={assignmentHeaders}>{upcomingAssignments.map(renderAssignment)}</DataTable>
          )}
        </div>
      </div>

      {unscheduledAssignments.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Unscheduled</h2>
          <DataTable headers={assignmentHeaders}>{unscheduledAssignments.map(renderAssignment)}</DataTable>
        </div>
      ) : null}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">My Open Tickets</h2>
        <p className="mb-3 text-xs opacity-60">
          Open a ticket to review contract requirements, record completion, and capture time and materials.
        </p>
        {myOpenTickets.length === 0 ? (
          <EmptyState title="No open tickets" description="Assigned tickets that need work will appear here." />
        ) : (
          <DataTable headers={["Ticket", "Customer", "Priority", "Status", "SLA", "Actions"]}>
            {myOpenTickets.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link className="link link-hover" href={`/tickets/${t.id}`}>
                    {t.ticket_number} · {t.title}
                  </Link>
                </td>
                <td>{customerName.get(t.customer_id) ?? "—"}</td>
                <td>
                  <StatusBadge status={t.priority} />
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>
                  <StatusBadge status={ticketSlaSeverity(t)} />
                </td>
                <td>
                  <Link className="btn btn-ghost btn-xs" href={`/tickets/${t.id}`}>
                    Work ticket
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AdHocWorkForm technicianId={profile.id} customers={customers} contracts={contracts} />

        <div>
          <h2 className="mb-2 text-sm font-semibold">My Recent Ad Hoc Requests</h2>
          {additionalWork.length === 0 ? (
            <EmptyState title="No requests yet" description="Submit ad hoc work here or flag out-of-scope work from a ticket." />
          ) : (
            <DataTable headers={["Request", "Customer", "Status", "Submitted"]}>
              {additionalWork.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link className="link link-hover" href="/additional-work">
                      {w.title}
                    </Link>
                  </td>
                  <td>{customerName.get(w.customer_id) ?? "—"}</td>
                  <td>
                    <StatusBadge status={w.approval_status} />
                  </td>
                  <td>
                    <DateText value={w.created_at} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
}
