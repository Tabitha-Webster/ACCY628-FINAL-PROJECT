import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, EmptyState, ErrorState } from "@/components/ui";

const ADMIN_LINKS = [
  {
    href: "/admin/alerts",
    title: "Admin Alerts",
    description: "Top risks with counts and one-click fix paths.",
  },
  {
    href: "/admin/approvals",
    title: "Approvals Inbox",
    description: "Approve or reject additional work, time, and costs in one queue.",
  },
  {
    href: "/admin/renewals",
    title: "Contract Renewals",
    description: "Ending soon, past end date, on hold, and missing billing terms.",
  },
  {
    href: "/admin/billing-center",
    title: "Billing Control Center",
    description: "Ready-to-bill, overdue AR, disputes, drafts, and monthly fees.",
  },
  {
    href: "/admin/search",
    title: "Global Admin Search",
    description: "Find users, customers, tickets, contracts, and invoices.",
  },
  {
    href: "/admin/assignments-board",
    title: "Assignment Board",
    description: "Quick-assign unassigned tickets and rebalance open work.",
  },
  {
    href: "/admin/employees",
    title: "Employees",
    description: "Company employee directory with names and job titles.",
  },
  {
    href: "/admin/users",
    title: "User & Role Management",
    description: "Roles, activate/deactivate, bulk actions, customer links, cost rates.",
  },
  {
    href: "/admin/exports",
    title: "CSV Exports",
    description: "Download users, exceptions, workload, contracts, and overdue AR.",
  },
  {
    href: "/admin/system",
    title: "System Health",
    description: "Company-wide pulse: customers, tickets, approvals, AR, disputes.",
  },
  {
    href: "/admin/exceptions",
    title: "Exceptions Queue",
    description: "SLA issues, unassigned work, pending approvals, overdue invoices.",
  },
  {
    href: "/admin/workload",
    title: "Technician Workload",
    description: "Open tickets, assignments, and monthly hours by technician.",
  },
  {
    href: "/admin/data-quality",
    title: "Data Quality",
    description: "Missing contracts, contacts, assignments, and customer-user links.",
  },
  {
    href: "/admin/access-review",
    title: "Security & Access Review",
    description: "Which roles can see financial and customer data.",
  },
  {
    href: "/admin/audit",
    title: "Audit Logs",
    description: "System activity records when audit_logs is populated.",
  },
  {
    href: "/admin/hr",
    title: "HR Directory",
    description: "Departments, positions, and contractors.",
  },
  {
    href: "/admin/demo",
    title: "Demo Settings",
    description: "Class demo accounts and role-switcher guidance.",
  },
  {
    href: "/controls",
    title: "Controls & Exceptions Guide",
    description: "Business risks and the controls designed to reduce them.",
  },
];

const CROSS_ROLE_LINKS = [
  { href: "/dashboard", title: "Executive Dashboard", group: "Manager / Ops" },
  { href: "/operations", title: "Service Operations", group: "Manager / Ops" },
  { href: "/profitability", title: "Profitability", group: "Manager / Ops" },
  { href: "/customers", title: "Customers", group: "Manager / Ops" },
  { href: "/contracts", title: "Contracts", group: "Manager / Ops" },
  { href: "/ready-to-bill", title: "Ready to Bill", group: "Billing" },
  { href: "/invoices", title: "Invoices", group: "Billing" },
  { href: "/payments", title: "Payments", group: "Billing" },
  { href: "/accounts-receivable", title: "Accounts Receivable", group: "Billing" },
  { href: "/accounting", title: "Accounting Review", group: "Billing" },
  { href: "/billing-collections", title: "Billing and Collections", group: "Billing" },
  { href: "/tickets", title: "Support Tickets", group: "Operations" },
  { href: "/assignments", title: "Technician Assignments", group: "Operations" },
  { href: "/additional-work", title: "Additional Work Requests", group: "Operations" },
  { href: "/time-costs", title: "Time and Costs", group: "Operations" },
  { href: "/projects", title: "Projects", group: "Operations" },
];

export default async function AdminConsolePage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const [
    usersRes,
    ticketsRes,
    pendingWorkRes,
    pendingTimeRes,
    overdueInvRes,
    customersRes,
    unassignedRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, is_active, is_demo_user"),
    supabase.from("support_tickets").select("id").in("status", OPEN_TICKET_STATUSES),
    supabase.from("additional_work_requests").select("id").eq("approval_status", "pending"),
    supabase.from("time_entries").select("id").eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("id")
      .or(`status.eq.overdue,and(due_date.lt.${new Date().toISOString().slice(0, 10)},remaining_balance.gt.0)`),
    supabase.from("customers").select("id").eq("status", "active"),
    supabase
      .from("support_tickets")
      .select("id")
      .in("status", OPEN_TICKET_STATUSES)
      .is("assigned_technician_id", null),
  ]);

  const error =
    usersRes.error ||
    ticketsRes.error ||
    pendingWorkRes.error ||
    pendingTimeRes.error ||
    overdueInvRes.error ||
    customersRes.error ||
    unassignedRes.error;

  if (error) {
    return (
      <div>
        <PageHeader title="Admin Console" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = usersRes.data ?? [];
  const limitedVisibility = rows.length <= 1;
  const byRole = rows.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  const inactive = rows.filter((u) => !u.is_active).length;
  const demoUsers = rows.filter((u) => u.is_demo_user).length;
  const pendingApprovals = (pendingWorkRes.data?.length ?? 0) + (pendingTimeRes.data?.length ?? 0);
  const openTickets = ticketsRes.data?.length ?? 0;
  const overdueInvoices = overdueInvRes.data?.length ?? 0;
  const unassigned = unassignedRes.data?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Admin Console"
        description={`Welcome, ${profile.full_name}. Manage access, clear approvals, assign work, and monitor renewals and billing.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/search" className="btn btn-sm btn-primary">
              Search
            </Link>
            <Link href="/admin/alerts" className="btn btn-sm btn-outline">
              Alerts
            </Link>
          </div>
        }
      />

      {limitedVisibility ? (
        <div className="alert alert-warning mb-6 text-sm">
          <span>
            You can currently see only your own profile. Run{" "}
            <code className="text-xs">scripts/admin-access-policies.sql</code> in Supabase so Admin can
            manage all users.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={String(rows.length)} hint={`${inactive} inactive · ${demoUsers} demo`} />
        <StatCard
          label="Roles Present"
          value={String(Object.keys(byRole).length)}
          hint={Object.entries(byRole)
            .map(([role, count]) => `${role}: ${count}`)
            .join(" · ")}
        />
        <StatCard label="Active Customers" value={String(customersRes.data?.length ?? 0)} />
        <StatCard label="Open Tickets" value={String(openTickets)} hint={`${unassigned} unassigned`} />
        <StatCard
          label="Pending Approvals"
          value={String(pendingApprovals)}
          tone={pendingApprovals > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Overdue Invoices"
          value={String(overdueInvoices)}
          tone={overdueInvoices > 0 ? "error" : "success"}
        />
        <StatCard label="Admin Tools" value={String(ADMIN_LINKS.length)} hint="Approvals, renewals, billing, exports" />
        <StatCard label="Cross-role Links" value={String(CROSS_ROLE_LINKS.length)} hint="Manager + billing + ops" />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Admin tools</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-box border border-base-300 bg-base-100 p-4 transition hover:border-primary/40 hover:bg-base-200/40"
            >
              <p className="font-semibold">{link.title}</p>
              <p className="mt-1 text-sm opacity-70">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
          Cross-role visibility
        </h2>
        <p className="mb-3 text-sm opacity-70">
          Jump into manager, billing, and operations screens without switching accounts.
        </p>
        {CROSS_ROLE_LINKS.length === 0 ? (
          <EmptyState title="No quick links" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {CROSS_ROLE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-box border border-base-300 bg-base-100 p-4 transition hover:border-primary/40 hover:bg-base-200/40"
              >
                <p className="text-xs uppercase tracking-wide opacity-50">{link.group}</p>
                <p className="mt-1 font-semibold">{link.title}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
