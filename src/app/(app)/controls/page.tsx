import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { ErrorState, PageHeader, StatCard } from "@/components/ui";
import { ControlsExplorer } from "@/components/ControlsExplorer";
import { ControlFailuresChart } from "@/components/ControlFailuresChart";
import { CONTROLS_CATALOG, CONTROL_CATEGORY_ORDER } from "@/lib/controls-catalog";
import { buildControlFailures } from "@/lib/control-failures";
import { listActiveContractsMissingSignedDocument } from "@/lib/contracts";

/** Fetch one extra row so we can tell when a soft cap truncated the scan. */
const SCAN_CAP = 100;

function takeCapped<T>(rows: T[] | null | undefined): { rows: T[]; truncated: boolean } {
  const list = rows ?? [];
  if (list.length > SCAN_CAP) {
    return { rows: list.slice(0, SCAN_CAP), truncated: true };
  }
  return { rows: list, truncated: false };
}

export default async function ControlsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Managers and admins only — not billing, technician, or customer.
  if (!isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();
  const sevenDaysAgoDate = sevenDaysAgoIso.slice(0, 10);
  const fetchLimit = SCAN_CAP + 1;

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
      .limit(fetchLimit),
    supabase
      .from("time_entries")
      .select("id, work_date")
      .eq("approval_status", "pending")
      .lt("work_date", sevenDaysAgoDate)
      .limit(fetchLimit),
    supabase
      .from("direct_costs")
      .select("id, cost_date")
      .eq("approval_status", "pending")
      .lt("cost_date", sevenDaysAgoDate)
      .limit(fetchLimit),
    supabase
      .from("additional_work_requests")
      .select("id, title, created_at")
      .eq("approval_status", "pending")
      .lt("created_at", sevenDaysAgoIso)
      .limit(fetchLimit),
    supabase
      .from("support_tickets")
      .select(
        "id, ticket_number, title, status, priority, submitted_at, target_resolution_at, completed_at"
      )
      .not("status", "in", "(closed,resolved,canceled)")
      .limit(fetchLimit),
  ]);

  const loadErrors = [
    contractsRes.error,
    missingDocsRes.error,
    priceModsRes.error,
    draftInvoicesRes.error,
    pendingTimeRes.error,
    pendingCostsRes.error,
    additionalWorkRes.error,
    ticketsRes.error,
  ].filter((err): err is NonNullable<typeof err> => Boolean(err));

  if (loadErrors.length > 0) {
    const message = loadErrors.map((err) => err.message).join(" · ");
    return (
      <div className="space-y-6">
        <PageHeader
          title="Controls and Exceptions"
          description="Interactive walkthrough of the business risks ServiceSync is designed around — review live control exceptions, then expand a “What if…?” to see the control and open the screen that enforces it."
        />
        <ErrorState
          message={`We couldn't load live control exceptions. ${message}`}
        />
      </div>
    );
  }

  const drafts = takeCapped(draftInvoicesRes.data);
  const pendingTime = takeCapped(pendingTimeRes.data);
  const pendingCosts = takeCapped(pendingCostsRes.data);
  const additionalWork = takeCapped(additionalWorkRes.data);
  const tickets = takeCapped(ticketsRes.data);

  const truncationNotes: string[] = [];
  if (drafts.truncated) truncationNotes.push(`stale draft invoices (showing first ${SCAN_CAP})`);
  if (pendingTime.truncated) truncationNotes.push(`pending time entries (showing first ${SCAN_CAP})`);
  if (pendingCosts.truncated) truncationNotes.push(`pending direct costs (showing first ${SCAN_CAP})`);
  if (additionalWork.truncated) {
    truncationNotes.push(`pending additional work (showing first ${SCAN_CAP})`);
  }
  if (tickets.truncated) truncationNotes.push(`open tickets (showing first ${SCAN_CAP})`);

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
    staleDraftInvoices: drafts.rows,
    stalePendingTime: pendingTime.rows,
    stalePendingCosts: pendingCosts.rows,
    staleAdditionalWork: additionalWork.rows,
    openTickets: tickets.rows,
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

      <ControlFailuresChart failures={failures} truncationNotes={truncationNotes} />

      <ControlsExplorer role={profile.role} />
    </div>
  );
}
