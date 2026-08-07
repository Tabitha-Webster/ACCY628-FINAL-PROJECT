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
  DateText,
} from "@/components/ui";
import { CustomerHomeVisuals } from "@/components/CustomerHomeVisuals";
import { ExecutiveDashboardVisuals } from "@/components/ExecutiveDashboardVisuals";
import { HrHomeVisuals } from "@/components/HrHomeVisuals";
import { BillingHomeVisuals } from "@/components/BillingHomeVisuals";
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
  evaluateTechnicianTicketSla,
  withDemoSlaTargets,
  localDateKey,
  localDateKeyFromIso,
} from "@/lib/sla";
import { formatCurrency } from "@/lib/format";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  daysWaitingForExecutiveSignature,
  EXECUTIVE_SIGNATURE_OVERDUE_DAYS,
  fetchContractReportMetrics,
  listAwaitingExecutiveSignatures,
  listOpenContractCompletionRequests,
  summarizeContractsByStatus,
} from "@/lib/contracts";
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
import { loadContractHoursForMatch, rankDemoApplicants } from "@/lib/hr-applicants";
import type {
  AdditionalWorkRequest,
  Contract,
  ContractStatus,
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
  if (profile.role === "executive") return <ExecutiveDashboard profile={profile} />;
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
// Executive
// ---------------------------------------------------------------------------

async function ExecutiveDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();

  const [
    { data: pending },
    { count: activeContractsCount },
    { data: activeContractRows },
    { count: activeCustomersCount },
    { data: invoiceRows },
    { count: awaitingCustomerCount },
    { data: allContractStatusRows },
  ] = await Promise.all([
    listAwaitingExecutiveSignatures(supabase).then((res) => ({ data: res.data })),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("contracts")
      .select("id, contract_number, name, monthly_recurring_fee, end_date, customer_id, customers(name)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, remaining_balance, due_date, customers(name)"),
    supabase
      .from("contract_signature_packets")
      .select("id", { count: "exact", head: true })
      .eq("is_current", true)
      .eq("status", "awaiting_customer"),
    supabase.from("contracts").select("id, status"),
  ]);

  const openInvoices = (invoiceRows ?? []).filter(
    (invoice) =>
      !["draft", "canceled", "paid"].includes(invoice.status) &&
      Number(invoice.remaining_balance) > 0.01
  );
  const totalAr = openInvoices.reduce((sum, invoice) => sum + Number(invoice.remaining_balance), 0);
  const overdueAr = openInvoices
    .filter((invoice) => invoice.due_date != null && invoice.due_date < todayStr)
    .reduce((sum, invoice) => sum + Number(invoice.remaining_balance), 0);

  const mrr = (activeContractRows ?? []).reduce(
    (sum, contract) => sum + Number(contract.monthly_recurring_fee ?? 0),
    0
  );

  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  const in90Key = in90.toISOString().slice(0, 10);
  const expiringSoon = (activeContractRows ?? []).filter(
    (contract) => contract.end_date && contract.end_date >= todayStr && contract.end_date <= in90Key
  );

  const statusCounts = summarizeContractsByStatus(
    (allContractStatusRows ?? []) as Array<{ status: ContractStatus }>
  );
  const portfolioSlices = CONTRACT_STATUSES.map((status) => ({
    status,
    count: statusCounts[status] ?? 0,
    label: CONTRACT_STATUS_LABELS[status],
  })).filter((row) => row.count > 0);

  const now = new Date();
  const signatureQueue = (pending ?? []).map((item) => {
    const days = daysWaitingForExecutiveSignature(item.waitingSince, now);
    const overdue = days != null && days > EXECUTIVE_SIGNATURE_OVERDUE_DAYS;
    return {
      id: item.id,
      ticketNumber: item.contractNumber,
      title: item.contractName,
      customer: item.customerName,
      priority: overdue ? "critical" : item.readyToSign ? "high" : "medium",
      sla: overdue
        ? `Over ${EXECUTIVE_SIGNATURE_OVERDUE_DAYS} days`
        : item.readyToSign
          ? "Ready to sign"
          : "Needs manager",
      href: `/contracts/${item.contractId}#pdf-signatures`,
    };
  });

  const companySnapshot = [
    {
      id: "awaiting-customer",
      label: `${awaitingCustomerCount ?? 0} awaiting customer signature`,
      detail: "Released to customers in My Contracts",
      href: "/contracts?status=pending_approval",
    },
    {
      id: "total-ar",
      label: `AR ${formatCurrency(totalAr)}`,
      detail: "Open invoice balances",
      href: "/accounts-receivable",
    },
    {
      id: "active-customers",
      label: `${activeCustomersCount ?? 0} active customers`,
      detail: "Company customer base",
      href: "/customers",
    },
  ];

  const expiringRows = expiringSoon.slice(0, 3).map((contract) => {
    const customer = Array.isArray(contract.customers)
      ? contract.customers[0]
      : contract.customers;
    return {
      id: contract.id as string,
      name: contract.name as string,
      customer: customer?.name ?? "Customer",
      used: 0,
      included: 0,
      pct: 0,
      href: `/contracts/${contract.id}`,
      meta: contract.end_date ? String(contract.end_date) : "—",
    };
  });

  return (
    <ExecutiveDashboardVisuals
      title="Executive Dashboard"
      fullName={profile.full_name}
      overdueBalance={overdueAr}
      year={year}
      metrics={[
        {
          label: "Awaiting Your Signature",
          value: String(pending.length),
          href: "/contracts/awaiting-signature",
          tone: pending.length ? "amber" : "emerald",
          hint: pending.length ? "Review and sign queue" : "Caught up",
        },
        {
          label: "Awaiting Customer",
          value: String(awaitingCustomerCount ?? 0),
          href: "/contracts?status=pending_approval",
          tone: (awaitingCustomerCount ?? 0) > 0 ? "violet" : "sky",
          hint: "Customer acceptance pending",
        },
        {
          label: "Active Contracts",
          value: String(activeContractsCount ?? 0),
          href: "/contracts?status=active",
          tone: "sky",
          hint: mrr > 0 ? `${formatCurrency(mrr)} MRR` : undefined,
        },
        {
          label: "Expiring in 90 Days",
          value: String(expiringSoon.length),
          href: "/contracts/renewals",
          tone: expiringSoon.length ? "rose" : "emerald",
          hint: "Renewal and expiration watch",
        },
      ]}
      ticketStatusSlices={portfolioSlices}
      attentionTickets={signatureQueue}
      hoursAtRisk={expiringRows}
      approvals={companySnapshot}
      pendingApprovalsTotal={pending.length}
      overdueHref="/accounts-receivable"
      chartTitle={`Contract Portfolio (${year})`}
      chartEmptyMessage="No contracts on file yet."
      primaryQueueTitle="Awaiting Your Signature"
      primaryQueueHref="/contracts/awaiting-signature"
      primaryQueueEmpty="No contracts are waiting for your signature."
      secondaryQueueTitle="Portfolio Attention"
      secondaryQueueHref="/contracts/renewals"
      secondaryQueueLinkLabel={`${expiringSoon.length} expiring`}
      secondaryPrimaryHeading="Company snapshot"
      secondaryPrimaryEmpty="Nothing to review."
      secondarySecondaryHeading="Expiring within 90 days"
      secondarySecondaryEmpty="No active contracts expire in the next 90 days."
      showHoursAsProgress={false}
      showFinancialChart={false}
    />
  );
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

async function HrDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const [
    { data: contractors },
    { data: positions },
    { data: departments },
    contractHours,
  ] = await Promise.all([
    supabase.from("hr_contractors").select("id, status"),
    supabase.from("hr_positions").select("id, title, status, department_id"),
    supabase.from("hr_departments").select("id, name"),
    loadContractHoursForMatch(supabase),
  ]);

  const activeCount = (contractors ?? []).filter((c) => c.status === "active").length;
  const openPositions = (positions ?? []).filter((p) => p.status === "open");
  const openCount = openPositions.length;
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const openTitles = openPositions.map((p) => p.title);

  const rankedApplicants = rankDemoApplicants({
    contractHours,
    openPositionTitles: openTitles,
  });
  const topApplicants = rankedApplicants.slice(0, 5);
  const topMatch = rankedApplicants[0]?.matchPercent ?? 0;
  const strongMatches = rankedApplicants.filter((a) => a.matchPercent >= 72).length;

  return (
    <HrHomeVisuals
      fullName={profile.full_name}
      pipeline={{
        openRoles: openCount,
        applicants: rankedApplicants.length,
        strongMatches,
        activeContractors: activeCount,
      }}
      metrics={[
        {
          label: "Active contractors",
          value: String(activeCount),
          tone: "sky",
          href: "/admin/hr",
        },
        {
          label: "Open positions",
          value: String(openCount),
          tone: openCount > 0 ? "amber" : "emerald",
          href: "/hr-positions",
        },
        {
          label: "Applicants",
          value: String(rankedApplicants.length),
          tone: "violet",
          href: "/hr-applicants",
        },
        {
          label: "Top match",
          value: `${topMatch}%`,
          tone: topMatch >= 72 ? "emerald" : "rose",
          href: "/hr-applicants",
        },
      ]}
      applicants={topApplicants.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        appliedFor: a.appliedFor,
        matchPercent: a.matchPercent,
        stars: a.stars,
      }))}
      openRoles={openPositions.map((p) => ({
        id: p.id,
        title: p.title,
        department: deptName.get(p.department_id) ?? "—",
      }))}
    />
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
    invoicesRes,
    activeContractsRes,
    customersRes,
    contractReportRes,
    proposedProjectsRes,
    awaitingCustomerRes,
    pendingMilestonesRes,
    completionRequestsRes,
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
      .select("contract_id, customer_id, hours_worked, classification, work_date")
      .gte("work_date", rangeStart),
    supabase
      .from("invoices")
      .select("id, customer_id, invoice_number, status, remaining_balance, due_date, amount_paid, dispute_status"),
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
    listOpenContractCompletionRequests(supabase),
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
  const completionRequests = completionRequestsRes.data ?? [];
  const pendingApprovalsTotal =
    additionalWork.length +
    projectsNeedingCustomerAction.length +
    pendingMilestones.length +
    completionRequests.length;
  const timeEntries = (timeEntriesRes.data ?? []) as Pick<
    TimeEntry,
    "contract_id" | "customer_id" | "hours_worked" | "classification" | "work_date"
  >[];
  const invoices = (invoicesRes.data ?? []).map((invoice) => withDerivedInvoiceStatus(invoice));
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = invoices
    .filter(
      (i) =>
        !["draft", "canceled", "paid"].includes(i.status) &&
        Number(i.remaining_balance) > 0 &&
        i.due_date < todayStr
    )
    .reduce((sum, i) => sum + Number(i.remaining_balance), 0);

  const ticketStatusSlices = OPEN_TICKET_STATUSES.map((status) => ({
    status,
    count: tickets.filter((t) => t.status === status).length,
  })).filter((row) => row.count > 0);

  const approvalChips = [
    ...completionRequests.slice(0, 4).map((r) => ({
      id: `cc-${r.id}`,
      label: r.contract_name,
      detail: `${r.contract_number ?? "Contract"} · ready to complete`,
      href: `/contracts/${r.contract_id}`,
    })),
    ...additionalWork.slice(0, 4).map((w) => ({
      id: `aw-${w.id}`,
      label: w.title,
      detail: customerName.get(w.customer_id) ?? "Additional work",
      href: w.project_id ? `/projects/${w.project_id}` : "/additional-work",
    })),
    ...projectsNeedingCustomerAction.slice(0, 4).map((p) => ({
      id: `proj-${p.id}`,
      label: p.name,
      detail: customerName.get(p.customer_id) ?? "Project approval",
      href: `/projects/${p.id}`,
    })),
    ...pendingMilestones.slice(0, 4).map((m) => {
      const project = Array.isArray(m.projects) ? m.projects[0] : m.projects;
      return {
        id: `ms-${m.id}`,
        label: m.name,
        detail: project?.name ?? "Milestone",
        href: `/projects/${m.project_id}`,
      };
    }),
  ].slice(0, 4);

  return (
    <ExecutiveDashboardVisuals
      fullName={profile.full_name}
      overdueBalance={overdue}
      year={new Date().getFullYear()}
      metrics={[
        {
          label: "Active Customers",
          value: String(customersCountRes.count ?? 0),
          href: "/customers",
          tone: "sky",
        },
        {
          label: "Active Contracts",
          value: String(contractsCountRes.count ?? 0),
          href: "/contracts?status=active",
          tone: "violet",
          hint:
            contractMetrics.monthlyRecurringRevenue > 0
              ? `${formatCurrency(contractMetrics.monthlyRecurringRevenue)} MRR`
              : undefined,
        },
        {
          label: "Open Tickets",
          value: String(tickets.length),
          href: "/tickets",
          tone: "rose",
          hint: `${slaMissed.length} missed · ${slaAtRisk.length} at risk`,
        },
        {
          label: "Pending Approvals",
          value: String(pendingApprovalsTotal),
          href: "/projects",
          tone: pendingApprovalsTotal > 0 ? "amber" : "emerald",
          hint: pendingApprovalsTotal > 0 ? "Work, projects, milestones" : "Queue clear",
        },
      ]}
      ticketStatusSlices={ticketStatusSlices}
      attentionTickets={ticketsNeedingAttention.slice(0, 5).map((t) => ({
        id: t.id,
        ticketNumber: t.ticket_number,
        title: t.title,
        customer: customerName.get(t.customer_id) ?? "Customer",
        priority: t.priority,
        sla: ticketSlaSeverity(t),
      }))}
      hoursAtRisk={contractsOverHours.slice(0, 3).map((c) => ({
        id: c.id,
        name: c.name,
        customer: customerName.get(c.customer_id) ?? "Customer",
        used: c.used,
        included: Number(c.included_hours_per_month),
        pct: c.pct,
      }))}
      approvals={approvalChips}
      pendingApprovalsTotal={pendingApprovalsTotal}
      showFinancialChart={false}
    />

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
    const display = withDemoSlaTargets(t);
    const live = evaluateTechnicianTicketSla(display);
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
      submitted_at: display.submitted_at,
      target_response_at: display.target_response_at,
      target_resolution_at: display.target_resolution_at,
      actual_response_at: display.actual_response_at,
      completed_at: display.completed_at,
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

  const [review, invoicesRes, paymentsRes, customersRes] = await Promise.all([
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
    supabase.from("customers").select("id, name"),
  ]);

  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name as string]));
  const invoices = (invoicesRes.data ?? [])
    .map((invoice) => withDerivedInvoiceStatus(invoice))
    .filter((invoice) => dateInDashboardPeriod(invoice.billing_period_start || invoice.invoice_date, period));
  const payments = ((paymentsRes.data ?? []) as Pick<Payment, "payment_number" | "payment_amount" | "payment_date" | "customer_id">[]).filter(
    (payment) => dateInDashboardPeriod(payment.payment_date, period)
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

  return (
    <BillingHomeVisuals
      fullName={profile.full_name}
      periodLabel={period.label}
      periodActions={<PeriodViewControls {...periodViewControlProps(period)} />}
      statusBits={statusBits}
      metrics={[
        {
          label: "Ready to Bill",
          value: String(readyToBill),
          hint: `${formatCurrency(readyToBillAmount)} · ${period.label}`,
          href: "/billing-review",
          tone: readyToBill > 0 ? "amber" : "slate",
          explanation: readyExplanation,
        },
        {
          label: "Accounts Receivable",
          value: formatCurrency(totalAr),
          hint: `Past due ${formatCurrency(pastDueAr)}`,
          href: "/accounts-receivable",
          tone: "violet",
          explanation: arExplanation,
        },
        {
          label: "Payments",
          value: formatCurrency(paymentsInPeriod),
          hint: period.label,
          href: "/payments",
          tone: "emerald",
          explanation: paymentsExplanation,
        },
        {
          label: "Overdue",
          value: formatCurrency(overdueBalance),
          hint: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`,
          href: "/accounts-receivable",
          tone: overdueInvoices.length > 0 ? "rose" : "emerald",
          explanation: overdueExplanation,
        },
        {
          label: "Draft Invoices",
          value: String(draftInvoices.length),
          hint: "Review before sending",
          href: "/invoices",
          tone: draftInvoices.length > 0 ? "amber" : "sky",
          explanation: draftExplanation,
        },
      ]}
      aging={agingSummary.map((row) => ({
        bucket: row.bucket,
        total: row.total,
        count: row.invoices.length,
      }))}
      attention={[
        ...packagesReady.slice(0, 2).map((pkg) => ({
          id: `pkg-${pkg.contractId}`,
          title: "Ready to bill package",
          detail: `${pkg.customerName} · ${pkg.contractName}`,
          amount: formatCurrency(pkg.estimatedTotal),
          href: "/billing-review",
          severity: "warning" as const,
        })),
        ...review.exceptions.slice(0, 2).map((exception) => ({
          id: exception.id,
          title: "Pending approval",
          detail: `${exception.customerName} · ${exception.reason}`,
          href: "/billing-review",
          severity: "warning" as const,
        })),
        ...sortedOverdue.slice(0, 2).map((invoice) => ({
          id: invoice.id,
          title: invoice.invoice_number,
          detail: `${customerName.get(invoice.customer_id) ?? "Customer"} · ${invoiceDaysPastDue(invoice.due_date)} days past due`,
          amount: formatCurrency(Number(invoice.remaining_balance)),
          href: `/invoices/${invoice.id}`,
          severity: "error" as const,
        })),
        ...disputedInvoices.slice(0, 2).map((invoice) => ({
          id: `dispute-${invoice.id}`,
          title: "Disputed invoice",
          detail: `${invoice.invoice_number} · ${customerName.get(invoice.customer_id) ?? "Customer"}`,
          amount: formatCurrency(Number(invoice.remaining_balance)),
          href: `/invoices/${invoice.id}`,
          severity: "error" as const,
        })),
      ]}
      collection={{
        billed: issuedTotal,
        collected: paymentsInPeriod,
        outstanding: totalAr,
      }}
    />
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
  const linkedCustomerRes = await supabase
    .from("customers")
    .select("id, name, status")
    .eq("id", profile.customer_id)
    .maybeSingle();
  const linkedCustomer = linkedCustomerRes.data;

  if (linkedCustomer?.status === "pending_approval" || linkedCustomer?.status === "rejected") {
    redirect("/pending-approval");
  }

  const monthStart = `${lastNMonthKeys(1)[0]}-01`;
  const customerId = profile.customer_id;
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01T00:00:00.000Z`;

  const [contractsRes, ticketsRes, yearTicketsRes, projectsRes, invoicesRes, disputesRes, timeEntriesRes, revenueRes] =
    await Promise.all([
      supabase.from("contracts").select("id, name, contract_number, status, included_hours_per_month").eq("customer_id", customerId).eq("status", "active"),
      supabase.from("support_tickets").select("id, ticket_number, title, priority, status").eq("customer_id", customerId).in("status", OPEN_TICKET_STATUSES),
      supabase
        .from("support_tickets")
        .select("id, status, submitted_at")
        .eq("customer_id", customerId)
        .gte("submitted_at", yearStart),
      supabase.from("projects").select("id, name, status").eq("customer_id", customerId),
      supabase
        .from("invoices")
        .select("id, invoice_number, remaining_balance, status, due_date, amount_paid, total_amount, dispute_status")
        .eq("customer_id", customerId),
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
  const yearTickets = (yearTicketsRes.data ?? []) as Pick<SupportTicket, "id" | "status" | "submitted_at">[];
  const projects = (projectsRes.data ?? []) as Pick<Project, "id" | "name" | "status">[];
  const invoices = (invoicesRes.data ?? []).map((invoice) => withDerivedInvoiceStatus(invoice));
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
  const activeProjects = projects.filter((p) => !["closed", "canceled"].includes(p.status));

  const currentMonthKey = lastNMonthKeys(1)[0];
  const monthlyAmount = revenue
    .filter((r) => r.recognition === "earned" && monthKey(r.period_month) === currentMonthKey)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const ticketsByStatusMap = new Map<string, number>();
  for (const ticket of yearTickets) {
    ticketsByStatusMap.set(ticket.status, (ticketsByStatusMap.get(ticket.status) ?? 0) + 1);
  }
  const supportStatusSlices = Array.from(ticketsByStatusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  const billableInvoices = invoices.filter((i) => !["draft", "canceled"].includes(i.status));
  let invoicePaid = 0;
  let invoiceTotalBilled = 0;
  for (const invoice of billableInvoices) {
    const paid = Number(invoice.amount_paid ?? 0);
    const remaining = Number(invoice.remaining_balance ?? 0);
    const listedTotal = Number(
      (invoice as { total_amount?: number | string | null }).total_amount ?? 0
    );
    const total = listedTotal > 0 ? listedTotal : paid + remaining;
    invoicePaid += Math.max(0, paid);
    invoiceTotalBilled += Math.max(0, total);
  }
  // Prefer sum of line totals; fall back so the bar never divides by zero when paid > 0
  if (invoiceTotalBilled < invoicePaid) {
    invoiceTotalBilled = invoicePaid;
  }
  const invoiceRemaining = Math.max(0, invoiceTotalBilled - invoicePaid);

  return (
    <CustomerHomeVisuals
      fullName={profile.full_name}
      invoiceBalance={invoiceBalance}
      year={year}
      metrics={[
        {
          label: "Active Contracts",
          value: String(contracts.length),
          href: "/my-contracts",
          tone: "sky",
        },
        {
          label: "Active Projects",
          value: String(activeProjects.length),
          href: "/my-projects",
          tone: "violet",
        },
        {
          label: "Open Disputes",
          value: String(openDisputes.length),
          tone: openDisputes.length > 0 ? "rose" : "emerald",
        },
        {
          label: "Service Charges",
          value: formatCurrency(monthlyAmount),
          hint: "This month",
          tone: "amber",
        },
      ]}
      supportStatusSlices={supportStatusSlices}
      contracts={contractsWithUsage.map((c) => ({
        id: c.id,
        name: c.name,
        used: c.used,
        included: Number(c.included_hours_per_month ?? 0),
        remaining: c.remaining,
        pct: c.pct,
        status: c.status,
      }))}
      requests={tickets.slice(0, 5).map((t) => ({
        id: t.id,
        ticketNumber: t.ticket_number,
        title: t.title,
        priority: t.priority,
        status: t.status,
      }))}
      invoicePayment={{
        total: invoiceTotalBilled,
        paid: invoicePaid,
        remaining: invoiceRemaining,
        invoiceCount: billableInvoices.length,
      }}
    />
  );
}
