import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, EmptyState, StatusBadge, Hours, ErrorState } from "@/components/ui";
import { hoursRemaining, usagePercentage, usageStatus } from "@/lib/calculations";
import type { Contract } from "@/lib/types";

function progressColor(status: string) {
  if (status === "over_limit") return "progress-error";
  if (status === "warning") return "progress-warning";
  return "progress-success";
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
    supabase.from("contracts").select("id, name, contract_number, included_hours_per_month, additional_hourly_rate, status").eq("customer_id", customerId).eq("status", "active"),
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
        <PageHeader title="Service Usage" />
        <EmptyState title="No active contracts" description="Contact your account manager to set up a service agreement." />
      </div>
    );
  }

  const includedByContract = new Map<string, number>();
  const billableByContract = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.contract_id) continue;
    if (entry.classification === "included") {
      includedByContract.set(entry.contract_id, (includedByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked));
    } else if (entry.classification === "billable") {
      billableByContract.set(entry.contract_id, (billableByContract.get(entry.contract_id) ?? 0) + Number(entry.hours_worked));
    }
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);

  return (
    <div>
      <PageHeader title="Service Usage" description={`Included-hours usage for ${monthLabel}.`} />

      <div className="grid gap-4 lg:grid-cols-2">
        {contracts.map((c) => {
          const used = includedByContract.get(c.id) ?? 0;
          const extra = billableByContract.get(c.id) ?? 0;
          const remaining = hoursRemaining(c.included_hours_per_month, used);
          const pct = usagePercentage(used, c.included_hours_per_month);
          const status = usageStatus(pct);

          return (
            <div key={c.id} className="rounded-box border border-base-300 bg-base-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs opacity-60">{c.contract_number}</p>
                </div>
                <StatusBadge status={status} />
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-sm">
                  <span>
                    <Hours value={used} /> used
                  </span>
                  <span className="opacity-60">
                    <Hours value={c.included_hours_per_month} /> included
                  </span>
                </div>
                <progress className={`progress ${progressColor(status)} mt-2 w-full`} value={Math.min(pct, 100)} max={100} />
                <p className="mt-1 text-xs opacity-60">{pct.toFixed(0)}% of included hours used this month</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="opacity-60">Remaining Included</p>
                  <p className="font-medium">
                    <Hours value={Math.max(remaining, 0)} />
                  </p>
                </div>
                <div>
                  <p className="opacity-60">Additional Support Used</p>
                  <p className="font-medium">
                    <Hours value={extra} /> @ ${Number(c.additional_hourly_rate).toFixed(0)}/hr
                  </p>
                </div>
              </div>

              {status === "over_limit" ? (
                <p className="mt-3 text-xs text-error">
                  You&apos;ve exceeded your included hours this month. Additional work is billed at the additional hourly rate above.
                </p>
              ) : status === "warning" ? (
                <p className="mt-3 text-xs text-warning">You&apos;re approaching your included hours limit for this month.</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
