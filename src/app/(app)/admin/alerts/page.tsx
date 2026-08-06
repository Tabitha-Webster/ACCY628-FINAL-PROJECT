import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";

type ProbeSeverity = "critical" | "warning" | "clear";

type IntegrationProbe = {
  id: string;
  name: string;
  c2cStage: string;
  description: string;
  severity: ProbeSeverity;
  statusLabel: string;
  detail: string;
  href: string;
  action: string;
};

type ProbeResult = {
  ok: boolean;
  errorMessage?: string;
  blockerCount?: number;
  blockerDetail?: string;
};

async function probeTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string
): Promise<ProbeResult> {
  const { error, count } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) {
    return { ok: false, errorMessage: error.message };
  }
  return { ok: true, blockerCount: count ?? 0 };
}

export default async function AdminAlertsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);

  const [
    profilesProbe,
    customersProbe,
    contractsProbe,
    ticketsProbe,
    timeProbe,
    costsProbe,
    workRequestsProbe,
    invoicesProbe,
    paymentsProbe,
    paymentAppsProbe,
    contractsMissingTerms,
    invoicesStuckDraft,
    unappliedPayments,
  ] = await Promise.all([
    probeTable(supabase, "profiles"),
    probeTable(supabase, "customers"),
    probeTable(supabase, "contracts"),
    probeTable(supabase, "support_tickets"),
    probeTable(supabase, "time_entries"),
    probeTable(supabase, "direct_costs"),
    probeTable(supabase, "additional_work_requests"),
    probeTable(supabase, "invoices"),
    probeTable(supabase, "payments"),
    probeTable(supabase, "payment_applications"),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .or("billing_frequency.is.null,payment_terms.is.null"),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .lt("created_at", cutoff.toISOString()),
    supabase.from("payments").select("id, payment_applications(id)"),
  ]);

  function integrationFromProbe(args: {
    id: string;
    name: string;
    c2cStage: string;
    description: string;
    probe: ProbeResult;
    href: string;
    action: string;
  }): IntegrationProbe {
    if (!args.probe.ok) {
      return {
        id: args.id,
        name: args.name,
        c2cStage: args.c2cStage,
        description: args.description,
        severity: "critical",
        statusLabel: "Integration down",
        detail: `Platform failure: ${args.probe.errorMessage ?? "unreachable"}. C2C cannot continue for this stage.`,
        href: args.href,
        action: args.action,
      };
    }
    return {
      id: args.id,
      name: args.name,
      c2cStage: args.c2cStage,
      description: args.description,
      severity: "clear",
      statusLabel: "Operational",
      detail: "Integration responding. No platform failure detected.",
      href: args.href,
      action: args.action,
    };
  }

  const integrations: IntegrationProbe[] = [
    integrationFromProbe({
      id: "auth",
      name: "Identity & access store",
      c2cStage: "Access",
      description: "Portal logins and role resolution required before any C2C work.",
      probe: profilesProbe,
      href: "/admin/users",
      action: "Manage Access",
    }),
    integrationFromProbe({
      id: "customers",
      name: "Customer master",
      c2cStage: "Customer setup",
      description: "Customer records that contracts, tickets, and invoices attach to.",
      probe: customersProbe,
      href: "/customers",
      action: "Open customers",
    }),
    integrationFromProbe({
      id: "contracts",
      name: "Contracts & billing terms",
      c2cStage: "Contract",
      description: "Agreement store used to price and authorize recurring billing.",
      probe: contractsProbe,
      href: "/admin/system",
      action: "Platform Status",
    }),
    integrationFromProbe({
      id: "delivery",
      name: "Service delivery capture",
      c2cStage: "Fulfillment",
      description: "Tickets, time, and costs that feed billable work into invoicing.",
      probe:
        ticketsProbe.ok && timeProbe.ok && costsProbe.ok
          ? { ok: true }
          : {
              ok: false,
              errorMessage:
                ticketsProbe.errorMessage ||
                timeProbe.errorMessage ||
                costsProbe.errorMessage ||
                "One or more delivery tables failed",
            },
      href: "/admin/system",
      action: "Platform Status",
    }),
    integrationFromProbe({
      id: "approvals",
      name: "Approvals workflow",
      c2cStage: "Approval gate",
      description: "Additional-work and cost approvals that must clear before billing.",
      probe: workRequestsProbe.ok
        ? { ok: true }
        : { ok: false, errorMessage: workRequestsProbe.errorMessage },
      href: "/admin/exceptions",
      action: "Exception Log",
    }),
    integrationFromProbe({
      id: "invoices",
      name: "Invoice engine",
      c2cStage: "Billing",
      description: "Invoice creation and issuance for contract-to-cash.",
      probe: invoicesProbe,
      href: "/admin/exports",
      action: "Data Exports",
    }),
    integrationFromProbe({
      id: "payments",
      name: "Payments & AR ledger",
      c2cStage: "Collections",
      description: "Payment posting that closes open receivables.",
      probe:
        paymentsProbe.ok && paymentAppsProbe.ok
          ? { ok: true }
          : {
              ok: false,
              errorMessage:
                paymentsProbe.errorMessage ||
                paymentAppsProbe.errorMessage ||
                "Payment ledger unreachable",
            },
      href: "/admin/system",
      action: "Platform Status",
    }),
  ];

  const processBlockers: IntegrationProbe[] = [];

  if (contractsProbe.ok && !contractsMissingTerms.error) {
    const count = contractsMissingTerms.count ?? 0;
    processBlockers.push({
      id: "billing-terms",
      name: "Active contracts missing billing terms",
      c2cStage: "Contract → Billing",
      description: "Recurring invoice generation cannot run without frequency and payment terms.",
      severity: count > 0 ? "critical" : "clear",
      statusLabel: count > 0 ? "Blocking C2C" : "Clear",
      detail:
        count > 0
          ? `${count} active contract(s) are missing billing frequency or payment terms, so monthly billing cannot complete.`
          : "All active contracts have the terms needed for billing.",
      href: "/admin/data-quality",
      action: "Data quality",
    });
  } else if (contractsMissingTerms.error) {
    processBlockers.push({
      id: "billing-terms",
      name: "Active contracts missing billing terms",
      c2cStage: "Contract → Billing",
      description: "Recurring invoice generation cannot run without frequency and payment terms.",
      severity: "critical",
      statusLabel: "Integration down",
      detail: `Could not verify billing terms: ${contractsMissingTerms.error.message}`,
      href: "/admin/system",
      action: "Platform Status",
    });
  }

  if (invoicesProbe.ok && !invoicesStuckDraft.error) {
    const count = invoicesStuckDraft.count ?? 0;
    processBlockers.push({
      id: "stuck-drafts",
      name: "Draft invoices stuck over 7 days",
      c2cStage: "Billing → Collections",
      description: "Unissued drafts stall cash collection for completed work.",
      severity: count > 0 ? "warning" : "clear",
      statusLabel: count > 0 ? "Blocking C2C" : "Clear",
      detail:
        count > 0
          ? `${count} draft invoice(s) older than 7 days have not been issued, so AR cannot start.`
          : "No aging draft invoices are holding the billing handoff.",
      href: "/admin/exceptions",
      action: "Exception Log",
    });
  }

  if (paymentsProbe.ok && paymentAppsProbe.ok && !unappliedPayments.error) {
    const count = (unappliedPayments.data ?? []).filter((payment) => {
      const apps = payment.payment_applications;
      return !Array.isArray(apps) || apps.length === 0;
    }).length;
    processBlockers.push({
      id: "unapplied-payments",
      name: "Payments missing invoice application",
      c2cStage: "Collections",
      description: "Cash cannot close AR when payments are not applied to an invoice.",
      severity: count > 0 ? "critical" : "clear",
      statusLabel: count > 0 ? "Blocking C2C" : "Clear",
      detail:
        count > 0
          ? `${count} payment(s) have no invoice application, so collections posting is blocked.`
          : "All recorded payments are applied to invoices.",
      href: "/admin/exceptions",
      action: "Exception Log",
    });
  } else if (unappliedPayments.error) {
    processBlockers.push({
      id: "unapplied-payments",
      name: "Payments missing invoice application",
      c2cStage: "Collections",
      description: "Cash cannot close AR when payments are not applied to an invoice.",
      severity: "critical",
      statusLabel: "Integration down",
      detail: `Could not verify payment applications: ${unappliedPayments.error.message}`,
      href: "/admin/system",
      action: "Platform Status",
    });
  }

  const integrationFailures = integrations.filter((a) => a.severity === "critical").length;
  const activeBlockers = processBlockers.filter((a) => a.severity !== "clear").length;
  const healthy =
    integrations.filter((a) => a.severity === "clear").length +
    processBlockers.filter((a) => a.severity === "clear").length;

  const schemaProbeFailed = !profilesProbe.ok && !customersProbe.ok && !contractsProbe.ok;

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Platform and integration failures that stop contract-to-cash from running end to end."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Home
          </Link>
        }
      />

      {schemaProbeFailed ? (
        <ErrorState message="Core data services are unreachable. C2C processes cannot run until platform connectivity is restored." />
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Integration failures"
          value={String(integrationFailures)}
          tone={integrationFailures ? "error" : "success"}
          hint={integrationFailures ? "Blocking C2C right now" : "No critical failures"}
        />
        <StatCard
          label="Process blockers"
          value={String(activeBlockers)}
          tone={activeBlockers ? "warning" : "success"}
          hint="Data failures that stall billing or collections"
        />
        <StatCard label="Healthy checks" value={String(healthy)} tone="success" />
      </div>

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-70">
          Platform &amp; integration status
        </h2>
        <p className="mb-3 text-sm opacity-70">
          Each check is a dependency the app needs to move work from contract through cash.
        </p>
        <div className="space-y-3">
          {integrations.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide opacity-70">
          C2C process blockers
        </h2>
        <p className="mb-3 text-sm opacity-70">
          Data or posting failures that keep billing, issuance, or collections from completing.
        </p>
        <div className="space-y-3">
          {processBlockers.length === 0 ? (
            <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm opacity-70">
              Process-blocker checks could not run because related integrations are down.
            </div>
          ) : (
            processBlockers.map((alert) => <AlertRow key={alert.id} alert={alert} />)
          )}
        </div>
      </section>
    </div>
  );
}

function AlertRow({ alert }: { alert: IntegrationProbe }) {
  const border =
    alert.severity === "critical"
      ? "border-error/50"
      : alert.severity === "warning"
        ? "border-warning/50"
        : "border-base-300";

  return (
    <div
      className={`flex flex-col gap-3 rounded-box border ${border} bg-base-100 p-4 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge badge-sm ${
              alert.severity === "critical"
                ? "badge-error"
                : alert.severity === "warning"
                  ? "badge-warning"
                  : "badge-success"
            }`}
          >
            {alert.statusLabel}
          </span>
          <span className="badge badge-ghost badge-sm">{alert.c2cStage}</span>
          <p className="font-semibold">{alert.name}</p>
        </div>
        <p className="mt-1 text-sm opacity-70">{alert.description}</p>
        <p className="mt-1 text-sm">{alert.detail}</p>
      </div>
      <Link
        href={alert.href}
        className={`btn btn-sm shrink-0 ${
          alert.severity === "clear" ? "btn-ghost" : "btn-primary"
        }`}
      >
        {alert.action}
      </Link>
    </div>
  );
}
