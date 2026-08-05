import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, DataTable, EmptyState, ErrorState, StatusBadge, Hours, Money, DateText } from "@/components/ui";
import { slaStatus } from "@/lib/calculations";

export default async function AdminExceptionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    ticketsRes,
    pendingWorkRes,
    pendingTimeRes,
    pendingCostsRes,
    overdueInvoicesRes,
    disputesRes,
    unassignedRes,
    inactiveUsersRes,
  ] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, target_resolution_at, completed_at, customers(name)")
      .in("status", OPEN_TICKET_STATUSES)
      .order("target_resolution_at", { ascending: true }),
    supabase
      .from("additional_work_requests")
      .select("id, title, estimated_hours, estimated_amount, created_at, customers(name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("time_entries")
      .select("id, hours_worked, work_date, description, technician_id, customers(name)")
      .eq("approval_status", "pending")
      .order("work_date", { ascending: false })
      .limit(20),
    supabase
      .from("direct_costs")
      .select("id, cost_category, internal_cost, billable_amount, cost_date, description, customers(name)")
      .eq("approval_status", "pending")
      .order("cost_date", { ascending: false })
      .limit(20),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_date, remaining_balance, status, customers(name)")
      .or(`status.eq.overdue,and(due_date.lt.${today},remaining_balance.gt.0)`)
      .order("due_date", { ascending: true })
      .limit(20),
    supabase
      .from("disputes")
      .select("id, dispute_reason, disputed_amount, resolution_status, dispute_date, customers(name)")
      .in("resolution_status", ["open", "under_review"])
      .order("dispute_date", { ascending: false }),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, priority, status, customers(name)")
      .in("status", OPEN_TICKET_STATUSES)
      .is("assigned_technician_id", null),
    supabase.from("profiles").select("id, full_name, email, role").eq("is_active", false),
  ]);

  const error =
    ticketsRes.error ||
    pendingWorkRes.error ||
    pendingTimeRes.error ||
    pendingCostsRes.error ||
    overdueInvoicesRes.error ||
    disputesRes.error ||
    unassignedRes.error ||
    inactiveUsersRes.error;

  const slaIssues = (ticketsRes.data ?? [])
    .map((t) => ({ ...t, sla: slaStatus(t.target_resolution_at, t.completed_at) }))
    .filter((t) => t.sla === "at_risk" || t.sla === "missed");

  const pendingWork = pendingWorkRes.data ?? [];
  const pendingTime = pendingTimeRes.data ?? [];
  const pendingCosts = pendingCostsRes.data ?? [];
  const overdueInvoices = overdueInvoicesRes.data ?? [];
  const disputes = disputesRes.data ?? [];
  const unassigned = unassignedRes.data ?? [];
  const inactiveUsers = inactiveUsersRes.data ?? [];

  const techIds = Array.from(new Set(pendingTime.map((e) => e.technician_id).filter(Boolean)));
  const techNamesRes = techIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", techIds)
    : { data: [] as { id: string; full_name: string }[] };
  const techName = new Map((techNamesRes.data ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Exceptions Queue"
        description="Items that need admin or manager attention across service, approvals, billing, and access."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="SLA Issues" value={String(slaIssues.length)} tone={slaIssues.length ? "error" : "success"} />
        <StatCard label="Pending Approvals" value={String(pendingWork.length + pendingTime.length + pendingCosts.length)} tone="warning" />
        <StatCard label="Overdue Invoices" value={String(overdueInvoices.length)} tone={overdueInvoices.length ? "error" : "success"} />
        <StatCard label="Unassigned Tickets" value={String(unassigned.length)} tone={unassigned.length ? "warning" : "success"} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">SLA at risk / missed</h2>
        {slaIssues.length === 0 ? (
          <EmptyState title="No SLA exceptions" />
        ) : (
          <DataTable headers={["Ticket", "Customer", "Priority", "Status", "SLA"]}>
            {slaIssues.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link className="link link-hover" href={`/tickets/${t.id}`}>
                    {t.ticket_number} · {t.title}
                  </Link>
                </td>
                <td>{(t.customers as { name?: string } | null)?.name ?? "—"}</td>
                <td>
                  <StatusBadge status={t.priority} />
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td>
                  <StatusBadge status={t.sla} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Unassigned open tickets</h2>
        {unassigned.length === 0 ? (
          <EmptyState title="All open tickets are assigned" />
        ) : (
          <DataTable headers={["Ticket", "Customer", "Priority", "Status"]}>
            {unassigned.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link className="link link-hover" href={`/tickets/${t.id}`}>
                    {t.ticket_number} · {t.title}
                  </Link>
                </td>
                <td>{(t.customers as { name?: string } | null)?.name ?? "—"}</td>
                <td>
                  <StatusBadge status={t.priority} />
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Pending additional work</h2>
        {pendingWork.length === 0 ? (
          <EmptyState title="No pending additional work" />
        ) : (
          <DataTable headers={["Request", "Customer", "Est. Hours", "Est. Amount", "Submitted"]}>
            {pendingWork.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link className="link link-hover" href="/additional-work">
                    {w.title}
                  </Link>
                </td>
                <td>{(w.customers as { name?: string } | null)?.name ?? "—"}</td>
                <td>{w.estimated_hours != null ? <Hours value={Number(w.estimated_hours)} /> : "—"}</td>
                <td>{w.estimated_amount != null ? <Money value={Number(w.estimated_amount)} /> : "—"}</td>
                <td>
                  <DateText value={w.created_at} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Pending time approvals</h2>
          {pendingTime.length === 0 ? (
            <EmptyState title="No pending time entries" />
          ) : (
            <DataTable headers={["Date", "Technician", "Customer", "Hours"]}>
              {pendingTime.map((e) => (
                <tr key={e.id}>
                  <td>
                    <DateText value={e.work_date} />
                  </td>
                  <td>{techName.get(e.technician_id) ?? "—"}</td>
                  <td>{(e.customers as { name?: string } | null)?.name ?? "—"}</td>
                  <td>
                    <Hours value={Number(e.hours_worked)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Pending cost approvals</h2>
          {pendingCosts.length === 0 ? (
            <EmptyState title="No pending direct costs" />
          ) : (
            <DataTable headers={["Date", "Customer", "Category", "Billable"]}>
              {pendingCosts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <DateText value={c.cost_date} />
                  </td>
                  <td>{(c.customers as { name?: string } | null)?.name ?? "—"}</td>
                  <td>
                    <StatusBadge status={c.cost_category} />
                  </td>
                  <td>
                    <Money value={Number(c.billable_amount)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Overdue / past-due invoices</h2>
        {overdueInvoices.length === 0 ? (
          <EmptyState title="No overdue invoices" />
        ) : (
          <DataTable headers={["Invoice", "Customer", "Due", "Status", "Balance"]}>
            {overdueInvoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  <Link className="link link-hover" href={`/invoices/${inv.id}`}>
                    {inv.invoice_number}
                  </Link>
                </td>
                <td>{(inv.customers as { name?: string } | null)?.name ?? "—"}</td>
                <td>
                  <DateText value={inv.due_date} />
                </td>
                <td>
                  <StatusBadge status={inv.status} />
                </td>
                <td>
                  <Money value={Number(inv.remaining_balance)} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Open disputes</h2>
          {disputes.length === 0 ? (
            <EmptyState title="No open disputes" />
          ) : (
            <DataTable headers={["Customer", "Reason", "Amount", "Status"]}>
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td>{(d.customers as { name?: string } | null)?.name ?? "—"}</td>
                  <td className="max-w-xs truncate">{d.dispute_reason}</td>
                  <td>
                    <Money value={Number(d.disputed_amount)} />
                  </td>
                  <td>
                    <StatusBadge status={d.resolution_status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Inactive user accounts</h2>
          {inactiveUsers.length === 0 ? (
            <EmptyState title="No inactive users" />
          ) : (
            <DataTable headers={["Name", "Email", "Role"]}>
              {inactiveUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}</td>
                  <td>
                    <StatusBadge status={u.role} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </section>
    </div>
  );
}
