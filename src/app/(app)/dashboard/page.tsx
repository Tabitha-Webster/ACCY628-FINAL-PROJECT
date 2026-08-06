import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { type Profile } from "@/lib/constants";
import {
  PageHeader,
  StatCard,
  EmptyState,
  DataTable,
  StatusBadge,
  Money,
  Hours,
  DateText,
} from "@/components/ui";
import { ManagerCharts, type MonthlyFinancials, type TicketsByStatus } from "@/components/ManagerCharts";
import { ContractMetricsWidgets } from "@/components/ContractMetricsWidgets";
import {
  TechnicianWorkspaceClient,
  type WorkspaceTicket,
  type WorkspaceTimeEntry,
  type WorkspaceAdditionalWork,
  type ContractHourWarning,
} from "@/components/TechnicianWorkspaceClient";
import { AR_AGING_BUCKETS, arAgingBucket, usagePercentage, usageStatus, hoursRemaining } from "@/lib/calculations";
import {
  evaluateTicketSla,
  localDateKey,
  localDateKeyFromIso,
} from "@/lib/sla";
import { formatCurrency } from "@/lib/format";
import { fetchContractReportMetrics } from "@/lib/contracts";
import { round2, withDerivedInvoiceStatus } from "@/lib/billing";
import { loadBillingReviewData } from "@/lib/billing-review-data";
import {
  dateInDashboardPeriod,
  monthKeyInDashboardPeriod,
  periodOverlapsToday,
  periodViewControlProps,
  resolveDashboardPeriod,
} from "@/lib/dashboard-period";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { ExplainNumber } from "@/components/ExplainNumber";
import { DashboardCollapse, DashboardMetricAccordion, DashboardSection } from "@/components/DashboardAccordion";
import type {
  AdditionalWorkRequest,
  Contract,
  DirectCost,
  Dispute,
  Payment,
  Project,
  RevenueRecord,
  SupportTicket,
  TimeEntry,
} from "@/lib/types";

const OPEN_TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_approval",
];

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7); // yyyy-MM
}

function monthLabel(dateStr: string) {
  const d = new Date(`${dateStr}-01T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
}

function lastNMonthKeys(n: number) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function ticketSlaSeverity(t: {
  submitted_at?: string | null;
  target_response_at: string | null;
  target_resolution_at: string | null;
  actual_response_at: string | null;
  completed_at: string | null;
  status?: string | null;
  priority?: string | null;
}) {
  const sla = evaluateTicketSla(t);
  if (sla.overdue || sla.overall === "missed") return "missed";
  if (sla.overall === "at_risk") return "at_risk";
  return "on_track";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (profile.role === "admin") redirect("/admin");
  if (profile.role === "manager") return <ManagerDashboard profile={profile} />;
  if (profile.role === "technician") return <TechnicianDashboard profile={profile} />;
  if (profile.role === "billing") {
    const params = await searchParams;
    return <BillingDashboard profile={profile} searchParams={params} />;
  }
  if (profile.role === "hr") return <HrDashboard profile={profile} />;
  if (profile.role === "customer") return <CustomerDashboard profile={profile} />;
  redirect("/login");
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

async function HrDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const [{ data: contractors }, { data: positions }] = await Promise.all([
    supabase.from("hr_contractors").select("id, status"),
    supabase.from("hr_positions").select("id, status"),
  ]);

  const activeCount = (contractors ?? []).filter((c) => c.status === "active").length;
  const openCount = (positions ?? []).filter((p) => p.status === "open").length;
  const filledCount = (positions ?? []).filter((p) => p.status === "filled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Home"
        description={`Welcome, ${profile.full_name}. Manage contractor roles and workforce analytics.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active contractors" value={String(activeCount)} />
        <StatCard
          label="Open positions"
          value={String(openCount)}
          tone={openCount > 0 ? "warning" : "default"}
        />
        <StatCard label="Filled positions" value={String(filledCount)} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/hr-analytics" className="btn btn-primary">
          HR Analytics
        </Link>
        <Link href="/hr-positions" className="btn btn-outline">
          Positions
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

async function ManagerDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const monthKeys = lastNMonthKeys(6);
  const rangeStart = `${monthKeys[0]}-01`;

  const [
    customersCountRes,
    contractsCountRes,
    openTicketsRes,
    additionalWorkRes,
    timeEntriesRes,
    directCostsRes,
    invoicesRes,
    revenueRes,
    activeContractsRes,
    customersRes,
    contractReportRes,
    proposedProjectsRes,
    awaitingCustomerRes,
    pendingMilestonesRes,
  ] = await Promise.all([
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, customer_id, title, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at"
      )
      .in("status", OPEN_TICKET_STATUSES),
    supabase
      .from("additional_work_requests")
      .select("id, customer_id, title, estimated_hours, estimated_amount, created_at, project_id")
      .eq("approval_status", "pending"),
    supabase
      .from("time_entries")
      .select("contract_id, customer_id, hours_worked, labor_cost, classification, work_date")
      .gte("work_date", rangeStart),
    supabase.from("direct_costs").select("internal_cost, cost_date").gte("cost_date", rangeStart),
    supabase
      .from("invoices")
      .select("id, customer_id, invoice_number, status, remaining_balance, due_date, amount_paid, dispute_status"),
    supabase.from("revenue_records").select("period_month, recognition, amount").gte("period_month", rangeStart),
    supabase
      .from("contracts")
      .select("id, name, contract_number, customer_id, included_hours_per_month")
      .eq("status", "active"),
    supabase.from("customers").select("id, name, status"),
    fetchContractReportMetrics(supabase),
    supabase
      .from("projects")
      .select("id, name, customer_id, status, customer_approval_status")
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(8),
    // Waiting on customer only - exclude "proposed" so the same project is not also in proposedProjects.
    supabase
      .from("projects")
      .select("id, name, customer_id, status, customer_approval_status")
      .eq("status", "awaiting_customer_approval")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("project_milestones")
      .select("id, name, project_id, approval_status, projects(id, name, customer_id)")
      .eq("approval_status", "pending")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const contractMetrics = contractReportRes.metrics;
  const tickets = (openTicketsRes.data ?? []) as SupportTicket[];
  const additionalWork = (additionalWorkRes.data ?? []) as Pick<
    AdditionalWorkRequest,
    "id" | "customer_id" | "title" | "estimated_hours" | "estimated_amount" | "created_at" | "project_id"
  >[];
  const proposedProjects = (proposedProjectsRes.data ?? []) as Pick<
    Project,
    "id" | "name" | "customer_id" | "status" | "customer_approval_status"
  >[];
  const proposedProjectIds = new Set(proposedProjects.map((p) => p.id));
  const awaitingCustomerProjects = (
    (awaitingCustomerRes.data ?? []) as Pick<
      Project,
      "id" | "name" | "customer_id" | "status" | "customer_approval_status"
    >[]
  ).filter((p) => !proposedProjectIds.has(p.id));
  const projectsNeedingCustomerAction = [...proposedProjects, ...awaitingCustomerProjects];
  const pendingMilestones = (pendingMilestonesRes.data ?? []) as Array<{
    id: string;
    name: string;
    project_id: string;
    approval_status: string | null;
    projects: { id: string; name: string; customer_id: string } | { id: string; name: string; customer_id: string }[] | null;
  }>;
  const pendingApprovalsTotal =
    additionalWork.length + projectsNeedingCustomerAction.length + pendingMilestones.length;
  const timeEntries = (timeEntriesRes.data ?? []) as Pick<
    TimeEntry,
    "contract_id" | "customer_id" | "hours_worked" | "labor_cost" | "classification" | "work_date"
  >[];
  const directCosts = (directCostsRes.data ?? []) as Pick<DirectCost, "internal_cost" | "cost_date">[];
  const invoices = (invoicesRes.data ?? []).map((invoice) => withDerivedInvoiceStatus(invoice));
  const revenue = (revenueRes.data ?? []) as Pick<RevenueRecord, "period_month" | "recognition" | "amount">[];
  const activeContracts = (activeContractsRes.data ?? []) as Pick<
    Contract,
    "id" | "name" | "contract_number" | "customer_id" | "included_hours_per_month"
  >[];

  const slaAtRisk = tickets.filter((t) => ticketSlaSeverity(t) === "at_risk");
  const slaMissed = tickets.filter((t) => ticketSlaSeverity(t) === "missed");
  const criticalTickets = tickets.filter((t) => t.priority === "critical");
  const ticketsNeedingAttention = Array.from(
    new Map(
      [...slaMissed, ...slaAtRisk, ...criticalTickets].map((t) => [t.id, t] as const)
    ).values()
  );

  const includedHoursByContract = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.contract_id || entry.classification !== "included") continue;
    if (monthKey(entry.work_date) !== monthKeys[monthKeys.length - 1]) continue;
    includedHoursByContract.set(
      entry.contract_id,
      (includedHoursByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked)
    );
  }
  const contractsWithUsage = activeContracts.map((c) => {
    const used = includedHoursByContract.get(c.id) ?? 0;
    const pct = usagePercentage(used, c.included_hours_per_month);
    return { ...c, used, pct, status: usageStatus(pct) };
  });
  const contractsOverHours = contractsWithUsage.filter((c) => c.status === "over_limit");

  const currentMonthKey = monthKeys[monthKeys.length - 1];
  const revenueThisMonth = revenue
    .filter((r) => r.recognition === "earned" && monthKey(r.period_month) === currentMonthKey)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const laborCostThisMonth = timeEntries
    .filter((t) => monthKey(t.work_date) === currentMonthKey)
    .reduce((sum, t) => sum + Number(t.labor_cost ?? 0), 0);
  const directCostThisMonth = directCosts
    .filter((c) => monthKey(c.cost_date) === currentMonthKey)
    .reduce((sum, c) => sum + Number(c.internal_cost), 0);
  const costThisMonth = laborCostThisMonth + directCostThisMonth;
  const profitThisMonth = revenueThisMonth - costThisMonth;

  const monthlyFinancials: MonthlyFinancials[] = monthKeys.map((key) => {
    const rev = revenue
      .filter((r) => r.recognition === "earned" && monthKey(r.period_month) === key)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const labor = timeEntries
      .filter((t) => monthKey(t.work_date) === key)
      .reduce((sum, t) => sum + Number(t.labor_cost ?? 0), 0);
    const direct = directCosts
      .filter((c) => monthKey(c.cost_date) === key)
      .reduce((sum, c) => sum + Number(c.internal_cost), 0);
    const cost = labor + direct;
    return { month: monthLabel(key), revenue: rev, cost, profit: rev - cost };
  });

  const ticketsByStatus: TicketsByStatus[] = OPEN_TICKET_STATUSES.map((status) => ({
    status: status.replace(/_/g, " "),
    count: tickets.filter((t) => t.status === status).length,
  })).filter((row) => row.count > 0);

  const ar = invoices
    .filter((i) => !["draft", "canceled", "paid"].includes(i.status) && Number(i.remaining_balance) > 0)
    .reduce((sum, i) => sum + Number(i.remaining_balance), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = invoices
    .filter(
      (i) =>
        !["draft", "canceled", "paid"].includes(i.status) &&
        Number(i.remaining_balance) > 0 &&
        i.due_date < todayStr
    )
    .reduce((sum, i) => sum + Number(i.remaining_balance), 0);
  const deferred = revenue.filter((r) => r.recognition === "deferred").reduce((sum, r) => sum + Number(r.amount), 0);
  const unbilled = revenue.filter((r) => r.recognition === "unbilled").reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        description={`Welcome back, ${profile.full_name}. Here's how ServiceSync is performing.`}
      />

      <div className="mb-6">
        <ContractMetricsWidgets
          metrics={contractMetrics}
          showTables={false}
          title="Contracts portfolio"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Customers"
          value={String(customersCountRes.count ?? 0)}
          explanation={{
            title: "Active Customers",
            result: String(customersCountRes.count ?? 0),
            formula: "Count of customers where status = active",
            lines: (customersRes.data ?? [])
              .filter((customer) => customer.status === "active" && customer.name)
              .map((customer) => ({ label: customer.name as string, value: "Active" })),
          }}
        />
        <StatCard
          label="Active Contracts"
          value={String(contractsCountRes.count ?? 0)}
          explanation={{
            title: "Active Contracts",
            result: String(contractsCountRes.count ?? 0),
            formula: "Count of contracts where status = active",
            lines: activeContracts.map((contract) => ({
              label: contract.name,
              value: contract.contract_number,
              detail: customerName.get(contract.customer_id) ?? "Unknown customer",
            })),
          }}
        />
        <StatCard
          label="Open Tickets"
          value={String(tickets.length)}
          explanation={{
            title: "Open Tickets",
            result: String(tickets.length),
            formula: "Count of support tickets in new, assigned, in progress, waiting on customer, or waiting on approval",
            lines: tickets.slice(0, 20).map((ticket) => ({
              label: ticket.ticket_number,
              value: ticket.status.replace(/_/g, " "),
              detail: ticket.title,
            })),
          }}
        />
        <StatCard
          label="SLA At Risk / Missed"
          value={`${slaAtRisk.length} / ${slaMissed.length}`}
          tone={slaMissed.length > 0 ? "error" : slaAtRisk.length > 0 ? "warning" : "success"}
          explanation={{
            title: "SLA At Risk / Missed",
            result: `${slaAtRisk.length} / ${slaMissed.length}`,
            formula: "At-risk tickets + missed tickets among currently open tickets",
            description: "At risk means a response or resolution deadline is close. Missed means a deadline has already passed.",
            lines: [
              ...slaMissed.map((ticket) => ({ label: ticket.ticket_number, value: "Missed", detail: ticket.title })),
              ...slaAtRisk.map((ticket) => ({ label: ticket.ticket_number, value: "At risk", detail: ticket.title })),
            ],
          }}
        />
        <StatCard
          label="Critical Open Tickets"
          value={String(criticalTickets.length)}
          tone={criticalTickets.length > 0 ? "error" : "success"}
        />
        <StatCard
          label="Contracts Over Included Hours"
          value={String(contractsOverHours.length)}
          tone={contractsOverHours.length > 0 ? "warning" : "success"}
          explanation={{
            title: "Contracts Over Included Hours",
            result: String(contractsOverHours.length),
            formula: "Count of active contracts where included hours used this month > included hours per month",
            lines: contractsOverHours.map((contract) => ({
              label: contract.name,
              value: `${contract.used.toFixed(1)} / ${Number(contract.included_hours_per_month).toFixed(1)} hrs`,
              detail: `${contract.pct.toFixed(0)}% of included hours`,
            })),
          }}
        />
        <StatCard
          label="Pending Approvals"
          value={String(pendingApprovalsTotal)}
          tone={pendingApprovalsTotal > 0 ? "warning" : "default"}
          hint="Projects, change requests, milestones"
          explanation={{
            title: "Pending Approvals",
            result: String(pendingApprovalsTotal),
            formula: "Pending additional work + proposed projects + awaiting customer approval + pending milestones",
            lines: [
              ...additionalWork.map((request) => ({
                label: request.title,
                value: formatCurrency(Number(request.estimated_amount ?? 0)),
                detail: customerName.get(request.customer_id) ?? "Unknown customer",
              })),
              ...proposedProjects.map((project) => ({
                label: project.name,
                value: "Proposed",
                detail: customerName.get(project.customer_id) ?? "Unknown customer",
              })),
              ...awaitingCustomerProjects.map((project) => ({
                label: project.name,
                value: "Awaiting customer",
                detail: customerName.get(project.customer_id) ?? "Unknown customer",
              })),
              ...pendingMilestones.map((milestone) => ({
                label: milestone.name,
                value: "Milestone",
                detail: "Pending approval",
              })),
            ],
          }}
        />
        <StatCard
          label="Monthly Revenue"
          value={formatCurrency(revenueThisMonth)}
          hint="Earned this month"
          explanation={{
            title: "Monthly Revenue",
            result: formatCurrency(revenueThisMonth),
            formula: `Sum of revenue_records.amount where recognition = earned and period is ${monthLabel(currentMonthKey)}`,
            lines: revenue
              .filter((row) => row.recognition === "earned" && monthKey(row.period_month) === currentMonthKey)
              .map((row) => ({
                label: row.period_month,
                value: formatCurrency(Number(row.amount)),
                detail: "Earned revenue",
              })),
          }}
        />
        <StatCard
          label="Monthly Profit"
          value={formatCurrency(profitThisMonth)}
          tone={profitThisMonth >= 0 ? "success" : "error"}
          hint={`Cost: ${formatCurrency(costThisMonth)}`}
          explanation={{
            title: "Monthly Profit",
            result: formatCurrency(profitThisMonth),
            formula: "Earned revenue this month -> (labor cost this month + direct cost this month)",
            lines: [
              { label: "Earned revenue", value: formatCurrency(revenueThisMonth) },
              { label: "Labor cost", value: formatCurrency(laborCostThisMonth), detail: "Internal labor cost on time entries this month" },
              { label: "Direct cost", value: formatCurrency(directCostThisMonth), detail: "Internal cost on direct cost entries this month" },
              { label: "Total cost", value: formatCurrency(costThisMonth) },
              { label: "Profit", value: formatCurrency(profitThisMonth), detail: "Revenue minus total cost" },
            ],
          }}
        />
      </div>

      {criticalTickets.length > 0 ? (
        <div className="alert alert-error mt-4 text-sm" role="alert">
          <div>
            <p className="font-semibold">
              {criticalTickets.length} critical ticket{criticalTickets.length === 1 ? "" : "s"} need immediate attention
            </p>
            <p className="mt-1 opacity-90">
              {criticalTickets
                .slice(0, 4)
                .map((t) => t.ticket_number)
                .join(", ")}
              {criticalTickets.length > 4 ? ` +${criticalTickets.length - 4} more` : ""}. Open them from Tickets or the
              list below.
            </p>
          </div>
          <Link href="/tickets?priority=critical" className="btn btn-sm">
            View critical tickets
          </Link>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Accounts Receivable"
          value={formatCurrency(ar)}
          explanation={{
            title: "Accounts Receivable",
            result: formatCurrency(ar),
            formula: "Sum of remaining_balance on invoices that are not draft, canceled, or paid and still have a balance",
            lines: invoices
              .filter((invoice) => !["draft", "canceled", "paid"].includes(invoice.status) && Number(invoice.remaining_balance) > 0)
              .map((invoice) => ({
                label: invoice.invoice_number,
                value: formatCurrency(Number(invoice.remaining_balance)),
                detail: customerName.get(invoice.customer_id) ?? "Unknown customer",
              })),
          }}
        />
        <StatCard
          label="Overdue Balance"
          value={formatCurrency(overdue)}
          tone={overdue > 0 ? "error" : "success"}
          explanation={{
            title: "Overdue Balance",
            result: formatCurrency(overdue),
            formula: "Sum of remaining_balance on open invoices with due date before today",
            lines: invoices
              .filter(
                (invoice) =>
                  !["draft", "canceled", "paid"].includes(invoice.status) &&
                  Number(invoice.remaining_balance) > 0 &&
                  invoice.due_date < todayStr
              )
              .map((invoice) => ({
                label: invoice.invoice_number,
                value: formatCurrency(Number(invoice.remaining_balance)),
                detail: `${customerName.get(invoice.customer_id) ?? "Unknown customer"} | due ${invoice.due_date}`,
              })),
          }}
        />
        <StatCard
          label="Deferred Revenue"
          value={formatCurrency(deferred)}
          explanation={{
            title: "Deferred Revenue",
            result: formatCurrency(deferred),
            formula: "Sum of revenue_records.amount where recognition = deferred",
            lines: revenue
              .filter((row) => row.recognition === "deferred")
              .map((row) => ({ label: row.period_month, value: formatCurrency(Number(row.amount)) })),
          }}
        />
        <StatCard
          label="Unbilled Revenue"
          value={formatCurrency(unbilled)}
          explanation={{
            title: "Unbilled Revenue",
            result: formatCurrency(unbilled),
            formula: "Sum of revenue_records.amount where recognition = unbilled",
            lines: revenue
              .filter((row) => row.recognition === "unbilled")
              .map((row) => ({ label: row.period_month, value: formatCurrency(Number(row.amount)) })),
          }}
        />
      </div>

      <div className="mt-6">
        <ManagerCharts monthlyFinancials={monthlyFinancials} ticketsByStatus={ticketsByStatus} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Tickets Needing Attention</h2>
          {ticketsNeedingAttention.length === 0 ? (
            <EmptyState title="No urgent tickets" description="No critical, at-risk, or missed-SLA tickets right now." />
          ) : (
            <DataTable headers={["Ticket", "Customer", "Priority", "SLA"]}>
              {ticketsNeedingAttention.slice(0, 8).map((t) => (
                <tr key={t.id} className={t.priority === "critical" ? "bg-error/5" : undefined}>
                  <td>
                    <Link className="link link-hover" href={`/tickets/${t.id}`}>
                      {t.ticket_number}
                    </Link>
                  </td>
                  <td>{customerName.get(t.customer_id) ?? "-"}</td>
                  <td>
                    {t.priority === "critical" ? (
                      <span className="inline-flex items-center gap-1 rounded-box border border-error/40 bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                        Critical
                      </span>
                    ) : (
                      <StatusBadge status={t.priority} />
                    )}
                  </td>
                  <td>
                    <StatusBadge status={ticketSlaSeverity(t)} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Contracts Over Included Hours</h2>
          {contractsOverHours.length === 0 ? (
            <EmptyState title="All contracts within limits" description="No active contract has exceeded its included hours this month." />
          ) : (
            <DataTable headers={["Contract", "Customer", "Used / Included", "Usage"]}>
              {contractsOverHours.map((c) => (
                <tr key={c.id}>
                  <td>{c.contract_number}</td>
                  <td>{customerName.get(c.customer_id) ?? "-"}</td>
                  <td>
                    <Hours value={c.used} /> / <Hours value={c.included_hours_per_month} />
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Pending Approvals</h2>
            <p className="text-xs opacity-70">
              {pendingApprovalsTotal} item{pendingApprovalsTotal === 1 ? "" : "s"} waiting - manage actions on Projects
            </p>
          </div>
          <Link href="/projects" className="btn btn-outline btn-sm">
            Open approval queue
          </Link>
        </div>

        {pendingApprovalsTotal === 0 ? (
          <EmptyState title="Nothing to review" description="No projects, change requests, or milestones are waiting on approval." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Change requests / additional work</h3>
              {additionalWork.length === 0 ? (
                <EmptyState title="No pending change requests" />
              ) : (
                <DataTable headers={["Request", "Customer", "Est. Hours", "Est. Amount", "Submitted"]}>
                  {additionalWork.slice(0, 8).map((w) => (
                    <tr key={w.id}>
                      <td>
                        <Link className="link link-hover" href={w.project_id ? `/projects/${w.project_id}` : "/additional-work"}>
                          {w.title}
                        </Link>
                      </td>
                      <td>{customerName.get(w.customer_id) ?? "-"}</td>
                      <td>{w.estimated_hours != null ? <Hours value={Number(w.estimated_hours)} /> : "-"}</td>
                      <td>{w.estimated_amount != null ? <Money value={Number(w.estimated_amount)} /> : "-"}</td>
                      <td>
                        <DateText value={w.created_at} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Projects to send / waiting on customer</h3>
                {projectsNeedingCustomerAction.length === 0 ? (
                  <EmptyState title="No project approvals pending" />
                ) : (
                  <DataTable headers={["Project", "Customer", "Status"]}>
                    {projectsNeedingCustomerAction.slice(0, 8).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link className="link link-hover" href={`/projects/${p.id}`}>
                            {p.name}
                          </Link>
                        </td>
                        <td>{customerName.get(p.customer_id) ?? "-"}</td>
                        <td>
                          <StatusBadge
                            status={
                              p.status === "proposed"
                                ? "proposed"
                                : p.customer_approval_status === "pending" || p.status === "awaiting_customer_approval"
                                  ? "pending"
                                  : p.status
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide opacity-60">Milestone approvals</h3>
                {pendingMilestones.length === 0 ? (
                  <EmptyState title="No milestone approvals pending" />
                ) : (
                  <DataTable headers={["Milestone", "Project"]}>
                    {pendingMilestones.map((m) => {
                      const project = Array.isArray(m.projects) ? m.projects[0] : m.projects;
                      return (
                        <tr key={m.id}>
                          <td>{m.name}</td>
                          <td>
                            <Link className="link link-hover" href={`/projects/${m.project_id}`}>
                              {project?.name ?? "View project"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technician workspace
// ---------------------------------------------------------------------------

async function TechnicianDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const recentCompletedSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const ticketSelectBasic =
    "id, ticket_number, title, customer_id, contract_id, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, technician_notes, customer_resolution_summary, classification, billable_approval_status";
  const ticketSelectWithSchedule = `${ticketSelectBasic}, scheduled_start_at, scheduled_end_at, service_mode, service_location, schedule_notes`;

  const [openAttempt, recentAttempt, timeEntriesRes, additionalWorkRes, hoursTodayRes] =
    await Promise.all([
      supabase
        .from("support_tickets")
        .select(ticketSelectWithSchedule)
        .eq("assigned_technician_id", profile.id)
        .in("status", OPEN_TICKET_STATUSES)
        .order("target_response_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("support_tickets")
        .select(ticketSelectWithSchedule)
        .eq("assigned_technician_id", profile.id)
        .in("status", ["resolved", "closed"])
        .gte("completed_at", recentCompletedSince)
        .order("completed_at", { ascending: false })
        .limit(12),
      supabase
        .from("time_entries")
        .select(
          "id, work_date, hours_worked, description, approval_status, submitted_at, support_ticket_id, contract_id, classification"
        )
        .eq("technician_id", profile.id)
        .or("submitted_at.is.null,approval_status.eq.pending")
        .order("work_date", { ascending: false })
        .limit(25),
      supabase
        .from("additional_work_requests")
        .select(
          "id, title, customer_id, approval_status, created_at, estimated_hours, support_ticket_id, review_notes"
        )
        .eq("requested_by", profile.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("time_entries")
        .select("hours_worked, work_date")
        .eq("technician_id", profile.id)
        .eq("work_date", localDateKey(now)),
    ]);

  const scheduleColumnsMissing =
    openAttempt.error?.message?.includes("scheduled_start_at") ||
    recentAttempt.error?.message?.includes("scheduled_start_at");

  const openTicketsRes = scheduleColumnsMissing
    ? await supabase
        .from("support_tickets")
        .select(ticketSelectBasic)
        .eq("assigned_technician_id", profile.id)
        .in("status", OPEN_TICKET_STATUSES)
        .order("target_response_at", { ascending: true, nullsFirst: false })
    : openAttempt;

  const recentCompletedRes = scheduleColumnsMissing
    ? await supabase
        .from("support_tickets")
        .select(ticketSelectBasic)
        .eq("assigned_technician_id", profile.id)
        .in("status", ["resolved", "closed"])
        .gte("completed_at", recentCompletedSince)
        .order("completed_at", { ascending: false })
        .limit(12)
    : recentAttempt;

  if (openTicketsRes.error || recentCompletedRes.error) {
    return (
      <div>
        <PageHeader title="My Assignments" />
        <EmptyState
          title="Couldn't load your workspace"
          description={openTicketsRes.error?.message ?? recentCompletedRes.error?.message ?? "Please try again."}
        />
      </div>
    );
  }

  const ticketRows = [...(openTicketsRes.data ?? []), ...(recentCompletedRes.data ?? [])];
  const customerIds = Array.from(new Set(ticketRows.map((t) => t.customer_id)));
  const contractIds = Array.from(
    new Set(
      [
        ...ticketRows.map((t) => t.contract_id),
        ...(timeEntriesRes.data ?? []).map((e) => e.contract_id),
      ].filter((v): v is string => Boolean(v))
    )
  );
  const ticketIdsForLabels = Array.from(
    new Set((timeEntriesRes.data ?? []).map((e) => e.support_ticket_id).filter((v): v is string => Boolean(v)))
  );

  const [customersRes, contractsRes, ticketLabelsRes, monthHoursRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, service_address").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; service_address: string | null }[] }),
    contractIds.length
      ? supabase
          .from("contracts")
          .select("id, name, contract_number, included_hours_per_month, additional_hourly_rate")
          .in("id", contractIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            contract_number: string | null;
            included_hours_per_month: number | null;
            additional_hourly_rate: number | null;
          }[],
        }),
    ticketIdsForLabels.length
      ? supabase.from("support_tickets").select("id, ticket_number, title").in("id", ticketIdsForLabels)
      : Promise.resolve({ data: [] as { id: string; ticket_number: string; title: string }[] }),
    contractIds.length
      ? supabase
          .from("time_entries")
          .select("contract_id, hours_worked")
          .in("contract_id", contractIds)
          .eq("classification", "included")
          .gte("work_date", monthStart)
          .lt("work_date", monthEnd)
      : Promise.resolve({ data: [] as { contract_id: string | null; hours_worked: number }[] }),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));
  const customerAddress = new Map(
    (customersRes.data ?? []).map((c) => [c.id, c.service_address ?? null])
  );
  const contractById = new Map((contractsRes.data ?? []).map((c) => [c.id, c]));
  const ticketLabelById = new Map(
    (ticketLabelsRes.data ?? []).map((t) => [t.id, `${t.ticket_number} | ${t.title}`])
  );

  const hoursByContract = new Map<string, number>();
  for (const entry of monthHoursRes.data ?? []) {
    if (!entry.contract_id) continue;
    hoursByContract.set(
      entry.contract_id,
      (hoursByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked ?? 0)
    );
  }

  function toWorkspaceTicket(t: (typeof ticketRows)[number]): WorkspaceTicket {
    const live = evaluateTicketSla(t);
    const contract = t.contract_id ? contractById.get(t.contract_id) : null;
    const included = contract ? Number(contract.included_hours_per_month ?? 0) : null;
    const used = t.contract_id ? hoursByContract.get(t.contract_id) ?? 0 : null;
    const warning =
      included != null && used != null ? usageStatus(usagePercentage(used, included)) : null;

    return {
      id: t.id,
      ticket_number: t.ticket_number,
      title: t.title,
      customer_id: t.customer_id,
      customer_name: customerName.get(t.customer_id) ?? "Unknown customer",
      contract_id: t.contract_id,
      contract_label: contract
        ? `${contract.contract_number ?? "Contract"} | ${contract.name}`
        : null,
      priority: t.priority,
      status: t.status,
      submitted_at: t.submitted_at,
      target_response_at: t.target_response_at,
      target_resolution_at: t.target_resolution_at,
      actual_response_at: t.actual_response_at,
      completed_at: t.completed_at,
      technician_notes: t.technician_notes,
      customer_resolution_summary: t.customer_resolution_summary,
      classification: t.classification,
      billable_approval_status: t.billable_approval_status ?? null,
      scheduled_start_at: "scheduled_start_at" in t ? (t.scheduled_start_at as string | null) ?? null : null,
      scheduled_end_at: "scheduled_end_at" in t ? (t.scheduled_end_at as string | null) ?? null : null,
      service_mode: "service_mode" in t ? (t.service_mode as string | null) ?? null : null,
      service_location:
        ("service_location" in t ? (t.service_location as string | null) : null) ??
        (("service_mode" in t ? t.service_mode : null) === "onsite"
          ? customerAddress.get(t.customer_id) ?? null
          : null),
      schedule_notes: "schedule_notes" in t ? (t.schedule_notes as string | null) ?? null : null,
      hours_warning: warning,
      hours_used: used,
      hours_included: included,
      additional_hourly_rate: contract ? Number(contract.additional_hourly_rate ?? 0) : null,
      sla: live.overall,
      response_sla: live.response,
      resolution_sla: live.resolution,
      overdue: live.overdue,
    };
  }

  const workspaceTickets: WorkspaceTicket[] = [
    ...(openTicketsRes.data ?? []).map(toWorkspaceTicket),
    ...(recentCompletedRes.data ?? []).map(toWorkspaceTicket),
  ];

  const pendingTimeEntries: WorkspaceTimeEntry[] = (timeEntriesRes.data ?? []).map((e) => ({
    id: e.id,
    work_date: e.work_date,
    hours_worked: Number(e.hours_worked),
    description: e.description,
    approval_status: e.submitted_at == null ? "pending" : e.approval_status,
    support_ticket_id: e.support_ticket_id,
    ticket_label: e.support_ticket_id ? ticketLabelById.get(e.support_ticket_id) ?? null : null,
  }));

  const addlCustomerIds = Array.from(
    new Set((additionalWorkRes.data ?? []).map((w) => w.customer_id))
  );
  const addlCustomersRes = addlCustomerIds.length
    ? await supabase.from("customers").select("id, name").in("id", addlCustomerIds)
    : { data: [] as { id: string; name: string }[] };
  const addlCustomerName = new Map((addlCustomersRes.data ?? []).map((c) => [c.id, c.name]));

  const allAdditionalWork: WorkspaceAdditionalWork[] = (additionalWorkRes.data ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    customer_name: addlCustomerName.get(w.customer_id) ?? "-",
    approval_status: w.approval_status,
    created_at: w.created_at,
    estimated_hours: w.estimated_hours != null ? Number(w.estimated_hours) : null,
    support_ticket_id: w.support_ticket_id,
    review_notes: w.review_notes ?? null,
  }));

  const pendingAdditionalWork = allAdditionalWork.filter((w) => w.approval_status === "pending");

  const contractWarnings: ContractHourWarning[] = Array.from(hoursByContract.entries())
    .map(([contractId, used]) => {
      const contract = contractById.get(contractId);
      if (!contract) return null;
      const included = Number(contract.included_hours_per_month ?? 0);
      const status = usageStatus(usagePercentage(used, included));
      if (status === "normal") return null;
      return {
        contract_id: contractId,
        label: `${contract.contract_number ?? "Contract"} | ${contract.name}`,
        used,
        included,
        status: status as "warning" | "over_limit",
      };
    })
    .filter((v): v is ContractHourWarning => v !== null);

  const today = localDateKey(now);
  const openAssigned = workspaceTickets.filter((t) => OPEN_TICKET_STATUSES.includes(t.status));
  const dueTodayCount = openAssigned.filter((t) => {
    const responseDue =
      localDateKeyFromIso(t.target_response_at) === today && !t.actual_response_at;
    const resolutionDue =
      localDateKeyFromIso(t.target_resolution_at) === today &&
      !t.completed_at &&
      t.status !== "resolved" &&
      t.status !== "closed";
    return responseDue || resolutionDue;
  }).length;
  const criticalHighCount = openAssigned.filter(
    (t) => t.priority === "critical" || t.priority === "high"
  ).length;
  const overdueCount = openAssigned.filter((t) => t.overdue).length;
  const completedTodayTickets = workspaceTickets.filter(
    (t) =>
      (t.status === "resolved" || t.status === "closed") &&
      localDateKeyFromIso(t.completed_at) === today
  );
  const hoursToday = (hoursTodayRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.hours_worked ?? 0),
    0
  );

  const summary = {
    openAssigned: openAssigned.length,
    dueToday: dueTodayCount,
    criticalHigh: criticalHighCount,
    overdue: overdueCount,
    completedToday: completedTodayTickets.length,
    hoursToday,
    awaitingApproval: pendingAdditionalWork.length,
  };

  return (
    <div>
      <PageHeader
        title="My Assignments"
        description="Action-oriented technician workspace for completing your assigned support work."
      />
      <TechnicianWorkspaceClient
        technicianId={profile.id}
        technicianName={profile.full_name}
        internalCostRate={Number(profile.internal_cost_rate ?? 65)}
        tickets={workspaceTickets}
        pendingTimeEntries={pendingTimeEntries}
        pendingAdditionalWork={pendingAdditionalWork}
        allAdditionalWork={allAdditionalWork}
        contractWarnings={contractWarnings}
        summary={summary}
        completedTodayIds={completedTodayTickets.map((t) => t.id)}
        timezoneLabel={Intl.DateTimeFormat().resolvedOptions().timeZone || "local time"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

function invoiceDaysPastDue(dueDate: string, asOf = new Date()) {
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  return Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

async function BillingDashboard({
  profile,
  searchParams,
}: {
  profile: Profile;
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const period = resolveDashboardPeriod(searchParams.view, searchParams.period);
  const includeOpenOneTime = periodOverlapsToday(period);
  const supabase = await createClient();

  const [review, invoicesRes, paymentsRes, revenueRes, customersRes, contractReportRes] = await Promise.all([
    loadBillingReviewData(
      supabase,
      { start: period.start, end: period.end, label: period.label, unbounded: period.unbounded },
      { includeOpenOneTime }
    ),
    supabase
      .from("invoices")
      .select(
        "id, customer_id, invoice_number, status, remaining_balance, due_date, total_amount, amount_paid, dispute_status, invoice_date, billing_period_start"
      ),
    supabase.from("payments").select("payment_number, payment_amount, payment_date, customer_id"),
    supabase.from("revenue_records").select("recognition, amount, period_month, revenue_type, description"),
    supabase.from("customers").select("id, name"),
    fetchContractReportMetrics(supabase),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const contractMetrics = contractReportRes.metrics;
  const invoices = (invoicesRes.data ?? [])
    .map((invoice) => withDerivedInvoiceStatus(invoice))
    .filter((invoice) => dateInDashboardPeriod(invoice.billing_period_start || invoice.invoice_date, period));
  const payments = ((paymentsRes.data ?? []) as Pick<Payment, "payment_number" | "payment_amount" | "payment_date" | "customer_id">[]).filter(
    (payment) => dateInDashboardPeriod(payment.payment_date, period)
  );
  const revenue = ((revenueRes.data ?? []) as Pick<RevenueRecord, "recognition" | "amount" | "period_month" | "revenue_type" | "description">[]).filter(
    (row) => monthKeyInDashboardPeriod(row.period_month, period)
  );

  const packagesReady = review.packages.filter((pkg) => pkg.estimatedTotal > 0);
  const readyItems = includeOpenOneTime ? review.items : [];
  const readyToBill = packagesReady.length + readyItems.length;
  const readyToBillAmount = round2(
    packagesReady.reduce((sum, pkg) => sum + pkg.estimatedTotal, 0) + readyItems.reduce((sum, item) => sum + item.amount, 0)
  );
  const issuedInvoices = invoices.filter((invoice) => !["draft", "canceled"].includes(invoice.status));
  const issuedTotal = issuedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount ?? 0), 0);
  const draftInvoices = invoices.filter((i) => i.status === "draft");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const partialInvoices = invoices.filter((i) => i.status === "partially_paid");
  const disputedInvoices = invoices.filter((i) => i.status === "disputed");
  const openReceivables = invoices.filter((i) => !["draft", "canceled", "paid"].includes(i.status) && i.remaining_balance > 0.01);
  const totalAr = openReceivables.reduce((sum, invoice) => sum + invoice.remaining_balance, 0);

  const paymentsInPeriod = payments.reduce((sum, p) => sum + Number(p.payment_amount), 0);

  const agingBuckets = AR_AGING_BUCKETS;
  const agingSummary = agingBuckets.map((bucket) => {
    const bucketInvoices = openReceivables.filter((i) => arAgingBucket(i.due_date) === bucket);
    return {
      bucket,
      total: bucketInvoices.reduce((sum, i) => sum + i.remaining_balance, 0),
      invoices: bucketInvoices,
    };
  });

  const deferredRows = revenue.filter((r) => r.recognition === "deferred");
  const unbilledRows = revenue.filter((r) => r.recognition === "unbilled");
  const deferred = deferredRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const unbilled = unbilledRows.reduce((sum, r) => sum + Number(r.amount), 0);
  const partialPaidTotal = partialInvoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0);
  const partialBalanceTotal = partialInvoices.reduce((sum, invoice) => sum + invoice.remaining_balance, 0);
  const exceptionCount = review.exceptions.length;
  const overdueBalance = round2(overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.remaining_balance ?? 0), 0));
  const pastDueAr = round2(
    openReceivables
      .filter((invoice) => arAgingBucket(invoice.due_date) !== "Current")
      .reduce((sum, invoice) => sum + Number(invoice.remaining_balance ?? 0), 0)
  );
  const sortedOverdue = [...overdueInvoices].sort((left, right) => {
    const byDays = invoiceDaysPastDue(right.due_date) - invoiceDaysPastDue(left.due_date);
    if (byDays !== 0) return byDays;
    return Number(right.remaining_balance ?? 0) - Number(left.remaining_balance ?? 0);
  });
  const statusBits = [
    readyToBill > 0 ? `${readyToBill} ready to bill` : null,
    draftInvoices.length > 0 ? `${draftInvoices.length} draft${draftInvoices.length === 1 ? "" : "s"} waiting review` : null,
    exceptionCount > 0 ? `${exceptionCount} pending approval${exceptionCount === 1 ? "" : "s"}` : null,
    overdueBalance > 0 ? `${formatCurrency(overdueBalance)} overdue` : null,
    disputedInvoices.length > 0 ? `${disputedInvoices.length} dispute${disputedInvoices.length === 1 ? "" : "s"}` : null,
  ].filter((bit): bit is string => Boolean(bit));

  const readyExplanation = {
    title: "Ready to Bill",
    result: String(readyToBill),
    formula: "Uninvoiced monthly packages in this period + approved one-time costs still open if the period includes today",
    description: includeOpenOneTime
      ? `Open one-time costs are included because ${period.label} includes the current date. Total waiting to invoice: ${formatCurrency(readyToBillAmount)}.`
      : `Historical view shows uninvoiced monthly fees and overage for ${period.label} only. Total: ${formatCurrency(readyToBillAmount)}.`,
    lines: [
      ...packagesReady.map((pkg) => ({
        label: `${pkg.customerName} | ${pkg.contractName}`,
        value: formatCurrency(pkg.estimatedTotal),
        detail: [
          pkg.alreadyInvoiced ? "Monthly fee already invoiced" : `Monthly fee ${formatCurrency(pkg.monthlyFee)}`,
          pkg.overageCharge > 0 ? `overage ${formatCurrency(pkg.overageCharge)}` : null,
          pkg.projectCharges.length > 0 ? `${pkg.projectCharges.length} project/milestone charge(s)` : null,
          pkg.equipmentSoftwareCharges.length > 0 ? `${pkg.equipmentSoftwareCharges.length} equipment/software item(s)` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      })),
      ...readyItems.map((item) => ({
        label: `${item.customerName} | ${item.description}`,
        value: formatCurrency(item.amount),
        detail: item.categoryLabel,
      })),
    ],
  };
  const draftExplanation = {
    title: "Draft Invoices",
    result: String(draftInvoices.length),
    formula: `Count of draft invoices in ${period.label}`,
    lines: draftInvoices.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(Number(invoice.total_amount ?? 0)),
      detail: customerName.get(invoice.customer_id) ?? "Unknown customer",
    })),
  };
  const exceptionExplanation = {
    title: "Pending Approvals",
    result: String(exceptionCount),
    formula: "Count of unapproved time entries, direct costs, and additional work requests that block billing",
    description: "These items appear on Overview until a manager or billing reviewer approves or rejects them.",
    lines: review.exceptions.map((exception) => ({
      label: `${exception.customerName} | ${exception.reason}`,
      value: exception.kind.replace(/_/g, " "),
      detail: exception.detail,
    })),
  };
  const overdueExplanation = {
    title: "Overdue Invoices",
    result: `${overdueInvoices.length} | ${formatCurrency(overdueBalance)}`,
    formula: `Count and remaining balance of unpaid invoices from ${period.label} with no payment yet, past due date, and not disputed`,
    description: "Invoices with a partial payment are shown under Partially Paid instead of Overdue.",
    lines: overdueInvoices.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(invoice.remaining_balance),
      detail: `${customerName.get(invoice.customer_id) ?? "Unknown customer"} | due ${invoice.due_date} | ${invoiceDaysPastDue(invoice.due_date)} days past due`,
    })),
  };
  const disputeExplanation = {
    title: "Disputed Invoices",
    result: String(disputedInvoices.length),
    formula: `Count of invoices from ${period.label} marked disputed or with an open dispute flag`,
    lines: disputedInvoices.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(invoice.remaining_balance),
      detail: customerName.get(invoice.customer_id) ?? "Unknown customer",
    })),
  };
  const issuedExplanation = {
    title: "Invoices Issued",
    result: String(issuedInvoices.length),
    formula: `Count of invoices whose billing period or invoice date falls in ${period.label}, excluding drafts and canceled invoices`,
    description: `Total billed in this period: ${formatCurrency(issuedTotal)}.`,
    lines: issuedInvoices.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(Number(invoice.total_amount ?? 0)),
      detail: `${customerName.get(invoice.customer_id) ?? "Unknown customer"} | ${invoice.status.replace(/_/g, " ")}`,
    })),
  };
  const paymentsExplanation = {
    title: "Payments",
    result: formatCurrency(paymentsInPeriod),
    formula: `Sum of payment_amount where payment date is in ${period.label}`,
    lines: payments.map((payment) => ({
      label: payment.payment_number,
      value: formatCurrency(Number(payment.payment_amount)),
      detail: `${customerName.get(payment.customer_id) ?? "Unknown customer"} | ${payment.payment_date}`,
    })),
  };
  const arExplanation = {
    title: "Accounts Receivable",
    result: formatCurrency(totalAr),
    formula: `Sum of remaining_balance on open invoices from ${period.label}`,
    description: `Draft, canceled, and fully paid invoices are excluded. Past-due AR is ${formatCurrency(pastDueAr)}.`,
    lines: openReceivables.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(invoice.remaining_balance),
      detail: `${customerName.get(invoice.customer_id) ?? "Unknown customer"} | ${invoice.status.replace(/_/g, " ")}`,
    })),
  };
  const partialExplanation = {
    title: "Partially Paid Invoices",
    result: String(partialInvoices.length),
    formula: `Count of invoices from ${period.label} where amount paid > 0 and remaining balance > 0`,
    description: `Total paid on these invoices: ${formatCurrency(partialPaidTotal)}. Remaining balance: ${formatCurrency(partialBalanceTotal)}.`,
    lines: partialInvoices.map((invoice) => ({
      label: invoice.invoice_number,
      value: formatCurrency(invoice.remaining_balance),
      detail: `${customerName.get(invoice.customer_id) ?? "Unknown customer"} | paid ${formatCurrency(invoice.amount_paid)}`,
    })),
  };
  const deferredExplanation = {
    title: "Deferred Revenue",
    result: formatCurrency(deferred),
    formula: `Sum of deferred revenue_records in ${period.label}`,
    description: "Money billed or collected before the service period is fully earned.",
    lines: deferredRows.map((row) => ({
      label: row.description || row.revenue_type.replace(/_/g, " "),
      value: formatCurrency(Number(row.amount)),
      detail: row.period_month,
    })),
  };
  const unbilledExplanation = {
    title: "Unbilled Revenue",
    result: formatCurrency(unbilled),
    formula: `Sum of unbilled revenue_records in ${period.label}`,
    description: "Earned work that has not yet been placed on an invoice.",
    lines: unbilledRows.map((row) => ({
      label: row.description || row.revenue_type.replace(/_/g, " "),
      value: formatCurrency(Number(row.amount)),
      detail: row.period_month,
    })),
  };
  const agingExplanation = {
    title: "Accounts Receivable Aging",
    result: formatCurrency(totalAr),
    formula: `For each bucket, sum remaining_balance of open invoices from ${period.label} whose due date falls in that aging range`,
    description: "Current means not yet due. Past-due buckets are based on days after the due date.",
    lines: agingSummary.map((row) => ({
      label: row.bucket,
      value: formatCurrency(row.total),
      detail: `${row.invoices.length} invoice${row.invoices.length === 1 ? "" : "s"}`,
    })),
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing Dashboard"
        description={
          period.view === "all"
            ? `Welcome back, ${profile.full_name}. Showing data for the life of the company.`
            : `Welcome back, ${profile.full_name}. Showing ${period.label} in ${period.view} view.`
        }
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />

      {statusBits.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-box border border-base-300 bg-base-100 px-4 py-2.5 text-sm">
          {statusBits.map((bit) => (
            <li key={bit} className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full bg-base-content/45" aria-hidden />
              <span>{bit}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-box border border-base-300 bg-base-100 px-4 py-2.5 text-sm">
          No billing exceptions in {period.label}.
        </p>
      )}

      <DashboardSection title="Needs attention" description="Work that should be invoiced, reviewed, approved, or collected first.">
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DashboardMetricAccordion
            label="Ready to Bill"
            value={String(readyToBill)}
            hint={`${formatCurrency(readyToBillAmount)} | ${period.label}`}
            tone={readyToBill > 0 ? "warning" : "default"}
            explanation={readyExplanation}
            href="/billing-review"
            hrefLabel="Open Overview"
          >
            {packagesReady.length + readyItems.length === 0 ? (
              <EmptyState title="Nothing waiting to invoice" description="Monthly packages and approved one-time items for this period are clear." />
            ) : (
              <DataTable headers={["Customer / item", "Detail", "Amount"]}>
                {packagesReady.map((pkg) => (
                  <tr key={`${pkg.contractId}:${pkg.periodStart ?? "current"}`}>
                    <td>
                      {pkg.customerName}
                      <div className="text-xs opacity-60">{pkg.contractName}</div>
                    </td>
                    <td className="text-xs opacity-70">Monthly package</td>
                    <td>
                      <Money value={pkg.estimatedTotal} />
                    </td>
                  </tr>
                ))}
                {readyItems.map((item) => (
                  <tr key={`${item.type}:${item.id}`}>
                    <td>
                      {item.customerName}
                      <div className="text-xs opacity-60">{item.description}</div>
                    </td>
                    <td className="text-xs opacity-70">{item.categoryLabel}</td>
                    <td>
                      <Money value={item.amount} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Draft Invoices"
            value={String(draftInvoices.length)}
            hint="Must be reviewed before sending"
            tone={draftInvoices.length > 0 ? "warning" : "default"}
            explanation={draftExplanation}
            href="/invoices"
            hrefLabel="Open Invoices"
          >
            {draftInvoices.length === 0 ? (
              <EmptyState title="No drafts" description="Every generated invoice in this period has been reviewed or canceled." />
            ) : (
              <DataTable headers={["Invoice", "Customer", "Total"]}>
                {draftInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                    <td>
                      <Money value={Number(invoice.total_amount ?? 0)} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Pending Approvals"
            value={String(exceptionCount)}
            hint="Unapproved time, costs, or additional work"
            tone={exceptionCount > 0 ? "warning" : "success"}
            explanation={exceptionExplanation}
            href="/billing-review"
            hrefLabel="Review exceptions"
          >
            {exceptionCount === 0 ? (
              <EmptyState title="No pending approvals" description="Nothing is blocking billing for lack of approval." />
            ) : (
              <div className="space-y-3">
                <DataTable headers={["Customer", "Reason", "Detail"]}>
                  {review.exceptions.map((exception) => (
                    <tr key={exception.id}>
                      <td>{exception.customerName}</td>
                      <td>{exception.reason}</td>
                      <td className="text-xs opacity-70">{exception.detail}</td>
                    </tr>
                  ))}
                </DataTable>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link href="/time-cost-approvals" className="link link-hover">
                    Time approvals
                  </Link>
                  <Link href="/billing-cost-approvals" className="link link-hover">
                    Cost approvals
                  </Link>
                </div>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Overdue"
            value={formatCurrency(overdueBalance)}
            hint={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`}
            tone={overdueInvoices.length > 0 ? "error" : "success"}
            explanation={overdueExplanation}
            href="/accounts-receivable"
            hrefLabel="Open Accounts Receivable"
          >
            {sortedOverdue.length === 0 ? (
              <EmptyState title="Nothing overdue" description="All invoices are within terms." />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Invoice", "Customer", "Days past due", "Balance", "Due"]}>
                  {sortedOverdue.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                      <td>{invoiceDaysPastDue(invoice.due_date)}</td>
                      <td>
                        <Money value={Number(invoice.remaining_balance)} />
                      </td>
                      <td>
                        <DateText value={invoice.due_date} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Disputed Invoices"
            value={String(disputedInvoices.length)}
            hint={disputedInvoices.length > 0 ? "Collection paused until resolved" : "No open disputes"}
            tone={disputedInvoices.length > 0 ? "error" : "default"}
            explanation={disputeExplanation}
            href="/invoices"
            hrefLabel="Open Invoices"
          >
            {disputedInvoices.length === 0 ? (
              <EmptyState title="No open disputes" />
            ) : (
              <DataTable headers={["Invoice", "Customer", "Balance"]}>
                {disputedInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                    <td>
                      <Money value={Number(invoice.remaining_balance)} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </DashboardMetricAccordion>
        </div>
      </DashboardSection>

      <DashboardSection title="This period" description={`Snapshot of billing, cash, and open balances for ${period.label}.`}>
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardMetricAccordion
            label="Accounts Receivable"
            value={formatCurrency(totalAr)}
            hint={`Past due ${formatCurrency(pastDueAr)}`}
            explanation={arExplanation}
            href="/accounts-receivable"
            hrefLabel="Open Accounts Receivable"
          >
            {openReceivables.length === 0 ? (
              <EmptyState title="No open receivables" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Invoice", "Customer", "Status", "Balance"]}>
                  {openReceivables.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                      <td>
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td>
                        <Money value={invoice.remaining_balance} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Payments"
            value={formatCurrency(paymentsInPeriod)}
            hint={period.label}
            tone="success"
            explanation={paymentsExplanation}
            href="/payments"
            hrefLabel="Open Payment History"
          >
            {payments.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Payment", "Customer", "Date", "Amount"]}>
                  {payments.map((payment) => (
                    <tr key={payment.payment_number}>
                      <td>{payment.payment_number}</td>
                      <td>{customerName.get(payment.customer_id) ?? "-"}</td>
                      <td>
                        <DateText value={payment.payment_date} />
                      </td>
                      <td>
                        <Money value={Number(payment.payment_amount)} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Invoices Issued"
            value={String(issuedInvoices.length)}
            hint={formatCurrency(issuedTotal)}
            explanation={issuedExplanation}
            href="/invoices"
            hrefLabel="Open Invoices"
          >
            {issuedInvoices.length === 0 ? (
              <EmptyState title="No issued invoices in this period" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Invoice", "Customer", "Status", "Total"]}>
                  {issuedInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                          {invoice.invoice_number}
                        </Link>
                      </td>
                      <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                      <td>
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td>
                        <Money value={Number(invoice.total_amount ?? 0)} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Partially Paid"
            value={String(partialInvoices.length)}
            hint={`Remaining ${formatCurrency(partialBalanceTotal)}`}
            tone={partialInvoices.length > 0 ? "warning" : "default"}
            explanation={partialExplanation}
            href="/accounts-receivable"
            hrefLabel="Open Accounts Receivable"
          >
            {partialInvoices.length === 0 ? (
              <EmptyState title="No partial payments" description="No open invoices have a partial payment applied." />
            ) : (
              <DataTable headers={["Invoice", "Customer", "Paid", "Balance"]}>
                {partialInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                    <td>
                      <Money value={Number(invoice.amount_paid)} />
                    </td>
                    <td>
                      <Money value={Number(invoice.remaining_balance)} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </DashboardMetricAccordion>
        </div>
      </DashboardSection>

      <DashboardSection title="Collections" description={`Aging and the oldest overdue invoices in ${period.label}.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {agingSummary.map((row) => (
            <Link
              key={row.bucket}
              href="/accounts-receivable"
              className="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm transition hover:border-primary/40"
            >
              <p className="text-xs font-medium uppercase tracking-wide opacity-60">{row.bucket}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                <Money value={row.total} />
              </p>
              <p className="text-xs opacity-60">
                {row.invoices.length} invoice{row.invoices.length === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>

        <DashboardCollapse
          title={`Accounts Receivable Aging | ${period.label}`}
          defaultOpen
          actions={<ExplainNumber explanation={agingExplanation} />}
        >
          <DataTable headers={["Bucket", "Invoices", "Balance"]}>
            {agingSummary.map((row) => (
              <tr key={row.bucket}>
                <td>{row.bucket}</td>
                <td>{row.invoices.length}</td>
                <td>
                  <Money value={row.total} />
                </td>
              </tr>
            ))}
          </DataTable>
        </DashboardCollapse>

        <DashboardCollapse title={`Oldest overdue invoices | ${period.label}`} defaultOpen>
          {sortedOverdue.length === 0 ? (
            <EmptyState title="Nothing overdue" description="All invoices are within terms." />
          ) : (
            <div className="space-y-2">
              <DataTable headers={["Invoice", "Customer", "Days past due", "Balance", "Due"]}>
                {sortedOverdue.slice(0, 5).map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link className="link link-hover" href={`/invoices/${invoice.id}`}>
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td>{customerName.get(invoice.customer_id) ?? "-"}</td>
                    <td>{invoiceDaysPastDue(invoice.due_date)}</td>
                    <td>
                      <Money value={Number(invoice.remaining_balance)} />
                    </td>
                    <td>
                      <DateText value={invoice.due_date} />
                    </td>
                  </tr>
                ))}
              </DataTable>
              {sortedOverdue.length > 5 ? (
                <p className="text-right text-sm">
                  <Link href="/accounts-receivable" className="link link-hover">
                    View all {sortedOverdue.length} overdue invoices
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </DashboardCollapse>
      </DashboardSection>

      <DashboardSection title="Accounting" description="Recognition categories for the selected period.">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <DashboardMetricAccordion
            label="Deferred Revenue"
            value={formatCurrency(deferred)}
            explanation={deferredExplanation}
            href="/accounting"
            hrefLabel="Open Accounting Review"
          >
            {deferredRows.length === 0 ? (
              <EmptyState title="No deferred revenue in this period" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Description", "Period", "Amount"]}>
                  {deferredRows.map((row, index) => (
                    <tr key={`${row.description}-${row.period_month}-${index}`}>
                      <td>{row.description || row.revenue_type.replace(/_/g, " ")}</td>
                      <td>{row.period_month}</td>
                      <td>
                        <Money value={Number(row.amount)} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>

          <DashboardMetricAccordion
            label="Unbilled Revenue"
            value={formatCurrency(unbilled)}
            explanation={unbilledExplanation}
            href="/accounting"
            hrefLabel="Open Accounting Review"
          >
            {unbilledRows.length === 0 ? (
              <EmptyState title="No unbilled revenue in this period" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <DataTable headers={["Description", "Period", "Amount"]}>
                  {unbilledRows.map((row, index) => (
                    <tr key={`${row.description}-${row.period_month}-${index}`}>
                      <td>{row.description || row.revenue_type.replace(/_/g, " ")}</td>
                      <td>{row.period_month}</td>
                      <td>
                        <Money value={Number(row.amount)} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </DashboardMetricAccordion>
        </div>
      </DashboardSection>

      <DashboardCollapse title="Contract billing portfolio">
        <ContractMetricsWidgets metrics={contractMetrics} showTables={false} title={null} />
      </DashboardCollapse>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

async function CustomerDashboard({ profile }: { profile: Profile }) {
  if (!profile.customer_id) {
    return (
      <div>
        <PageHeader title="Customer Home" />
        <EmptyState title="No customer linked to your account" description="Contact your account manager to link this login to a customer record." />
      </div>
    );
  }

  const supabase = await createClient();
  const { data: linkedCustomer } = await supabase
    .from("customers")
    .select("id, name, status, approval_note")
    .eq("id", profile.customer_id)
    .maybeSingle();

  if (linkedCustomer?.status === "pending_approval" || linkedCustomer?.status === "rejected") {
    redirect("/pending-approval");
  }

  const monthStart = `${lastNMonthKeys(1)[0]}-01`;
  const customerId = profile.customer_id;

  const [contractsRes, ticketsRes, projectsRes, invoicesRes, paymentsRes, disputesRes, timeEntriesRes, revenueRes] =
    await Promise.all([
      supabase.from("contracts").select("id, name, contract_number, status, included_hours_per_month").eq("customer_id", customerId).eq("status", "active"),
      supabase.from("support_tickets").select("id, ticket_number, title, priority, status").eq("customer_id", customerId).in("status", OPEN_TICKET_STATUSES),
      supabase.from("projects").select("id, name, status").eq("customer_id", customerId),
      supabase
        .from("invoices")
        .select("id, invoice_number, remaining_balance, status, due_date, amount_paid, dispute_status")
        .eq("customer_id", customerId),
      supabase
        .from("payments")
        .select("id, payment_number, payment_amount, payment_date, payment_method")
        .eq("customer_id", customerId)
        .order("payment_date", { ascending: false })
        .limit(5),
      supabase.from("disputes").select("id, dispute_reason, disputed_amount, resolution_status").eq("customer_id", customerId),
      supabase
        .from("time_entries")
        .select("contract_id, hours_worked, classification, work_date")
        .eq("customer_id", customerId)
        .gte("work_date", monthStart),
      supabase.from("revenue_records").select("amount, recognition, period_month").eq("customer_id", customerId),
    ]);

  const contracts = (contractsRes.data ?? []) as Pick<
    Contract,
    "id" | "name" | "contract_number" | "status" | "included_hours_per_month"
  >[];
  const tickets = (ticketsRes.data ?? []) as Pick<SupportTicket, "id" | "ticket_number" | "title" | "priority" | "status">[];
  const projects = (projectsRes.data ?? []) as Pick<Project, "id" | "name" | "status">[];
  const invoices = (invoicesRes.data ?? []).map((invoice) => withDerivedInvoiceStatus(invoice));
  const payments = (paymentsRes.data ?? []) as (Pick<Payment, "payment_number" | "payment_amount" | "payment_date" | "payment_method"> & { id: string })[];
  const disputes = (disputesRes.data ?? []) as Pick<Dispute, "id" | "dispute_reason" | "disputed_amount" | "resolution_status">[];
  const timeEntries = (timeEntriesRes.data ?? []) as Pick<TimeEntry, "contract_id" | "hours_worked" | "classification" | "work_date">[];
  const revenue = (revenueRes.data ?? []) as Pick<RevenueRecord, "amount" | "recognition" | "period_month">[];

  const hoursByContract = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.contract_id || entry.classification !== "included") continue;
    hoursByContract.set(entry.contract_id, (hoursByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked));
  }
  const contractsWithUsage = contracts.map((c) => {
    const used = hoursByContract.get(c.id) ?? 0;
    const remaining = hoursRemaining(c.included_hours_per_month, used);
    const pct = usagePercentage(used, c.included_hours_per_month);
    return { ...c, used, remaining, pct, status: usageStatus(pct) };
  });

  const invoiceBalance = invoices
    .filter((i) => !["draft", "canceled", "paid"].includes(i.status) && i.remaining_balance > 0.01)
    .reduce((sum, i) => sum + i.remaining_balance, 0);
  const openDisputes = disputes.filter((d) => d.resolution_status !== "resolved" && d.resolution_status !== "rejected");

  const currentMonthKey = lastNMonthKeys(1)[0];
  const monthlyAmount = revenue
    .filter((r) => r.recognition === "earned" && monthKey(r.period_month) === currentMonthKey)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <PageHeader title="Customer Home" description={`Welcome back, ${profile.full_name}. Here's your account at a glance.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Contracts"
          value={String(contracts.length)}
          explanation={{
            title: "Active Contracts",
            result: String(contracts.length),
            formula: "Count of your contracts with status = active",
            lines: contracts.map((contract) => ({ label: contract.name, value: contract.contract_number })),
          }}
        />
        <StatCard
          label="Open Support Requests"
          value={String(tickets.length)}
          explanation={{
            title: "Open Support Requests",
            result: String(tickets.length),
            formula: "Count of your tickets that are still open",
            lines: tickets.map((ticket) => ({
              label: ticket.ticket_number,
              value: ticket.status.replace(/_/g, " "),
              detail: ticket.title,
            })),
          }}
        />
        <StatCard
          label="Active Projects"
          value={String(projects.filter((p) => !["closed", "canceled"].includes(p.status)).length)}
          explanation={{
            title: "Active Projects",
            result: String(projects.filter((p) => !["closed", "canceled"].includes(p.status)).length),
            formula: "Count of your projects that are not closed or canceled",
            lines: projects
              .filter((project) => !["closed", "canceled"].includes(project.status))
              .map((project) => ({ label: project.name, value: project.status.replace(/_/g, " ") })),
          }}
        />
        <StatCard
          label="Invoice Balance Due"
          value={formatCurrency(invoiceBalance)}
          tone={invoiceBalance > 0 ? "warning" : "success"}
          explanation={{
            title: "Invoice Balance Due",
            result: formatCurrency(invoiceBalance),
            formula: "Sum of remaining_balance on your open invoices that are not draft, canceled, or paid",
            lines: invoices
              .filter((invoice) => !["draft", "canceled", "paid"].includes(invoice.status) && invoice.remaining_balance > 0.01)
              .map((invoice) => ({
                label: invoice.invoice_number,
                value: formatCurrency(invoice.remaining_balance),
                detail: invoice.status.replace(/_/g, " "),
              })),
          }}
        />
        <StatCard
          label="Open Disputes"
          value={String(openDisputes.length)}
          tone={openDisputes.length > 0 ? "error" : "default"}
          explanation={{
            title: "Open Disputes",
            result: String(openDisputes.length),
            formula: "Count of your disputes that are not resolved or rejected",
            lines: openDisputes.map((dispute) => ({
              label: dispute.dispute_reason,
              value: formatCurrency(Number(dispute.disputed_amount)),
              detail: dispute.resolution_status.replace(/_/g, " "),
            })),
          }}
        />
        <StatCard
          label="This Month's Service Charges"
          value={formatCurrency(monthlyAmount)}
          explanation={{
            title: "This Month's Service Charges",
            result: formatCurrency(monthlyAmount),
            formula: `Sum of earned revenue records for ${monthLabel(currentMonthKey)}`,
            lines: revenue
              .filter((row) => row.recognition === "earned" && monthKey(row.period_month) === currentMonthKey)
              .map((row) => ({ label: row.period_month, value: formatCurrency(Number(row.amount)) })),
          }}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Contract Hours This Month</h2>
          {contractsWithUsage.length === 0 ? (
            <EmptyState title="No active contracts" description="Contact your account manager to set up a service agreement." />
          ) : (
            <DataTable headers={["Contract", "Used / Included", "Remaining", "Status"]}>
              {contractsWithUsage.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="link link-hover" href="/my-contracts">
                      {c.name}
                    </Link>
                  </td>
                  <td>
                    <Hours value={c.used} /> / <Hours value={c.included_hours_per_month} />
                  </td>
                  <td>
                    <Hours value={Math.max(c.remaining, 0)} />
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Open Support Requests</h2>
          {tickets.length === 0 ? (
            <EmptyState title="No open requests" description="Submit a new support request any time you need help." />
          ) : (
            <DataTable headers={["Ticket", "Priority", "Status"]}>
              {tickets.slice(0, 8).map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="link link-hover" href={`/tickets/${t.id}`}>
                      {t.ticket_number} | {t.title}
                    </Link>
                  </td>
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
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Recent Payments</h2>
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <DataTable headers={["Payment #", "Amount", "Method", "Date"]}>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_number}</td>
                  <td>
                    <Money value={Number(p.payment_amount)} />
                  </td>
                  <td>
                    <StatusBadge status={p.payment_method} />
                  </td>
                  <td>
                    <DateText value={p.payment_date} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Disputes</h2>
          {disputes.length === 0 ? (
            <EmptyState title="No disputes on file" />
          ) : (
            <DataTable headers={["Reason", "Amount", "Status"]}>
              {disputes.map((d) => (
                <tr key={d.id}>
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
      </div>
    </div>
  );
}
