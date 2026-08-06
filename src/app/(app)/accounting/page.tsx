import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { canUseBillingTools } from "@/lib/constants";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, StatCard } from "@/components/ui";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { formatCurrency, statusLabel } from "@/lib/format";
import {
  monthKeyInDashboardPeriod,
  periodViewControlProps,
  resolveDashboardPeriod,
} from "@/lib/dashboard-period";

const RECOGNITION_ORDER = ["earned", "deferred", "unbilled"] as const;

const RECOGNITION_COPY: Record<(typeof RECOGNITION_ORDER)[number], { label: string; summary: string }> = {
  earned: {
    label: "Earned",
    summary:
      "Service has been delivered. This is period income and is what Profitability and management dashboards use.",
  },
  deferred: {
    label: "Deferred",
    summary:
      "Billed in advance (typically recurring support with in-advance timing). Still a liability until the service month is delivered.",
  },
  unbilled: {
    label: "Unbilled",
    summary:
      "Value identified but not yet on an invoice. Review Billing Overview when this balance is material.",
  },
};

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canUseBillingTools(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const period = resolveDashboardPeriod(params.view, params.period);
  const supabase = await createClient();

  const [{ data: records, error }, { data: contracts }] = await Promise.all([
    supabase
      .from("revenue_records")
      .select("revenue_type, recognition, amount, period_month, description")
      .order("period_month", { ascending: false }),
    supabase
      .from("contracts")
      .select("billing_timing, monthly_recurring_fee, status")
      .eq("status", "active"),
  ]);

  const periodRecords = (records ?? []).filter((record) =>
    monthKeyInDashboardPeriod(record.period_month, period)
  );

  const byRecognition = new Map<string, number>();
  const byTypeAndRecognition = new Map<string, Map<string, number>>();

  for (const record of periodRecords) {
    const amount = Number(record.amount ?? 0);
    byRecognition.set(record.recognition, (byRecognition.get(record.recognition) ?? 0) + amount);

    const typeMap = byTypeAndRecognition.get(record.revenue_type) ?? new Map<string, number>();
    typeMap.set(record.recognition, (typeMap.get(record.recognition) ?? 0) + amount);
    byTypeAndRecognition.set(record.revenue_type, typeMap);
  }

  const earned = byRecognition.get("earned") ?? 0;
  const deferred = byRecognition.get("deferred") ?? 0;
  const unbilled = byRecognition.get("unbilled") ?? 0;
  const totalRevenue = earned + deferred + unbilled;

  function pctOfTotal(amount: number) {
    return totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0;
  }

  const typeRows = Array.from(byTypeAndRecognition.keys())
    .sort()
    .map((type) => {
      const typeMap = byTypeAndRecognition.get(type) ?? new Map<string, number>();
      const earnedAmt = typeMap.get("earned") ?? 0;
      const deferredAmt = typeMap.get("deferred") ?? 0;
      const unbilledAmt = typeMap.get("unbilled") ?? 0;
      return {
        type,
        earned: earnedAmt,
        deferred: deferredAmt,
        unbilled: unbilledAmt,
        total: earnedAmt + deferredAmt + unbilledAmt,
      };
    })
    .sort((a, b) => b.total - a.total);

  let advanceMrr = 0;
  let arrearsMrr = 0;
  let advanceContracts = 0;
  let arrearsContracts = 0;
  for (const contract of contracts ?? []) {
    const fee = Number(contract.monthly_recurring_fee ?? 0);
    if (contract.billing_timing === "in_advance") {
      advanceMrr += fee;
      advanceContracts += 1;
    } else {
      arrearsMrr += fee;
      arrearsContracts += 1;
    }
  }

  function recognitionLines(recognition: string) {
    return periodRecords
      .filter((record) => record.recognition === recognition)
      .map((record) => ({
        label: record.description || statusLabel(record.revenue_type),
        value: formatCurrency(Number(record.amount ?? 0)),
        detail: record.period_month,
      }));
  }

  const reviewNotes: { title: string; detail: string; href?: string }[] = [];
  if (deferred > 0) {
    reviewNotes.push({
      title: "Deferred balance to release",
      detail: `${formatCurrency(deferred)} (${pctOfTotal(deferred).toFixed(0)}% of recorded) is prepaid / advance-billed and should not be treated as earned income yet.`,
      href: "/invoices",
    });
  }
  if (unbilled > 0) {
    reviewNotes.push({
      title: "Unbilled backlog",
      detail: `${formatCurrency(unbilled)} is recorded as unbilled. Confirm whether these amounts are ready to invoice.`,
      href: "/billing-review",
    });
  }
  if (totalRevenue > 0 && earned / totalRevenue < 0.5) {
    reviewNotes.push({
      title: "Earned share is below half",
      detail: `Only ${pctOfTotal(earned).toFixed(0)}% of recorded revenue for ${period.label} is earned. Check advance billing and timing before closing the period.`,
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Accounting Review"
        description={`Revenue recognition for Billing & Accounting. Showing ${period.label}.`}
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />

      {error ? <ErrorState message={error.message} /> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recognition summary</h2>
        <p className="max-w-3xl text-sm opacity-70">
          Every revenue dollar is tagged earned, deferred, or unbilled. Keep these separate so prepaid
          support is not mistaken for income, and unbilled work is not forgotten.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Earned"
            value={formatCurrency(earned)}
            hint={`${pctOfTotal(earned).toFixed(0)}% of recorded · counts as income`}
            tone="success"
            explanation={{
              title: "Earned revenue",
              result: formatCurrency(earned),
              formula: `Sum of revenue_records.amount in ${period.label} where recognition = earned`,
              description: RECOGNITION_COPY.earned.summary,
              lines: recognitionLines("earned"),
            }}
          />
          <StatCard
            label="Deferred"
            value={formatCurrency(deferred)}
            hint={`${pctOfTotal(deferred).toFixed(0)}% of recorded · billed in advance`}
            explanation={{
              title: "Deferred revenue",
              result: formatCurrency(deferred),
              formula: `Sum of revenue_records.amount in ${period.label} where recognition = deferred`,
              description: RECOGNITION_COPY.deferred.summary,
              lines: recognitionLines("deferred"),
            }}
          />
          <StatCard
            label="Unbilled"
            value={formatCurrency(unbilled)}
            hint={`${pctOfTotal(unbilled).toFixed(0)}% of recorded · not yet invoiced`}
            tone={unbilled > 0 ? "warning" : "default"}
            explanation={{
              title: "Unbilled revenue",
              result: formatCurrency(unbilled),
              formula: `Sum of revenue_records.amount in ${period.label} where recognition = unbilled`,
              description: RECOGNITION_COPY.unbilled.summary,
              lines: recognitionLines("unbilled"),
            }}
          />
          <StatCard
            label="Total recorded"
            value={formatCurrency(totalRevenue)}
            hint={`${period.label} · all recognition statuses`}
            explanation={{
              title: "Total revenue recorded",
              result: formatCurrency(totalRevenue),
              formula: `Sum of all revenue_records.amount in ${period.label} across earned, deferred, and unbilled`,
              lines: RECOGNITION_ORDER.map((recognition) => ({
                label: statusLabel(recognition),
                value: formatCurrency(byRecognition.get(recognition) ?? 0),
              })),
            }}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What each status means</h2>
        <div className="space-y-4">
          {RECOGNITION_ORDER.map((key) => (
            <div key={key} className="border-b border-base-300 pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{RECOGNITION_COPY[key].label}</h3>
                <p className="text-sm tabular-nums opacity-70">
                  {formatCurrency(byRecognition.get(key) ?? 0)}
                  {totalRevenue > 0 ? ` · ${pctOfTotal(byRecognition.get(key) ?? 0).toFixed(0)}%` : null}
                </p>
              </div>
              <p className="mt-1 max-w-3xl text-sm opacity-70">{RECOGNITION_COPY[key].summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Revenue by type and recognition · {period.label}</h2>
        <p className="max-w-3xl text-sm opacity-70">
          Recurring fees may be earned or deferred depending on contract billing timing. Overage,
          project, and equipment charges are normally earned when invoiced.
        </p>
        {typeRows.length > 0 ? (
          <DataTable headers={["Revenue Type", "Earned", "Deferred", "Unbilled", "Total"]}>
            {typeRows.map((row) => (
              <tr key={row.type}>
                <td className="font-medium">{statusLabel(row.type)}</td>
                <td>
                  <Money value={row.earned} />
                </td>
                <td>
                  <Money value={row.deferred} />
                </td>
                <td>
                  <Money value={row.unbilled} />
                </td>
                <td className="font-medium">
                  <Money value={row.total} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No revenue has been recorded for this period" />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contract billing timing</h2>
        <p className="max-w-3xl text-sm opacity-70">
          Active contracts billed in advance create deferred recurring revenue when invoiced. Contracts
          billed in arrears recognize the monthly fee as earned.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Advance-billed MRR"
            value={formatCurrency(advanceMrr)}
            hint={`${advanceContracts} active contract${advanceContracts === 1 ? "" : "s"} · tends to create deferred`}
          />
          <StatCard
            label="Arrears-billed MRR"
            value={formatCurrency(arrearsMrr)}
            hint={`${arrearsContracts} active contract${arrearsContracts === 1 ? "" : "s"} · tends to create earned`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Items to review</h2>
        {reviewNotes.length > 0 ? (
          <ul className="space-y-4">
            {reviewNotes.map((note) => (
              <li key={note.title} className="border-b border-base-300 pb-4 last:border-b-0 last:pb-0">
                <p className="font-medium">{note.title}</p>
                <p className="mt-1 max-w-3xl text-sm opacity-70">{note.detail}</p>
                {note.href ? (
                  <Link href={note.href} className="link link-hover mt-2 inline-block text-sm">
                    Open related page →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing flagged for this period"
            description="No material deferred concentration or unbilled backlog based on current rules."
          />
        )}
      </section>

      <section className="space-y-2 border-t border-base-300 pt-6">
        <h2 className="text-lg font-semibold">Related pages</h2>
        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/profitability" className="link link-hover">
              Profitability
            </Link>
            <span className="opacity-60"> — earned revenue vs cost and margin</span>
          </li>
          <li>
            <Link href="/billing-review" className="link link-hover">
              Billing overview
            </Link>
            <span className="opacity-60"> — ready-to-bill work and exceptions</span>
          </li>
          <li>
            <Link href="/invoices" className="link link-hover">
              Invoices
            </Link>
            <span className="opacity-60"> — issued and draft invoices</span>
          </li>
          <li>
            <Link href="/accounts-receivable" className="link link-hover">
              Accounts receivable
            </Link>
            <span className="opacity-60"> — collections and aging</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
