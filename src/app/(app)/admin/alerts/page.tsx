import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";
import { slaStatus } from "@/lib/calculations";

type AlertItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  count: number;
  href: string;
  action: string;
};

export default async function AdminAlertsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const ninety = 90 * 24 * 60 * 60 * 1000;

  const [
    ticketsRes,
    unassignedRes,
    pendingWorkRes,
    pendingTimeRes,
    pendingCostRes,
    overdueRes,
    disputesRes,
    inactiveUsersRes,
    contractsRes,
    customersNoContractRes,
  ] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id, target_resolution_at, completed_at")
      .in("status", OPEN_TICKET_STATUSES),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", OPEN_TICKET_STATUSES)
      .is("assigned_technician_id", null),
    supabase
      .from("additional_work_requests")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending"),
    supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending"),
    supabase
      .from("direct_costs")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .or(`status.eq.overdue,and(due_date.lt.${today},remaining_balance.gt.0)`),
    supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("resolution_status", ["open", "under_review"]),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", false),
    supabase.from("contracts").select("id, status, end_date").in("status", ["active", "on_hold"]),
    supabase.from("customers").select("id, status"),
  ]);

  const error =
    ticketsRes.error ||
    unassignedRes.error ||
    pendingWorkRes.error ||
    pendingTimeRes.error ||
    pendingCostRes.error ||
    overdueRes.error ||
    disputesRes.error ||
    inactiveUsersRes.error ||
    contractsRes.error ||
    customersNoContractRes.error;

  if (error) {
    return (
      <div>
        <PageHeader title="Admin Alerts" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const slaIssues = (ticketsRes.data ?? []).filter((t) => {
    const s = slaStatus(t.target_resolution_at, t.completed_at);
    return s === "at_risk" || s === "missed";
  }).length;

  const renewals = (contractsRes.data ?? []).filter((c) => {
    if (!c.end_date) return false;
    const end = new Date(c.end_date).getTime();
    return !Number.isNaN(end) && ((end < now && c.status === "active") || (end >= now && end - now <= ninety));
  }).length;

  const contractCustomerIds = new Set(
    (
      await supabase.from("contracts").select("customer_id")
    ).data?.map((c) => c.customer_id) ?? []
  );
  const customersMissingContract = (customersNoContractRes.data ?? []).filter(
    (c) => c.status === "active" && !contractCustomerIds.has(c.id)
  ).length;

  const pendingApprovals =
    (pendingWorkRes.count ?? 0) + (pendingTimeRes.count ?? 0) + (pendingCostRes.count ?? 0);

  const alerts: AlertItem[] = (
    [
      {
        id: "sla",
        severity: (slaIssues > 0 ? "critical" : "info") as AlertItem["severity"],
        title: "SLA at risk or missed",
        detail: "Open tickets past or near resolution targets.",
        count: slaIssues,
        href: "/admin/exceptions",
        action: "Review exceptions",
      },
      {
        id: "unassigned",
        severity: ((unassignedRes.count ?? 0) > 0 ? "warning" : "info") as AlertItem["severity"],
        title: "Unassigned open tickets",
        detail: "Work sitting without a technician.",
        count: unassignedRes.count ?? 0,
        href: "/admin/assignments-board",
        action: "Open assignment board",
      },
      {
        id: "approvals",
        severity: (pendingApprovals > 0 ? "warning" : "info") as AlertItem["severity"],
        title: "Pending approvals",
        detail: "Additional work, time, and costs waiting on a decision.",
        count: pendingApprovals,
        href: "/admin/approvals",
        action: "Clear inbox",
      },
      {
        id: "overdue",
        severity: ((overdueRes.count ?? 0) > 0 ? "critical" : "info") as AlertItem["severity"],
        title: "Overdue invoices",
        detail: "AR past due date with remaining balance.",
        count: overdueRes.count ?? 0,
        href: "/admin/billing-center",
        action: "Billing control center",
      },
      {
        id: "disputes",
        severity: ((disputesRes.count ?? 0) > 0 ? "warning" : "info") as AlertItem["severity"],
        title: "Open billing disputes",
        detail: "Customer disputes still open or under review.",
        count: disputesRes.count ?? 0,
        href: "/admin/billing-center",
        action: "Review disputes",
      },
      {
        id: "renewals",
        severity: (renewals > 0 ? "warning" : "info") as AlertItem["severity"],
        title: "Contract renewals / expirations",
        detail: "Ending within 90 days or past end while still open.",
        count: renewals,
        href: "/admin/renewals",
        action: "Renewals desk",
      },
      {
        id: "inactive",
        severity: "info" as const,
        title: "Inactive user accounts",
        detail: "Profiles deactivated — confirm intentional.",
        count: inactiveUsersRes.count ?? 0,
        href: "/admin/users",
        action: "User access",
      },
      {
        id: "dq",
        severity: (customersMissingContract > 0 ? "warning" : "info") as AlertItem["severity"],
        title: "Active customers without contracts",
        detail: "Data quality gap that can block billing and SLA.",
        count: customersMissingContract,
        href: "/admin/data-quality",
        action: "Data quality",
      },
    ] satisfies AlertItem[]
  ).sort((a, b) => {
    const rank: Record<AlertItem["severity"], number> = { critical: 0, warning: 1, info: 2 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.count - a.count;
  });

  const critical = alerts.filter((a) => a.severity === "critical" && a.count > 0).length;
  const warnings = alerts.filter((a) => a.severity === "warning" && a.count > 0).length;
  const actionable = alerts.filter((a) => a.count > 0).length;

  return (
    <div>
      <PageHeader
        title="Admin Alerts"
        description="Top operational risks with one-click paths to fix them."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Critical alerts" value={String(critical)} tone={critical ? "error" : "success"} />
        <StatCard label="Warnings" value={String(warnings)} tone={warnings ? "warning" : "success"} />
        <StatCard label="Actionable items" value={String(actionable)} />
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const border =
            alert.count === 0
              ? "border-base-300"
              : alert.severity === "critical"
                ? "border-error/50"
                : alert.severity === "warning"
                  ? "border-warning/50"
                  : "border-base-300";
          return (
            <div
              key={alert.id}
              className={`flex flex-col gap-3 rounded-box border ${border} bg-base-100 p-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`badge badge-sm ${
                      alert.count === 0
                        ? "badge-ghost"
                        : alert.severity === "critical"
                          ? "badge-error"
                          : alert.severity === "warning"
                            ? "badge-warning"
                            : "badge-info"
                    }`}
                  >
                    {alert.count === 0 ? "clear" : alert.severity}
                  </span>
                  <p className="font-semibold">{alert.title}</p>
                  <span className="text-lg font-semibold tabular-nums">{alert.count}</span>
                </div>
                <p className="mt-1 text-sm opacity-70">{alert.detail}</p>
              </div>
              <Link
                href={alert.href}
                className={`btn btn-sm ${alert.count > 0 ? "btn-primary" : "btn-ghost"}`}
              >
                {alert.action}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
