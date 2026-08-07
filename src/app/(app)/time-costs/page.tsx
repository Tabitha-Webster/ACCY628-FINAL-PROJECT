import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Clock,
  DollarSign,
  Hourglass,
  Receipt,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { EmptyState, StatusBadge, Money, Hours, DateText } from "@/components/ui";
import { TimeCostForm } from "@/components/TimeCostForm";

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
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
} as const;

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

export default async function TimeCostsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ticket?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "technician" && !isManagerRole(profile.role)) redirect("/dashboard");

  const params = searchParams ? await searchParams : {};
  const initialTicketId = params.ticket?.trim() || null;

  const supabase = await createClient();
  const isManager = profile.role === "manager";

  const [customersRes, contractsRes, ticketsRes, projectsRes, myTimeRes, myCostsRes, pendingCostsRes, pendingTimeRes] =
    await Promise.all([
      supabase.from("customers").select("id, name").eq("status", "active").order("name"),
      supabase
        .from("contracts")
        .select("id, name, contract_number, customer_id, additional_hourly_rate")
        .eq("status", "active"),
      supabase
        .from("support_tickets")
        .select("id, ticket_number, title, customer_id, project_id, contract_id")
        .not("status", "in", "(resolved,closed,canceled)"),
      supabase.from("projects").select("id, name, customer_id").not("status", "in", "(closed,canceled)"),
      supabase
        .from("time_entries")
        .select(
          "id, customer_id, work_date, hours_worked, classification, labor_cost, approval_status, billing_status, description, unusual_hours_flag"
        )
        .eq("technician_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("direct_costs")
        .select(
          "id, customer_id, cost_date, cost_category, internal_cost, billable_amount, approval_status, billing_status, description, entered_after_invoice, late_entry_flag, approval_threshold_required"
        )
        .eq("entered_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
      isManager
        ? supabase
            .from("direct_costs")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending")
        : Promise.resolve({ data: null, error: null, count: 0 }),
      isManager
        ? supabase
            .from("time_entries")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending")
        : Promise.resolve({ data: null, error: null, count: 0 }),
    ]);

  const customers = customersRes.data ?? [];
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const contracts = (contractsRes.data ?? []).map((c) => ({
    id: c.id,
    customerId: c.customer_id,
    label: `${c.contract_number} · ${c.name}`,
    additionalHourlyRate: Number(c.additional_hourly_rate),
  }));
  const tickets = (ticketsRes.data ?? []).map((t) => ({
    id: t.id,
    customerId: t.customer_id as string,
    projectId: (t.project_id as string | null) ?? null,
    contractId: (t.contract_id as string | null) ?? null,
    label: `${t.ticket_number} · ${t.title}`,
  }));
  const preselectTicket = initialTicketId ? tickets.find((t) => t.id === initialTicketId) : null;
  const preselectContractId = preselectTicket
    ? preselectTicket.contractId ??
      contracts.find((c) => c.customerId === preselectTicket.customerId)?.id
    : undefined;
  const formDefaults = initialTicketId
    ? {
        ticketId: initialTicketId,
        customerId: preselectTicket?.customerId,
        contractId: preselectContractId,
        projectId: preselectTicket?.projectId ?? undefined,
      }
    : undefined;
  const projects = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    customerId: p.customer_id,
    label: p.name,
  }));
  const pendingCostCount = pendingCostsRes.count ?? 0;
  const pendingTimeCount = pendingTimeRes.count ?? 0;

  const recentTime = myTimeRes.data ?? [];
  const recentCosts = myCostsRes.data ?? [];
  const recentHours = recentTime.reduce((sum, e) => sum + Number(e.hours_worked ?? 0), 0);
  const pendingMyTime = recentTime.filter((e) => e.approval_status === "pending").length;
  const pendingMyCosts = recentCosts.filter((c) => c.approval_status === "pending").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Submit Time and Costs</h1>
        <p className="text-sm opacity-70">
          Log billable and included hours, plus direct costs tied to tickets and projects.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Recent hours"
          value={recentHours.toFixed(1)}
          tone="sky"
          icon={<Clock className="h-4 w-4" />}
          hint="Last 10 time entries"
        />
        <MetricTile
          label="Time pending"
          value={String(pendingMyTime)}
          tone={pendingMyTime > 0 ? "amber" : "emerald"}
          icon={<Hourglass className="h-4 w-4" />}
          hint="Awaiting approval"
        />
        <MetricTile
          label="Recent costs"
          value={String(recentCosts.length)}
          tone="violet"
          icon={<Receipt className="h-4 w-4" />}
          hint="Last 10 cost entries"
        />
        <MetricTile
          label="Costs pending"
          value={String(pendingMyCosts)}
          tone={pendingMyCosts > 0 ? "amber" : "emerald"}
          icon={<DollarSign className="h-4 w-4" />}
          hint="Awaiting approval"
        />
      </div>

      <TimeCostForm
        technicianId={profile.id}
        internalCostRate={Number(profile.internal_cost_rate ?? 65)}
        customers={customers}
        contracts={contracts}
        tickets={tickets}
        projects={projects}
        defaults={formDefaults}
      />

      {isManager ? (
        <div className="rounded-2xl border border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-violet-950">Manager approvals</h2>
              <p className="text-sm opacity-70">
                {pendingTimeCount} time · {pendingCostCount} cost
                {pendingTimeCount + pendingCostCount === 1 ? "" : "s"} waiting — open the approvals queue to
                review technician submissions.
              </p>
            </div>
            <Link
              href="/time-cost-approvals"
              className="rounded-xl border border-violet-400/50 bg-gradient-to-br from-violet-500 to-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-violet-500/25 transition hover:brightness-110"
            >
              Approve Time &amp; Costs
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/80 to-base-100 shadow-sm">
          <div className="border-b border-sky-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sky-900/80">
              My recent time entries ({recentTime.length})
            </h2>
          </div>
          <div className="p-3">
            {recentTime.length === 0 ? (
              <EmptyState title="No time logged yet" description="Entries you submit will show up here." />
            ) : (
              <ul className="space-y-2">
                {recentTime.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-xl border border-sky-100 bg-white/85 px-3 py-2.5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          <DateText value={e.work_date} />
                          <span className="font-medium opacity-70">
                            {" "}
                            · {customerName.get(e.customer_id) ?? "—"}
                          </span>
                        </p>
                        {e.description ? (
                          <p className="mt-0.5 truncate text-[11px] opacity-60">{e.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <span className="text-sm font-semibold tabular-nums text-sky-950">
                          <Hours value={Number(e.hours_worked)} />
                        </span>
                        <StatusBadge status={e.classification} />
                        <StatusBadge status={e.approval_status} />
                        {e.unusual_hours_flag ? (
                          <span className="badge badge-warning badge-sm">Unusual hours</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] opacity-60">
                      Labor <Money value={Number(e.labor_cost ?? 0)} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100 shadow-sm">
          <div className="border-b border-violet-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
              My recent direct costs ({recentCosts.length})
            </h2>
          </div>
          <div className="p-3">
            {recentCosts.length === 0 ? (
              <EmptyState title="No costs logged yet" description="Direct costs you submit will show up here." />
            ) : (
              <ul className="space-y-2">
                {recentCosts.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          <DateText value={c.cost_date} />
                          <span className="font-medium opacity-70">
                            {" "}
                            · {customerName.get(c.customer_id) ?? "—"}
                          </span>
                        </p>
                        {c.description ? (
                          <p className="mt-0.5 truncate text-[11px] opacity-60">{c.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <StatusBadge status={c.cost_category} />
                        <StatusBadge status={c.approval_status} />
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                      <span className="opacity-70">
                        Cost <Money value={Number(c.internal_cost)} />
                      </span>
                      <span className="font-medium text-violet-950">
                        Billable <Money value={Number(c.billable_amount)} />
                      </span>
                      {c.approval_threshold_required ? (
                        <span className="badge badge-warning badge-sm">Large cost</span>
                      ) : null}
                      {c.late_entry_flag ? (
                        <span className="badge badge-warning badge-sm">Late entry</span>
                      ) : null}
                      {c.entered_after_invoice ? (
                        <span className="badge badge-info badge-sm">After invoice</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
