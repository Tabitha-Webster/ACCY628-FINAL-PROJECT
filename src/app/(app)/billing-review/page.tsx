import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BillingReviewClient } from "@/components/BillingReviewClient";
import { PeriodViewControls } from "@/components/PeriodViewControls";
import { loadBillingReviewData } from "@/lib/billing-review-data";
import { periodOverlapsToday, periodViewControlProps, resolveDashboardPeriod } from "@/lib/dashboard-period";

export default async function BillingReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const period = resolveDashboardPeriod(params.view, params.period);
  const supabase = await createClient();
  const { packages, items, exceptions, billingPeriodStart, billingPeriodEnd, periodLabel } = await loadBillingReviewData(
    supabase,
    { start: period.start, end: period.end, label: period.label, unbounded: period.unbounded },
    { includeOpenOneTime: periodOverlapsToday(period) }
  );

  return (
    <div>
      <PageHeader
        title="Billing Review"
        description={
          period.view === "all"
            ? "Preview monthly contract charges, included hours, overage, approved projects, and equipment or software across the life of the company."
            : `Preview ${period.label} monthly contract charges, included hours, overage, approved projects, and equipment or software before generating invoices.`
        }
        actions={<PeriodViewControls {...periodViewControlProps(period)} />}
      />
      <BillingReviewClient
        packages={packages}
        items={periodOverlapsToday(period) ? items : []}
        exceptions={exceptions}
        periodLabel={periodLabel}
        periodRange={`${billingPeriodStart} to ${billingPeriodEnd}`}
        canGenerateMonthly={period.view === "month"}
        billingPeriodStart={period.view === "month" ? period.start : undefined}
      />
    </div>
  );
}
