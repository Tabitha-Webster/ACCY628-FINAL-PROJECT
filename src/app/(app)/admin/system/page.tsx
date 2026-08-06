import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, OPEN_TICKET_STATUSES } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";

type HealthTone = "success" | "warning" | "error" | "default";

type HealthRow = {
  id: string;
  name: string;
  detail: string;
  status: string;
  tone: HealthTone;
  meta?: string;
};

type Probe = { ok: boolean; message?: string; count?: number };

async function headCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
): Promise<Probe> {
  const { error, count } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true, count: count ?? 0 };
}

function badgeClass(tone: HealthTone) {
  if (tone === "success") return "badge-success";
  if (tone === "warning") return "badge-warning";
  if (tone === "error") return "badge-error";
  return "badge-ghost";
}

function rowBorder(tone: HealthTone) {
  if (tone === "error") return "border-error/40";
  if (tone === "warning") return "border-warning/40";
  if (tone === "success") return "border-success/30";
  return "border-base-300";
}

export default async function AdminSystemHealthPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    profilesProbe,
    customersProbe,
    contractsProbe,
    ticketsProbe,
    timeProbe,
    costsProbe,
    invoicesProbe,
    paymentsProbe,
    paymentAppsProbe,
    disputesProbe,
    profilesRes,
    customersRes,
    contractsRes,
    ticketsRes,
    pendingWorkRes,
    pendingTimeRes,
    pendingCostsRes,
    invoicesRes,
    disputesRes,
    projectsRes,
    recentInvoicesRes,
    recentPaymentsRes,
    recentTimeRes,
    contractsMissingCustomer,
    paymentsWithoutApps,
    orphanTimeRes,
  ] = await Promise.all([
    headCount(supabase, "profiles"),
    headCount(supabase, "customers"),
    headCount(supabase, "contracts"),
    headCount(supabase, "support_tickets"),
    headCount(supabase, "time_entries"),
    headCount(supabase, "direct_costs"),
    headCount(supabase, "invoices"),
    headCount(supabase, "payments"),
    headCount(supabase, "payment_applications"),
    headCount(supabase, "disputes"),
    supabase.from("profiles").select("id, role, is_active, is_demo_user"),
    supabase.from("customers").select("id, status"),
    supabase.from("contracts").select("id, status, end_date, customer_id"),
    supabase.from("support_tickets").select("id, status").in("status", OPEN_TICKET_STATUSES),
    supabase.from("additional_work_requests").select("id").eq("approval_status", "pending"),
    supabase.from("time_entries").select("id").eq("approval_status", "pending"),
    supabase.from("direct_costs").select("id").eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, due_date, remaining_balance, customers(name)")
      .in("status", ["issued", "partially_paid", "overdue"])
      .gt("remaining_balance", 0)
      .order("due_date", { ascending: true })
      .limit(8),
    supabase.from("disputes").select("id").in("resolution_status", ["open", "under_review"]),
    supabase.from("projects").select("id, status").not("status", "in", "(closed,canceled)"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .gte("payment_date", thirtyDaysAgo),
    supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .gte("work_date", thirtyDaysAgo),
    supabase.from("contracts").select("id, customer_id").not("customer_id", "is", null),
    supabase.from("payments").select("id, payment_applications(id)"),
    supabase
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .is("customer_id", null),
  ]);

  const loadError =
    profilesRes.error ||
    customersRes.error ||
    contractsRes.error ||
    ticketsRes.error ||
    pendingWorkRes.error ||
    pendingTimeRes.error ||
    pendingCostsRes.error ||
    invoicesRes.error ||
    disputesRes.error ||
    projectsRes.error;

  const profiles = profilesRes.data ?? [];
  const customers = customersRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const openInvoices = invoicesRes.data ?? [];
  const overdueInvoices = openInvoices.filter((i) => i.due_date < today || i.status === "overdue");
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const endingSoon = contracts.filter(
    (c) =>
      c.status === "active" &&
      c.end_date &&
      c.end_date <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
  ).length;
  const pendingApprovals =
    (pendingWorkRes.data?.length ?? 0) +
    (pendingTimeRes.data?.length ?? 0) +
    (pendingCostsRes.data?.length ?? 0);

  const customerIds = new Set(customers.map((c) => c.id));
  const contractsWithMissingCustomer = (contractsMissingCustomer.data ?? []).filter(
    (c) => c.customer_id && !customerIds.has(c.customer_id)
  ).length;
  const unappliedPaymentCount = (paymentsWithoutApps.data ?? []).filter((payment) => {
    const apps = payment.payment_applications;
    return !Array.isArray(apps) || apps.length === 0;
  }).length;

  const jobs: HealthRow[] = [
    {
      id: "job-invoice-gen",
      name: "Monthly invoice generation",
      detail: "Creates draft invoices from active contracts and approved billable work.",
      status: !invoicesProbe.ok
        ? "Failed"
        : (recentInvoicesRes.count ?? 0) > 0
          ? "Running"
          : "Idle",
      tone: !invoicesProbe.ok ? "error" : (recentInvoicesRes.count ?? 0) > 0 ? "success" : "warning",
      meta: invoicesProbe.ok
        ? `${recentInvoicesRes.count ?? 0} invoice(s) created in last 7 days`
        : invoicesProbe.message,
    },
    {
      id: "job-approvals",
      name: "Approvals clearance",
      detail: "Moves pending time, costs, and additional work through the approval gate.",
      status: pendingApprovals > 0 ? "Backlog" : "Clear",
      tone: pendingApprovals > 0 ? "warning" : "success",
      meta: `${pendingApprovals} item(s) waiting`,
    },
    {
      id: "job-renewals",
      name: "Contract renewal sweep",
      detail: "Flags active agreements ending soon so renewals can be processed.",
      status: endingSoon > 0 ? "Attention" : "Clear",
      tone: endingSoon > 0 ? "warning" : "success",
      meta: `${endingSoon} contract(s) ending within 60 days`,
    },
    {
      id: "job-collections",
      name: "Collections / overdue scan",
      detail: "Surfaces open AR past due so cash application can continue.",
      status: overdueInvoices.length > 0 ? "Attention" : "Clear",
      tone: overdueInvoices.length > 0 ? "warning" : "success",
      meta: `${overdueInvoices.length} overdue invoice(s)`,
    },
    {
      id: "job-time-capture",
      name: "Time & cost capture",
      detail: "Accepts technician time and direct costs that feed ready-to-bill.",
      status: !timeProbe.ok || !costsProbe.ok ? "Failed" : "Healthy",
      tone: !timeProbe.ok || !costsProbe.ok ? "error" : "success",
      meta:
        timeProbe.ok && costsProbe.ok
          ? `${recentTimeRes.count ?? 0} time entr(y/ies) in last 30 days`
          : timeProbe.message || costsProbe.message,
    },
    {
      id: "job-payment-post",
      name: "Payment posting",
      detail: "Records customer payments and applies them to open invoices.",
      status: !paymentsProbe.ok || !paymentAppsProbe.ok ? "Failed" : "Healthy",
      tone: !paymentsProbe.ok || !paymentAppsProbe.ok ? "error" : "success",
      meta:
        paymentsProbe.ok
          ? `${recentPaymentsRes.count ?? 0} payment(s) in last 30 days`
          : paymentsProbe.message || paymentAppsProbe.message,
    },
  ];

  const syncs: HealthRow[] = [
    {
      id: "sync-customer-contract",
      name: "Customer ↔ contract sync",
      detail: "Every contract must resolve to a customer master record.",
      status: contractsWithMissingCustomer > 0 ? "Out of sync" : "In sync",
      tone: contractsWithMissingCustomer > 0 ? "error" : "success",
      meta:
        contractsWithMissingCustomer > 0
          ? `${contractsWithMissingCustomer} contract(s) point at missing customers`
          : `${contracts.length} contract link(s) verified`,
    },
    {
      id: "sync-payment-app",
      name: "Payment ↔ invoice sync",
      detail: "Cash application must attach each payment to at least one invoice.",
      status: unappliedPaymentCount > 0 ? "Out of sync" : "In sync",
      tone: unappliedPaymentCount > 0 ? "error" : "success",
      meta:
        unappliedPaymentCount > 0
          ? `${unappliedPaymentCount} payment(s) with no invoice application`
          : "All payments have applications",
    },
    {
      id: "sync-time-customer",
      name: "Time entry ↔ customer sync",
      detail: "Billable time must belong to a customer for invoicing.",
      status: (orphanTimeRes.count ?? 0) > 0 ? "Out of sync" : "In sync",
      tone: (orphanTimeRes.count ?? 0) > 0 ? "warning" : "success",
      meta:
        (orphanTimeRes.count ?? 0) > 0
          ? `${orphanTimeRes.count} time entr(y/ies) missing customer_id`
          : "Time entries linked to customers",
    },
    {
      id: "sync-delivery-billing",
      name: "Delivery ↔ billing handoff",
      detail: "Tickets, time, and costs must remain readable for invoice generation.",
      status: ticketsProbe.ok && timeProbe.ok && costsProbe.ok && invoicesProbe.ok ? "In sync" : "Broken",
      tone:
        ticketsProbe.ok && timeProbe.ok && costsProbe.ok && invoicesProbe.ok ? "success" : "error",
      meta:
        ticketsProbe.ok && timeProbe.ok && costsProbe.ok && invoicesProbe.ok
          ? "Delivery and invoice stores are reachable"
          : "One or more C2C stores failed to respond",
    },
    {
      id: "sync-dispute-ar",
      name: "Dispute ↔ AR sync",
      detail: "Open disputes must stay tied to the receivables ledger.",
      status: disputesProbe.ok && invoicesProbe.ok ? "In sync" : "Broken",
      tone: disputesProbe.ok && invoicesProbe.ok ? "success" : "error",
      meta: `${disputesRes.data?.length ?? 0} open dispute(s)`,
    },
  ];

  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const coreReachable =
    profilesProbe.ok && customersProbe.ok && contractsProbe.ok && invoicesProbe.ok;

  const environment: HealthRow[] = [
    {
      id: "env-runtime",
      name: "App runtime",
      detail: "Next.js process and deployment mode for this workspace.",
      status: process.env.NODE_ENV === "production" ? "Production" : "Development",
      tone: "success",
      meta: `NODE_ENV=${process.env.NODE_ENV ?? "unknown"}`,
    },
    {
      id: "env-supabase-config",
      name: "Supabase configuration",
      detail: "Public project URL and anon key required for auth and data access.",
      status: hasUrl && hasAnon ? "Configured" : "Missing config",
      tone: hasUrl && hasAnon ? "success" : "error",
      meta: [
        hasUrl ? "URL present" : "URL missing",
        hasAnon ? "anon key present" : "anon key missing",
      ].join(" · "),
    },
    {
      id: "env-db",
      name: "Database connectivity",
      detail: "Core C2C tables must respond for the platform to operate.",
      status: coreReachable ? "Healthy" : "Degraded",
      tone: coreReachable ? "success" : "error",
      meta: coreReachable
        ? "profiles, customers, contracts, invoices reachable"
        : "One or more core tables failed",
    },
    {
      id: "env-auth-store",
      name: "Identity store",
      detail: "Profile directory used for role resolution and portal access.",
      status: profilesProbe.ok ? "Healthy" : "Down",
      tone: profilesProbe.ok ? "success" : "error",
      meta: profilesProbe.ok
        ? `${profiles.length} profile(s), ${profiles.filter((p) => p.is_active).length} active`
        : profilesProbe.message,
    },
    {
      id: "env-billing-store",
      name: "Billing data plane",
      detail: "Invoice and payment stores used for collections.",
      status: invoicesProbe.ok && paymentsProbe.ok ? "Healthy" : "Degraded",
      tone: invoicesProbe.ok && paymentsProbe.ok ? "success" : "error",
      meta:
        invoicesProbe.ok && paymentsProbe.ok
          ? `${invoicesProbe.count ?? 0} invoices · ${paymentsProbe.count ?? 0} payments`
          : invoicesProbe.message || paymentsProbe.message,
    },
  ];

  const jobIssues = jobs.filter((j) => j.tone === "error" || j.tone === "warning").length;
  const syncIssues = syncs.filter((s) => s.tone === "error" || s.tone === "warning").length;
  const envIssues = environment.filter((e) => e.tone === "error" || e.tone === "warning").length;

  return (
    <div>
      <PageHeader
        title="Platform Status"
        description="Jobs, syncs, and environment health for the contract-to-cash platform."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/alerts" className="btn btn-sm btn-outline">
              Alerts
            </Link>
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Home
            </Link>
          </div>
        }
      />

      {loadError ? <ErrorState message={loadError.message} /> : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Job issues"
          value={String(jobIssues)}
          tone={jobIssues ? "warning" : "success"}
        />
        <StatCard
          label="Sync issues"
          value={String(syncIssues)}
          tone={syncIssues ? "error" : "success"}
        />
        <StatCard
          label="Environment issues"
          value={String(envIssues)}
          tone={envIssues ? "error" : "success"}
        />
        <StatCard
          label="Active contracts"
          value={String(activeContracts)}
          hint={`${activeCustomers} active customers`}
        />
      </div>

      <HealthSection
        title="Jobs"
        description="Background and recurring work that keeps C2C moving."
        rows={jobs}
      />

      <HealthSection
        title="Syncs"
        description="Cross-record links that must stay consistent for billing and collections."
        rows={syncs}
      />

      <HealthSection
        title="Environment health"
        description="Runtime, configuration, and data-plane availability."
        rows={environment}
      />

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-70">
          Operational pulse
        </h2>
        <p className="mb-3 text-sm opacity-70">
          Live counts from service delivery and receivables.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open tickets" value={String(ticketsRes.data?.length ?? 0)} />
          <StatCard label="Active projects" value={String(projectsRes.data?.length ?? 0)} />
          <StatCard
            label="Pending approvals"
            value={String(pendingApprovals)}
            tone={pendingApprovals > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Open disputes"
            value={String(disputesRes.data?.length ?? 0)}
            tone={(disputesRes.data?.length ?? 0) > 0 ? "warning" : "success"}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/alerts" className="btn btn-sm btn-primary">
          View alerts
        </Link>
        <Link href="/admin/exceptions" className="btn btn-sm btn-outline">
          Exception Log
        </Link>
        <Link href="/admin/data-quality" className="btn btn-sm btn-outline">
          Data quality
        </Link>
      </div>
    </div>
  );
}

function HealthSection({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: HealthRow[];
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-70">{title}</h2>
      <p className="mb-3 text-sm opacity-70">{description}</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-box border ${rowBorder(row.tone)} bg-base-100 p-4`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge badge-sm ${badgeClass(row.tone)}`}>{row.status}</span>
              <p className="font-semibold">{row.name}</p>
            </div>
            <p className="mt-1 text-sm opacity-70">{row.detail}</p>
            {row.meta ? <p className="mt-1 text-sm">{row.meta}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
