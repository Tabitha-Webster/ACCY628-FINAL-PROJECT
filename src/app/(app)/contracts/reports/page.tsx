import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ErrorState } from "@/components/ui";
import { ContractsDashboardVisuals } from "@/components/ContractsDashboardVisuals";
import {
  canCreateContracts,
  canViewContractReports,
  describeContractPermissions,
  fetchContractCalendarEvents,
  fetchContractReportMetrics,
} from "@/lib/contracts";

export default async function ContractReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractReports(profile.role)) redirect("/contracts/renewals");

  const supabase = await createClient();
  const [{ metrics, error }, calendarBundle] = await Promise.all([
    fetchContractReportMetrics(supabase),
    fetchContractCalendarEvents(supabase),
  ]);
  const permissions = describeContractPermissions(profile.role);
  const canCreate = canCreateContracts(profile.role);

  const actions = [
    { href: "/contracts", label: "← Manage contracts" },
    { href: "/contracts/renewals", label: "Renewal & Expiration" },
    ...(canCreate ? [{ href: "/contracts/new", label: "Create" }] : []),
    ...permissions
      .filter((item) => item.allowed && item.permission !== "view" && item.permission !== "create")
      .slice(0, 3)
      .map((item) => ({ href: item.href, label: item.label })),
  ];

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Contracts Dashboard</h1>
        <ErrorState message={error.message} />
      </div>
    );
  }

  return (
    <div>
      {calendarBundle.error ? (
        <div className="mb-3">
          <ErrorState message={calendarBundle.error.message} />
        </div>
      ) : null}
      <ContractsDashboardVisuals
        metrics={metrics}
        calendarEvents={calendarBundle.events}
        actions={actions}
      />
    </div>
  );
}
