import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Flame,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { roleHomePath } from "@/lib/constants";
import { EmptyState, StatusBadge, DateText, ErrorState } from "@/components/ui";
import { AdHocWorkForm } from "@/components/AdHocWorkForm";
import { evaluateTechnicianTicketSla } from "@/lib/sla";
import type { SupportTicket } from "@/lib/types";

const OPEN_TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
];

const TONE = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80",
    icon: "bg-sky-500/15 text-sky-700",
    value: "text-sky-900",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80",
    icon: "bg-violet-500/15 text-violet-700",
    value: "text-violet-900",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80",
    icon: "bg-amber-500/15 text-amber-800",
    value: "text-amber-950",
  },
  rose: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 to-rose-100/90",
    icon: "bg-rose-500/15 text-rose-700",
    value: "text-rose-900",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
} as const;

function ticketSlaSeverity(t: {
  title?: string | null;
  submitted_at?: string | null;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  status?: string | null;
  priority?: string | null;
}) {
  const sla = evaluateTechnicianTicketSla(t);
  if (sla.overdue || sla.overall === "missed") return "missed";
  if (sla.overall === "at_risk") return "at_risk";
  return "on_track";
}

function MetricTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE;
  icon: ReactNode;
  hint?: string;
}) {
  const styles = TONE[tone];
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${styles.card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <span className={`rounded-lg p-1.5 ${styles.icon}`}>{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${styles.value}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] opacity-60">{hint}</p> : null}
    </div>
  );
}

function TintedPanel({
  title,
  tone,
  children,
  count,
}: {
  title: string;
  tone: "sky" | "violet" | "amber" | "rose" | "emerald";
  children: ReactNode;
  count?: number;
}) {
  const shell =
    tone === "rose"
      ? "border-rose-200/80 from-rose-50/80"
      : tone === "amber"
        ? "border-amber-200/80 from-amber-50/80"
        : tone === "violet"
          ? "border-violet-200/80 from-violet-50/80"
          : tone === "emerald"
            ? "border-emerald-200/80 from-emerald-50/80"
            : "border-sky-200/80 from-sky-50/80";
  const header =
    tone === "rose"
      ? "border-rose-200/70 text-rose-900/80"
      : tone === "amber"
        ? "border-amber-200/70 text-amber-900/80"
        : tone === "violet"
          ? "border-violet-200/70 text-violet-900/80"
          : tone === "emerald"
            ? "border-emerald-200/70 text-emerald-900/80"
            : "border-sky-200/70 text-sky-900/80";
  return (
    <section className={`overflow-hidden rounded-2xl border bg-gradient-to-b to-base-100 shadow-sm ${shell}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${header}`}>
        <h2 className="text-xs font-semibold uppercase tracking-wide">{title}</h2>
        {count != null ? (
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm">
            {count}
          </span>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
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
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Assignments Workbench</h1>
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

  function assignmentCard(a: (typeof assignments)[number], tone: "rose" | "amber" | "sky" | "violet") {
    const ticket = a.support_ticket_id ? ticketById.get(a.support_ticket_id) : null;
    const project = a.project_id ? projectById.get(a.project_id) : null;
    const label = ticket
      ? `${ticket.ticket_number} · ${ticket.title}`
      : project
        ? project.name
        : "Assignment";
    const href = ticket ? `/tickets/${ticket.id}` : project ? `/projects/${project.id}` : "#";
    const customerId = ticket?.customer_id ?? project?.customer_id;
    const contractId = ticket?.contract_id ?? null;
    const border =
      tone === "rose"
        ? "border-rose-100 hover:border-rose-300"
        : tone === "amber"
          ? "border-amber-100 hover:border-amber-300"
          : tone === "violet"
            ? "border-violet-100 hover:border-violet-300"
            : "border-sky-100 hover:border-sky-300";

    return (
      <li key={a.id}>
        <div className={`rounded-xl border bg-white/85 px-3 py-2.5 shadow-sm transition ${border}`}>
          <Link href={href} className="block text-sm font-semibold hover:underline">
            {label}
          </Link>
          <p className="mt-0.5 text-[11px] opacity-70">
            {customerId ? customerName.get(customerId) ?? "—" : "—"}
            {" · "}
            {a.due_at ? <DateText value={a.due_at} /> : "Unscheduled"}
          </p>
          {a.notes ? <p className="mt-1 truncate text-[11px] opacity-60">{a.notes}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {contractId ? (
              <Link className="link link-hover" href={`/contracts/${contractId}`}>
                Requirements
              </Link>
            ) : (
              <span className="opacity-50">No contract link</span>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Assignments Workbench</h1>
        <p className="text-sm opacity-70">
          Welcome back, {profile.full_name}. Review upcoming work, check contract requirements, and log
          time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Open tickets"
          value={String(myOpenTicketCount)}
          tone="sky"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricTile
          label="High priority"
          value={String(highPriority.length)}
          tone={highPriority.length > 0 ? "violet" : "emerald"}
          icon={<Flame className="h-4 w-4" />}
        />
        <MetricTile
          label="SLA approaching"
          value={String(slaApproaching.length)}
          tone={slaApproaching.length > 0 ? "amber" : "emerald"}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <MetricTile
          label="Overdue"
          value={String(overdueAssignments.length)}
          tone={overdueAssignments.length > 0 ? "rose" : "emerald"}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Assignments past due"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TintedPanel title="Overdue" tone="rose" count={overdueAssignments.length}>
          {overdueAssignments.length === 0 ? (
            <p className="text-sm opacity-60">Nothing overdue.</p>
          ) : (
            <ul className="space-y-2">{overdueAssignments.map((a) => assignmentCard(a, "rose"))}</ul>
          )}
        </TintedPanel>
        <TintedPanel title="Due today" tone="amber" count={todayAssignments.length}>
          {todayAssignments.length === 0 ? (
            <p className="text-sm opacity-60">Nothing due today.</p>
          ) : (
            <ul className="space-y-2">{todayAssignments.map((a) => assignmentCard(a, "amber"))}</ul>
          )}
        </TintedPanel>
        <TintedPanel title="Upcoming (7 days)" tone="sky" count={upcomingAssignments.length}>
          {upcomingAssignments.length === 0 ? (
            <p className="text-sm opacity-60">Nothing scheduled this week.</p>
          ) : (
            <ul className="space-y-2">{upcomingAssignments.map((a) => assignmentCard(a, "sky"))}</ul>
          )}
        </TintedPanel>
      </div>

      {unscheduledAssignments.length > 0 ? (
        <TintedPanel title="Unscheduled" tone="violet" count={unscheduledAssignments.length}>
          <ul className="space-y-2">
            {unscheduledAssignments.map((a) => assignmentCard(a, "violet"))}
          </ul>
        </TintedPanel>
      ) : null}

      <TintedPanel title="My open tickets" tone="sky" count={myOpenTickets.length}>
        <p className="mb-2 text-[11px] opacity-60">
          Open a ticket to review requirements, record completion, and capture time and materials.
        </p>
        {myOpenTickets.length === 0 ? (
          <EmptyState title="No open tickets" description="Assigned tickets that need work will appear here." />
        ) : (
          <ul className="space-y-2">
            {myOpenTickets.map((t) => (
              <li key={t.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-100 bg-white/85 px-3 py-2.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/tickets/${t.id}`} className="text-sm font-semibold hover:underline">
                      {t.ticket_number} · {t.title}
                    </Link>
                    <p className="text-[11px] opacity-70">{customerName.get(t.customer_id) ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <StatusBadge status={t.priority} />
                    <StatusBadge status={t.status} />
                    <StatusBadge status={ticketSlaSeverity(t)} />
                    <Link className="btn btn-ghost btn-xs" href={`/tickets/${t.id}`}>
                      Work ticket
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TintedPanel>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-3 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
            Log ad hoc work
          </h2>
          <AdHocWorkForm technicianId={profile.id} customers={customers} contracts={contracts} />
        </div>

        <TintedPanel title="My recent ad hoc requests" tone="violet" count={additionalWork.length}>
          {additionalWork.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Submit ad hoc work here or flag out-of-scope work from a ticket."
            />
          ) : (
            <ul className="space-y-2">
              {additionalWork.map((w) => (
                <li key={w.id}>
                  <div className="rounded-xl border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm">
                    <Link href="/additional-work" className="text-sm font-semibold hover:underline">
                      {w.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="opacity-70">{customerName.get(w.customer_id) ?? "—"}</span>
                      <StatusBadge status={w.approval_status} />
                      <DateText value={w.created_at} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TintedPanel>
      </div>
    </div>
  );
}
