import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { PAGE_PERMISSION_CATALOG } from "@/lib/role-permissions";
import type { UserRole } from "@/lib/constants";

type ExceptionKind = "Failed job" | "Permission error" | "Sync failure";
type ExceptionSeverity = "critical" | "warning";

type TechnicalException = {
  id: string;
  kind: ExceptionKind;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  affectedProcess: string;
  href: string;
  action: string;
};

const EXPECTED_PERMISSION_ROWS = PAGE_PERMISSION_CATALOG.length;
const ACCESS_ROLES: UserRole[] = ["admin", "manager", "executive", "technician", "billing", "customer", "hr"];

export default async function AdminExceptionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const sevenDaysAgo = cutoff.toISOString();
  const sevenDaysAgoDate = sevenDaysAgo.slice(0, 10);

  const [
    staleDraftsRes,
    staleWorkRes,
    staleTimeRes,
    staleCostsRes,
    permissionsRes,
    profilesRes,
    paymentsRes,
    contractsRes,
    invoiceStoreRes,
    paymentStoreRes,
    permissionStoreRes,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, created_at", { count: "exact" })
      .eq("status", "draft")
      .lt("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true }),
    supabase
      .from("additional_work_requests")
      .select("id, title, created_at", { count: "exact" })
      .eq("approval_status", "pending")
      .lt("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true }),
    supabase
      .from("time_entries")
      .select("id, work_date", { count: "exact" })
      .eq("approval_status", "pending")
      .lt("work_date", sevenDaysAgoDate)
      .order("work_date", { ascending: true }),
    supabase
      .from("direct_costs")
      .select("id, cost_date", { count: "exact" })
      .eq("approval_status", "pending")
      .lt("cost_date", sevenDaysAgoDate)
      .order("cost_date", { ascending: true }),
    supabase.from("role_page_permissions").select("role, page_key, can_view"),
    supabase.from("profiles").select("id, full_name, email, role, is_active").eq("is_active", true),
    supabase.from("payments").select("id, payment_number, payment_date, payment_applications(id)"),
    supabase
      .from("contracts")
      .select("id, contract_number, billing_frequency, payment_terms")
      .eq("status", "active")
      .or("billing_frequency.is.null,payment_terms.is.null"),
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("id", { count: "exact", head: true }),
    supabase.from("role_page_permissions").select("role", { count: "exact", head: true }),
  ]);

  const exceptions: TechnicalException[] = [];

  const failedChecks = [
    { name: "Invoice processing job", error: staleDraftsRes.error, process: "Invoice generation" },
    { name: "Approval workflow job", error: staleWorkRes.error, process: "Additional-work approval" },
    { name: "Time approval job", error: staleTimeRes.error, process: "Time-to-bill handoff" },
    { name: "Cost approval job", error: staleCostsRes.error, process: "Cost-to-bill handoff" },
    { name: "Invoice data service", error: invoiceStoreRes.error, process: "Billing" },
    { name: "Payment data service", error: paymentStoreRes.error, process: "Cash application" },
  ];

  for (const check of failedChecks) {
    if (!check.error) continue;
    exceptions.push({
      id: `failed-${check.name}`,
      kind: "Failed job",
      severity: "critical",
      title: `${check.name} failed`,
      detail: check.error.message,
      affectedProcess: check.process,
      href: "/admin/system",
      action: "Platform Status",
    });
  }

  if (!staleDraftsRes.error && (staleDraftsRes.count ?? 0) > 0) {
    exceptions.push({
      id: "stale-draft-invoices",
      kind: "Failed job",
      severity: "critical",
      title: "Invoice generation did not complete",
      detail: `${staleDraftsRes.count} draft invoice(s) have remained unissued for more than 7 days.`,
      affectedProcess: "Billing → Collections",
      href: "/admin/alerts",
      action: "View Alerts",
    });
  }

  const staleApprovals =
    (staleWorkRes.count ?? 0) + (staleTimeRes.count ?? 0) + (staleCostsRes.count ?? 0);
  if (!staleWorkRes.error && !staleTimeRes.error && !staleCostsRes.error && staleApprovals > 0) {
    exceptions.push({
      id: "stale-approval-workflow",
      kind: "Failed job",
      severity: "warning",
      title: "Approval workflow is stalled",
      detail: `${staleApprovals} approval item(s) have remained pending for more than 7 days.`,
      affectedProcess: "Approval → Ready to Bill",
      href: "/admin/alerts",
      action: "View Alerts",
    });
  }

  if (permissionStoreRes.error || permissionsRes.error) {
    exceptions.push({
      id: "permission-store-error",
      kind: "Permission error",
      severity: "critical",
      title: "Role permission service is unavailable",
      detail: (permissionStoreRes.error || permissionsRes.error)?.message ?? "Permission rows could not be read.",
      affectedProcess: "Authentication and page authorization",
      href: "/admin/role-permissions",
      action: "Role Permissions",
    });
  } else {
    const permissionRows = permissionsRes.data ?? [];
    const rowsByRole = new Map<UserRole, Set<string>>();
    for (const role of ACCESS_ROLES) rowsByRole.set(role, new Set());
    for (const row of permissionRows) {
      const role = row.role as UserRole;
      rowsByRole.get(role)?.add(row.page_key);
    }

    for (const role of ACCESS_ROLES) {
      const rowCount = rowsByRole.get(role)?.size ?? 0;
      if (rowCount >= EXPECTED_PERMISSION_ROWS) continue;
      exceptions.push({
        id: `permission-matrix-${role}`,
        kind: "Permission error",
        severity: "critical",
        title: `${role} permission matrix is incomplete`,
        detail: `${EXPECTED_PERMISSION_ROWS - rowCount} page permission definition(s) are missing for this role.`,
        affectedProcess: "Role-based page access",
        href: "/admin/role-permissions",
        action: "Repair Permissions",
      });
    }
  }

  if (profilesRes.error) {
    exceptions.push({
      id: "profile-access-error",
      kind: "Permission error",
      severity: "critical",
      title: "Active-user permission check failed",
      detail: profilesRes.error.message,
      affectedProcess: "Portal access",
      href: "/admin/users",
      action: "Manage Access",
    });
  } else {
    const rolesWithPermissions = new Set((permissionsRes.data ?? []).map((row) => row.role));
    const affectedUsers = (profilesRes.data ?? []).filter((profile) => !rolesWithPermissions.has(profile.role));
    if (affectedUsers.length > 0) {
      exceptions.push({
        id: "users-without-permission-role",
        kind: "Permission error",
        severity: "critical",
        title: "Active users have no permission matrix",
        detail: `${affectedUsers.length} active user(s) are assigned a role with no stored page permissions.`,
        affectedProcess: "Login → Authorized workspace",
        href: "/admin/users",
        action: "Manage Access",
      });
    }
  }

  if (paymentsRes.error) {
    exceptions.push({
      id: "payment-sync-query",
      kind: "Sync failure",
      severity: "critical",
      title: "Payment-to-invoice sync check failed",
      detail: paymentsRes.error.message,
      affectedProcess: "Cash application",
      href: "/admin/system",
      action: "Platform Status",
    });
  } else {
    const unappliedPayments = (paymentsRes.data ?? []).filter((payment) => {
      const applications = payment.payment_applications;
      return !Array.isArray(applications) || applications.length === 0;
    });
    if (unappliedPayments.length > 0) {
      exceptions.push({
        id: "unapplied-payment-sync",
        kind: "Sync failure",
        severity: "critical",
        title: "Payments are not synchronized to invoices",
        detail: `${unappliedPayments.length} payment(s) have no invoice application.`,
        affectedProcess: "Payment → Accounts Receivable",
        href: "/admin/system",
        action: "Platform Status",
      });
    }
  }

  if (contractsRes.error) {
    exceptions.push({
      id: "contract-sync-query",
      kind: "Sync failure",
      severity: "critical",
      title: "Contract-to-billing sync check failed",
      detail: contractsRes.error.message,
      affectedProcess: "Contract → Invoice generation",
      href: "/admin/system",
      action: "Platform Status",
    });
  } else if ((contractsRes.data ?? []).length > 0) {
    exceptions.push({
      id: "contract-billing-sync",
      kind: "Sync failure",
      severity: "critical",
      title: "Active contracts are not billing-ready",
      detail: `${contractsRes.data?.length ?? 0} active contract(s) are missing billing frequency or payment terms.`,
      affectedProcess: "Contract → Invoice generation",
      href: "/admin/alerts",
      action: "View Alerts",
    });
  }

  const failedJobs = exceptions.filter((item) => item.kind === "Failed job").length;
  const permissionErrors = exceptions.filter((item) => item.kind === "Permission error").length;
  const syncFailures = exceptions.filter((item) => item.kind === "Sync failure").length;
  const critical = exceptions.filter((item) => item.severity === "critical").length;

  return (
    <div>
      <PageHeader
        title="Exception Log"
        description="Technical and process breakages affecting jobs, permissions, and data synchronization."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/system" className="btn btn-sm btn-outline">
              Platform Status
            </Link>
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Home
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Failed jobs" value={String(failedJobs)} tone={failedJobs ? "error" : "success"} />
        <StatCard
          label="Permission errors"
          value={String(permissionErrors)}
          tone={permissionErrors ? "error" : "success"}
        />
        <StatCard
          label="Sync failures"
          value={String(syncFailures)}
          tone={syncFailures ? "error" : "success"}
        />
        <StatCard label="Critical" value={String(critical)} tone={critical ? "error" : "success"} />
      </div>

      {exceptions.length === 0 ? (
        <EmptyState title="No technical or process exceptions detected" />
      ) : (
        <div className="space-y-3">
          {exceptions.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col gap-3 rounded-box border bg-base-100 p-4 sm:flex-row sm:items-center sm:justify-between ${
                item.severity === "critical" ? "border-error/50" : "border-warning/50"
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`badge badge-sm ${
                      item.severity === "critical" ? "badge-error" : "badge-warning"
                    }`}
                  >
                    {item.severity}
                  </span>
                  <span className="badge badge-ghost badge-sm">{item.kind}</span>
                  <p className="font-semibold">{item.title}</p>
                </div>
                <p className="mt-1 text-sm opacity-70">{item.detail}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-60">
                  Affected process: {item.affectedProcess}
                </p>
              </div>
              <Link href={item.href} className="btn btn-sm btn-primary shrink-0">
                {item.action}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
