import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, EmptyState, StatusBadge, Hours, ErrorState, Money } from "@/components/ui";
import { hoursRemaining, usagePercentage, usageStatus } from "@/lib/calculations";
import type { Contract } from "@/lib/types";

function usageBarClass(status: "normal" | "warning" | "over_limit") {
  if (status === "over_limit") return "bg-rose-500";
  if (status === "warning") return "bg-amber-400";
  return "bg-emerald-500";
}

export default async function ServiceUsagePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/dashboard");
  await requireApprovedCustomer(profile);

  const supabase = await createClient();
  const customerId = profile.customer_id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [contractsRes, timeRes] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, name, contract_number, included_hours_per_month, additional_hourly_rate, status")
      .eq("customer_id", customerId)
      .eq("status", "active"),
    supabase
      .from("time_entries")
      .select("contract_id, hours_worked, classification, work_date")
      .eq("customer_id", customerId)
      .gte("work_date", monthStart),
  ]);

  if (contractsRes.error) {
    return (
      <div>
        <PageHeader title="Service Usage" />
        <ErrorState message={contractsRes.error.message} />
      </div>
    );
  }

  const contracts = (contractsRes.data ?? []) as Pick<
    Contract,
    "id" | "name" | "contract_number" | "included_hours_per_month" | "additional_hourly_rate" | "status"
  >[];
  const timeEntries = timeRes.data ?? [];

  if (contracts.length === 0) {
    return (
      <div>
        <PageHeader
          title="Service Usage"
          description="Hour usage is tracked against your active contracts."
          actions={
            <Link href="/my-contracts" className="btn btn-outline btn-sm border-emerald-300 text-emerald-900">
              My Contracts
            </Link>
          }
        />
        <EmptyState
          title="No active contracts"
          description="Contact your account manager to set up a service agreement, or review completed agreements on My Contracts."
        />
      </div>
    );
  }

  const includedByContract = new Map<string, number>();
  const billableByContract = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.contract_id) continue;
    if (entry.classification === "included") {
      includedByContract.set(
        entry.contract_id,
        (includedByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked)
      );
    } else if (entry.classification === "billable") {
      billableByContract.set(
        entry.contract_id,
        (billableByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked)
      );
    }
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);

  return (
    <div>
      <PageHeader
        title="Service Usage"
        description={`This month's included-hour usage for your active contracts (${monthLabel}). Terms and covered services live on My Contracts.`}
        actions={
          <Link href="/my-contracts" className="btn btn-outline btn-sm border-emerald-300 text-emerald-900">
            My Contracts
          </Link>
        }
      />

      <div className="max-w-3xl space-y-4">
        {contracts.map((c) => {
          const used = includedByContract.get(c.id) ?? 0;
          const extra = billableByContract.get(c.id) ?? 0;
          const included = Number(c.included_hours_per_month ?? 0);
          const remaining = hoursRemaining(included, used);
          const pct = usagePercentage(used, included);
          const status = usageStatus(pct);
          const barWidth = included > 0 ? Math.min(100, Math.max(pct > 0 ? 4 : 0, pct)) : 0;

          return (
            <div
              key={c.id}
              className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-emerald-950">{c.name}</p>
                  <p className="text-xs opacity-60">{c.contract_number}</p>
                </div>
                <StatusBadge status={status} />
              </div>

              {included > 0 ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-emerald-900/70">
                      Included hours this month
                    </span>
                    <span className="tabular-nums opacity-70">
                      {used.toFixed(0)}/{included.toFixed(0)}h · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-emerald-900/10">
                    <div
                      className={`h-full rounded-full transition-all ${usageBarClass(status)}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] opacity-70">
                    <Hours value={Math.max(remaining, 0)} /> remaining of your contract allotment
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm opacity-60">
                  This contract does not include a monthly hour allotment.
                </p>
              )}

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Remaining Included</dt>
                  <dd className="font-medium">
                    <Hours value={Math.max(remaining, 0)} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Additional Support Used</dt>
                  <dd className="font-medium">
                    <Hours value={extra} /> @ <Money value={Number(c.additional_hourly_rate)} />
                    /hr
                  </dd>
                </div>
              </dl>

              {status === "over_limit" ? (
                <p className="mt-3 text-xs text-error">
                  You&apos;ve exceeded your included hours this month. Additional work is billed at the
                  additional hourly rate above.
                </p>
              ) : status === "warning" ? (
                <p className="mt-3 text-xs text-warning">
                  You&apos;re approaching your included hours limit for this month.
                </p>
              ) : null}

              <div className="mt-3 border-t border-emerald-200/70 pt-3">
                <Link href="/my-contracts" className="link link-hover text-xs font-medium text-emerald-800">
                  View contract terms on My Contracts →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
