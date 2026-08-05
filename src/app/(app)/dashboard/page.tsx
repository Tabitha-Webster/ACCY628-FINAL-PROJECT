import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile } from "@/lib/constants";
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
import {
  TechnicianWorkspaceClient,
  type WorkspaceTicket,
  type WorkspaceTimeEntry,
  type WorkspaceAdditionalWork,
  type ContractHourWarning,
} from "@/components/TechnicianWorkspaceClient";
import { usagePercentage, usageStatus, hoursRemaining } from "@/lib/calculations";
import { evaluateTicketSla } from "@/lib/sla";
import { arAgingBucket } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import type {
  AdditionalWorkRequest,
  Contract,
  DirectCost,
  Dispute,
  Invoice,
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

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  if (profile.role === "manager") return <ManagerDashboard profile={profile} />;
  if (profile.role === "technician") return <TechnicianDashboard profile={profile} />;
  if (profile.role === "billing") return <BillingDashboard profile={profile} />;
  if (profile.role === "customer") return <CustomerDashboard profile={profile} />;
  redirect("/login");
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
      .select("id, customer_id, title, estimated_hours, estimated_amount, created_at")
      .eq("approval_status", "pending"),
    supabase
      .from("time_entries")
      .select("contract_id, customer_id, hours_worked, labor_cost, classification, work_date")
      .gte("work_date", rangeStart),
    supabase.from("direct_costs").select("internal_cost, cost_date").gte("cost_date", rangeStart),
    supabase.from("invoices").select("id, customer_id, status, remaining_balance, due_date"),
    supabase.from("revenue_records").select("period_month, recognition, amount").gte("period_month", rangeStart),
    supabase
      .from("contracts")
      .select("id, name, contract_number, customer_id, included_hours_per_month")
      .eq("status", "active"),
    supabase.from("customers").select("id, name"),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const tickets = (openTicketsRes.data ?? []) as SupportTicket[];
  const additionalWork = (additionalWorkRes.data ?? []) as Pick<
    AdditionalWorkRequest,
    "id" | "customer_id" | "title" | "estimated_hours" | "estimated_amount" | "created_at"
  >[];
  const timeEntries = (timeEntriesRes.data ?? []) as Pick<
    TimeEntry,
    "contract_id" | "customer_id" | "hours_worked" | "labor_cost" | "classification" | "work_date"
  >[];
  const directCosts = (directCostsRes.data ?? []) as Pick<DirectCost, "internal_cost" | "cost_date">[];
  const invoices = (invoicesRes.data ?? []) as Pick<
    Invoice,
    "id" | "customer_id" | "status" | "remaining_balance" | "due_date"
  >[];
  const revenue = (revenueRes.data ?? []) as Pick<RevenueRecord, "period_month" | "recognition" | "amount">[];
  const activeContracts = (activeContractsRes.data ?? []) as Pick<
    Contract,
    "id" | "name" | "contract_number" | "customer_id" | "included_hours_per_month"
  >[];

  const slaAtRisk = tickets.filter((t) => ticketSlaSeverity(t) === "at_risk");
  const slaMissed = tickets.filter((t) => ticketSlaSeverity(t) === "missed");

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Customers" value={String(customersCountRes.count ?? 0)} />
        <StatCard label="Active Contracts" value={String(contractsCountRes.count ?? 0)} />
        <StatCard label="Open Tickets" value={String(tickets.length)} />
        <StatCard
          label="SLA At Risk / Missed"
          value={`${slaAtRisk.length} / ${slaMissed.length}`}
          tone={slaMissed.length > 0 ? "error" : slaAtRisk.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Contracts Over Included Hours"
          value={String(contractsOverHours.length)}
          tone={contractsOverHours.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Pending Additional Work"
          value={String(additionalWork.length)}
          tone={additionalWork.length > 0 ? "warning" : "default"}
        />
        <StatCard label="Monthly Revenue" value={formatCurrency(revenueThisMonth)} hint="Earned this month" />
        <StatCard
          label="Monthly Profit"
          value={formatCurrency(profitThisMonth)}
          tone={profitThisMonth >= 0 ? "success" : "error"}
          hint={`Cost: ${formatCurrency(costThisMonth)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts Receivable" value={formatCurrency(ar)} />
        <StatCard label="Overdue Balance" value={formatCurrency(overdue)} tone={overdue > 0 ? "error" : "success"} />
        <StatCard label="Deferred Revenue" value={formatCurrency(deferred)} />
        <StatCard label="Unbilled Revenue" value={formatCurrency(unbilled)} />
      </div>

      <div className="mt-6">
        <ManagerCharts monthlyFinancials={monthlyFinancials} ticketsByStatus={ticketsByStatus} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Tickets Needing Attention</h2>
          {slaAtRisk.length + slaMissed.length === 0 ? (
            <EmptyState title="No SLA issues" description="Every open ticket is within its SLA window." />
          ) : (
            <DataTable headers={["Ticket", "Customer", "Priority", "SLA"]}>
              {[...slaMissed, ...slaAtRisk].slice(0, 8).map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link className="link link-hover" href={`/tickets/${t.id}`}>
                      {t.ticket_number}
                    </Link>
                  </td>
                  <td>{customerName.get(t.customer_id) ?? "—"}</td>
                  <td>
                    <StatusBadge status={t.priority} />
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
                  <td>{customerName.get(c.customer_id) ?? "—"}</td>
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
        <h2 className="mb-2 text-sm font-semibold">Pending Additional Work Approvals</h2>
        {additionalWork.length === 0 ? (
          <EmptyState title="Nothing to review" description="No additional work requests are waiting on manager approval." />
        ) : (
          <DataTable headers={["Request", "Customer", "Est. Hours", "Est. Amount", "Submitted"]}>
            {additionalWork.slice(0, 8).map((w) => (
              <tr key={w.id}>
                <td>
                  <Link className="link link-hover" href="/additional-work">
                    {w.title}
                  </Link>
                </td>
                <td>{customerName.get(w.customer_id) ?? "—"}</td>
                <td>{w.estimated_hours != null ? <Hours value={Number(w.estimated_hours)} /> : "—"}</td>
                <td>{w.estimated_amount != null ? <Money value={Number(w.estimated_amount)} /> : "—"}</td>
                <td>
                  <DateText value={w.created_at} />
                </td>
              </tr>
            ))}
          </DataTable>
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

  const [openTicketsRes, recentCompletedRes, timeEntriesRes, additionalWorkRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, title, customer_id, contract_id, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, technician_notes, customer_resolution_summary, classification"
      )
      .eq("assigned_technician_id", profile.id)
      .in("status", OPEN_TICKET_STATUSES)
      .order("target_response_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, title, customer_id, contract_id, priority, status, submitted_at, target_response_at, target_resolution_at, actual_response_at, completed_at, technician_notes, customer_resolution_summary, classification"
      )
      .eq("assigned_technician_id", profile.id)
      .in("status", ["resolved", "closed"])
      .gte("completed_at", recentCompletedSince)
      .order("completed_at", { ascending: false })
      .limit(12),
    supabase
      .from("time_entries")
      .select("id, work_date, hours_worked, description, approval_status, submitted_at, support_ticket_id, contract_id, classification")
      .eq("technician_id", profile.id)
      .or("submitted_at.is.null,approval_status.eq.pending")
      .order("work_date", { ascending: false })
      .limit(25),
    supabase
      .from("additional_work_requests")
      .select("id, title, customer_id, approval_status, created_at, estimated_hours, support_ticket_id")
      .eq("requested_by", profile.id)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false }),
  ]);

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
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
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
  const contractById = new Map((contractsRes.data ?? []).map((c) => [c.id, c]));
  const ticketLabelById = new Map(
    (ticketLabelsRes.data ?? []).map((t) => [t.id, `${t.ticket_number} · ${t.title}`])
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
        ? `${contract.contract_number ?? "Contract"} · ${contract.name}`
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

  const pendingAdditionalWork: WorkspaceAdditionalWork[] = (additionalWorkRes.data ?? []).map((w) => ({
    id: w.id,
    title: w.title,
    customer_name: addlCustomerName.get(w.customer_id) ?? "—",
    approval_status: w.approval_status,
    created_at: w.created_at,
    estimated_hours: w.estimated_hours != null ? Number(w.estimated_hours) : null,
    support_ticket_id: w.support_ticket_id,
  }));

  const contractWarnings: ContractHourWarning[] = Array.from(hoursByContract.entries())
    .map(([contractId, used]) => {
      const contract = contractById.get(contractId);
      if (!contract) return null;
      const included = Number(contract.included_hours_per_month ?? 0);
      const status = usageStatus(usagePercentage(used, included));
      if (status === "normal") return null;
      return {
        contract_id: contractId,
        label: `${contract.contract_number ?? "Contract"} · ${contract.name}`,
        used,
        included,
        status: status as "warning" | "over_limit",
      };
    })
    .filter((v): v is ContractHourWarning => v !== null);

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
        contractWarnings={contractWarnings}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

async function BillingDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  const [
    readyTimeRes,
    readyCostsRes,
    readyMilestonesRes,
    invoicesRes,
    paymentsRes,
    revenueRes,
    customersRes,
  ] = await Promise.all([
    supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("billing_status", "ready"),
    supabase.from("direct_costs").select("id", { count: "exact", head: true }).eq("billing_status", "ready"),
    supabase.from("project_milestones").select("id", { count: "exact", head: true }).eq("billing_status", "ready"),
    supabase.from("invoices").select("id, customer_id, invoice_number, status, remaining_balance, due_date, total_amount"),
    supabase.from("payments").select("payment_amount, payment_date"),
    supabase.from("revenue_records").select("recognition, amount"),
    supabase.from("customers").select("id, name"),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const invoices = (invoicesRes.data ?? []) as Pick<
    Invoice,
    "id" | "customer_id" | "invoice_number" | "status" | "remaining_balance" | "due_date" | "total_amount"
  >[];
  const payments = (paymentsRes.data ?? []) as Pick<Payment, "payment_amount" | "payment_date">[];
  const revenue = (revenueRes.data ?? []) as Pick<RevenueRecord, "recognition" | "amount">[];

  const readyToBill = (readyTimeRes.count ?? 0) + (readyCostsRes.count ?? 0) + (readyMilestonesRes.count ?? 0);
  const draftInvoices = invoices.filter((i) => i.status === "draft");
  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const partialInvoices = invoices.filter((i) => i.status === "partially_paid");
  const disputedInvoices = invoices.filter((i) => i.status === "disputed");

  const monthKeyNow = lastNMonthKeys(1)[0];
  const paymentsThisMonth = payments
    .filter((p) => monthKey(p.payment_date) === monthKeyNow)
    .reduce((sum, p) => sum + Number(p.payment_amount), 0);

  const agingBuckets = ["Current", "1–30 Days Past Due", "31–60 Days Past Due", "61–90 Days Past Due", "More Than 90 Days Past Due"];
  const agingSummary = agingBuckets.map((bucket) => ({
    bucket,
    total: invoices
      .filter((i) => Number(i.remaining_balance) > 0 && !["draft", "canceled"].includes(i.status) && arAgingBucket(i.due_date) === bucket)
      .reduce((sum, i) => sum + Number(i.remaining_balance), 0),
  }));

  const deferred = revenue.filter((r) => r.recognition === "deferred").reduce((sum, r) => sum + Number(r.amount), 0);
  const unbilled = revenue.filter((r) => r.recognition === "unbilled").reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <PageHeader title="Billing Dashboard" description={`Welcome back, ${profile.full_name}. Here's the state of billing and collections.`} />

      <p className="mb-4 text-sm">
        <Link href="/billing-review" className="link link-primary">
          Open Billing Review
        </Link>
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ready to Bill" value={String(readyToBill)} tone={readyToBill > 0 ? "warning" : "default"} />
        <StatCard label="Draft Invoices" value={String(draftInvoices.length)} />
        <StatCard label="Overdue Invoices" value={String(overdueInvoices.length)} tone={overdueInvoices.length > 0 ? "error" : "success"} />
        <StatCard label="Partially Paid" value={String(partialInvoices.length)} />
        <StatCard label="Disputed Invoices" value={String(disputedInvoices.length)} tone={disputedInvoices.length > 0 ? "error" : "default"} />
        <StatCard label="Payments This Month" value={formatCurrency(paymentsThisMonth)} tone="success" />
        <StatCard label="Deferred Revenue" value={formatCurrency(deferred)} />
        <StatCard label="Unbilled Revenue" value={formatCurrency(unbilled)} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Accounts Receivable Aging</h2>
        <DataTable headers={["Bucket", "Balance"]}>
          {agingSummary.map((row) => (
            <tr key={row.bucket}>
              <td>{row.bucket}</td>
              <td>
                <Money value={row.total} />
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Overdue Invoices</h2>
          {overdueInvoices.length === 0 ? (
            <EmptyState title="Nothing overdue" description="All invoices are within terms." />
          ) : (
            <DataTable headers={["Invoice", "Customer", "Balance", "Due"]}>
              {overdueInvoices.slice(0, 8).map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="link link-hover" href="/invoices">
                      {i.invoice_number}
                    </Link>
                  </td>
                  <td>{customerName.get(i.customer_id) ?? "—"}</td>
                  <td>
                    <Money value={Number(i.remaining_balance)} />
                  </td>
                  <td>
                    <DateText value={i.due_date} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Disputed Invoices</h2>
          {disputedInvoices.length === 0 ? (
            <EmptyState title="No open disputes" />
          ) : (
            <DataTable headers={["Invoice", "Customer", "Balance"]}>
              {disputedInvoices.slice(0, 8).map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link className="link link-hover" href="/invoices">
                      {i.invoice_number}
                    </Link>
                  </td>
                  <td>{customerName.get(i.customer_id) ?? "—"}</td>
                  <td>
                    <Money value={Number(i.remaining_balance)} />
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
  const monthStart = `${lastNMonthKeys(1)[0]}-01`;
  const customerId = profile.customer_id;

  const [contractsRes, ticketsRes, projectsRes, invoicesRes, paymentsRes, disputesRes, timeEntriesRes, revenueRes] =
    await Promise.all([
      supabase.from("contracts").select("id, name, contract_number, status, included_hours_per_month").eq("customer_id", customerId).eq("status", "active"),
      supabase.from("support_tickets").select("id, ticket_number, title, priority, status").eq("customer_id", customerId).in("status", OPEN_TICKET_STATUSES),
      supabase.from("projects").select("id, name, status").eq("customer_id", customerId),
      supabase.from("invoices").select("id, remaining_balance, status").eq("customer_id", customerId),
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
  const invoices = (invoicesRes.data ?? []) as Pick<Invoice, "id" | "remaining_balance" | "status">[];
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
    .filter((i) => !["draft", "canceled"].includes(i.status))
    .reduce((sum, i) => sum + Number(i.remaining_balance), 0);
  const openDisputes = disputes.filter((d) => d.resolution_status !== "resolved" && d.resolution_status !== "rejected");

  const currentMonthKey = lastNMonthKeys(1)[0];
  const monthlyAmount = revenue
    .filter((r) => r.recognition === "earned" && monthKey(r.period_month) === currentMonthKey)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div>
      <PageHeader title="Customer Home" description={`Welcome back, ${profile.full_name}. Here's your account at a glance.`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Contracts" value={String(contracts.length)} />
        <StatCard label="Open Support Requests" value={String(tickets.length)} />
        <StatCard label="Active Projects" value={String(projects.filter((p) => !["closed", "canceled"].includes(p.status)).length)} />
        <StatCard label="Invoice Balance Due" value={formatCurrency(invoiceBalance)} tone={invoiceBalance > 0 ? "warning" : "success"} />
        <StatCard label="Open Disputes" value={String(openDisputes.length)} tone={openDisputes.length > 0 ? "error" : "default"} />
        <StatCard label="This Month's Service Charges" value={formatCurrency(monthlyAmount)} />
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
                      {t.ticket_number} · {t.title}
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
