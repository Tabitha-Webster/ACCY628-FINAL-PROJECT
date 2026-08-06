import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui";
import { ControlsExplorer } from "@/components/ControlsExplorer";
import { ControlFailuresChart } from "@/components/ControlFailuresChart";
import { CONTROLS_CATALOG, CONTROL_CATEGORY_ORDER } from "@/lib/controls-catalog";
import { buildControlFailures } from "@/lib/control-failures";
import { listActiveContractsMissingSignedDocument } from "@/lib/contracts";

export default async function ControlsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Managers and admins only — not billing, technician, HR, or customer.
  if (!isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();
  const sevenDaysAgoDate = sevenDaysAgoIso.slice(0, 10);

  const [
    contractsRes,
    missingDocsRes,
    priceModsRes,
    draftInvoicesRes,
    pendingTimeRes,
    pendingCostsRes,
    additionalWorkRes,
    ticketsRes,
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, contract_number, name, status, end_date, payment_terms, billing_frequency, updated_at")
      .eq("status", "active"),
    listActiveContractsMissingSignedDocument(supabase),
    supabase
      .from("contract_modifications")
      .select(
        "id, contract_id, modification_summary, created_at, contracts(contract_number, name)"
      )
      .eq("approval_status", "pending"),
    supabase
      .from("invoices")
      .select("id, invoice_number, created_at, status")
      .eq("status", "draft")
      .lt("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: true })
      .limit(25),
    supabase
      .from("time_entries")
      .select("id, work_date")
      .eq("approval_status", "pending")
      .lt("work_date", sevenDaysAgoDate)
      .limit(25),
    supabase
      .from("direct_costs")
      .select("id, cost_date")
      .eq("approval_status", "pending")
      .lt("cost_date", sevenDaysAgoDate)
      .limit(25),
    supabase
      .from("additional_work_requests")
      .select("id, title, created_at")
      .eq("approval_status", "pending")
      .lt("created_at", sevenDaysAgoIso)
      .limit(25),
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, title, status, priority, submitted_at, target_resolution_at, completed_at"
      )
      .not("status", "in", "(closed,resolved,canceled)")
      .limit(80),
  ]);

  const failures = buildControlFailures({
    now,
    activeContracts: contractsRes.data ?? [],
    missingSignedDocs: (missingDocsRes.data ?? []).map((row) => ({
      id: row.id,
      contract_number: row.contract_number,
      name: row.name,
    })),
    pendingPriceMods: (priceModsRes.data ?? []) as Parameters<
      typeof buildControlFailures
    >[0]["pendingPriceMods"],
    staleDraftInvoices: draftInvoicesRes.data ?? [],
    stalePendingTime: pendingTimeRes.data ?? [],
    stalePendingCosts: pendingCostsRes.data ?? [],
    staleAdditionalWork: additionalWorkRes.data ?? [],
    openTickets: ticketsRes.data ?? [],
  });

  const categoryCount = CONTROL_CATEGORY_ORDER.length;
  const controlCount = CONTROLS_CATALOG.length;
  const criticalCount = failures.filter((f) => f.severity === "critical").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controls and Exceptions"
        description="Interactive walkthrough of the business risks ServiceSync is designed around — review live control exceptions, then expand a “What if…?” to see the control and open the screen that enforces it."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Control areas" value={String(categoryCount)} />
        <StatCard label="Documented controls" value={String(controlCount)} />
        <StatCard
          label="Open exceptions"
          value={String(failures.length)}
          tone={failures.length ? "warning" : "success"}
        />
        <StatCard
          label="Critical"
          value={String(criticalCount)}
          tone={criticalCount ? "error" : "success"}
        />
      </div>

      <ControlFailuresChart failures={failures} />

      <ControlsExplorer />
    </div>
  );
}
