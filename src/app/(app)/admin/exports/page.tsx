import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";
import { PAGE_PERMISSION_CATALOG } from "@/lib/role-permissions";
import { roleLabel, type UserRole } from "@/lib/constants";

type CsvCell = string | number | boolean | null | undefined;

type ExportDefinition = {
  title: string;
  category: "Access" | "Audit" | "Support";
  description: string;
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  error?: string;
};

function valueFrom(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return "";
}

export default async function AdminExportsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const generatedAt = new Date().toISOString();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const sevenDaysAgo = cutoff.toISOString();
  const sevenDaysAgoDate = sevenDaysAgo.slice(0, 10);

  const [
    usersRes,
    permissionsRes,
    auditRes,
    staleDraftsRes,
    staleWorkRes,
    staleTimeRes,
    staleCostsRes,
    paymentsRes,
    contractsRes,
    profilesCountRes,
    contractsCountRes,
    ticketsCountRes,
    invoicesCountRes,
    paymentsCountRes,
    auditCountRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, is_demo_user")
      .order("full_name"),
    supabase
      .from("role_page_permissions")
      .select("role, page_key, can_view, updated_at, updated_by")
      .order("role")
      .order("page_key"),
    supabase.from("system_audit_events").select("*").order("created_at", { ascending: false }).limit(1000),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, created_at")
      .eq("status", "draft")
      .lt("created_at", sevenDaysAgo),
    supabase
      .from("additional_work_requests")
      .select("id, title, approval_status, created_at")
      .eq("approval_status", "pending")
      .lt("created_at", sevenDaysAgo),
    supabase
      .from("time_entries")
      .select("id, work_date, approval_status")
      .eq("approval_status", "pending")
      .lt("work_date", sevenDaysAgoDate),
    supabase
      .from("direct_costs")
      .select("id, cost_date, approval_status")
      .eq("approval_status", "pending")
      .lt("cost_date", sevenDaysAgoDate),
    supabase.from("payments").select("id, payment_number, payment_date, payment_applications(id)"),
    supabase
      .from("contracts")
      .select("id, contract_number, billing_frequency, payment_terms")
      .eq("status", "active")
      .or("billing_frequency.is.null,payment_terms.is.null"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("contracts").select("id", { count: "exact", head: true }),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }),
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("id", { count: "exact", head: true }),
    supabase.from("system_audit_events").select("id", { count: "exact", head: true }),
  ]);

  const pageByKey = new Map(PAGE_PERMISSION_CATALOG.map((page) => [page.key, page]));

  const accessRows: CsvCell[][] = (usersRes.data ?? []).map((user) => [
    user.id,
    user.full_name,
    user.email,
    roleLabel(user.role as UserRole),
    user.is_active ? "Active" : "Inactive",
    user.is_demo_user ? "Yes" : "No",
    generatedAt,
    admin.email,
  ]);

  const permissionRows: CsvCell[][] = (permissionsRes.data ?? []).map((row) => {
    const page = pageByKey.get(row.page_key);
    return [
      roleLabel(row.role as UserRole),
      row.page_key,
      page?.label ?? row.page_key,
      page?.group ?? "Unknown",
      row.can_view ? "Allowed" : "Blocked",
      row.role === "admin" ? "Locked" : "Editable",
      row.updated_at,
      row.updated_by,
      generatedAt,
      admin.email,
    ];
  });

  const auditRows: CsvCell[][] = ((auditRes.data ?? []) as Record<string, unknown>[]).map((row) => [
    valueFrom(row, ["id"]),
    valueFrom(row, ["created_at", "event_at", "logged_at", "timestamp"]),
    valueFrom(row, ["actor_email", "actor_id", "user_id", "performed_by"]),
    valueFrom(row, ["action", "event_type", "activity"]),
    valueFrom(row, ["entity_type", "table_name", "resource"]),
    valueFrom(row, ["entity_id", "record_id", "resource_id"]),
    valueFrom(row, ["details", "description", "summary", "changes"]),
  ]);

  const exceptionRows: CsvCell[][] = [];
  const addException = (
    category: string,
    severity: string,
    process: string,
    recordType: string,
    recordId: string,
    detectedValue: string,
    detail: string
  ) => {
    exceptionRows.push([
      category,
      severity,
      process,
      recordType,
      recordId,
      detectedValue,
      detail,
      generatedAt,
      admin.email,
    ]);
  };

  for (const invoice of staleDraftsRes.data ?? []) {
    addException(
      "Failed job",
      "Critical",
      "Invoice generation",
      "Invoice",
      invoice.id,
      invoice.invoice_number,
      `Draft has remained unissued since ${invoice.created_at}.`
    );
  }
  for (const request of staleWorkRes.data ?? []) {
    addException(
      "Failed job",
      "Warning",
      "Approval workflow",
      "Additional work request",
      request.id,
      request.title,
      `Approval has been pending since ${request.created_at}.`
    );
  }
  for (const entry of staleTimeRes.data ?? []) {
    addException(
      "Failed job",
      "Warning",
      "Time-to-bill approval",
      "Time entry",
      entry.id,
      entry.work_date,
      "Time approval has been pending for more than 7 days."
    );
  }
  for (const cost of staleCostsRes.data ?? []) {
    addException(
      "Failed job",
      "Warning",
      "Cost-to-bill approval",
      "Direct cost",
      cost.id,
      cost.cost_date,
      "Cost approval has been pending for more than 7 days."
    );
  }
  for (const payment of paymentsRes.data ?? []) {
    const applications = payment.payment_applications;
    if (Array.isArray(applications) && applications.length > 0) continue;
    addException(
      "Sync failure",
      "Critical",
      "Payment application",
      "Payment",
      payment.id,
      payment.payment_number,
      `Payment dated ${payment.payment_date} has no invoice application.`
    );
  }
  for (const contract of contractsRes.data ?? []) {
    addException(
      "Sync failure",
      "Critical",
      "Contract-to-billing configuration",
      "Contract",
      contract.id,
      contract.contract_number,
      "Active contract is missing billing frequency or payment terms."
    );
  }

  const technicalErrors = [
    ["Failed job checks", staleDraftsRes.error || staleWorkRes.error || staleTimeRes.error || staleCostsRes.error],
    ["Payment sync check", paymentsRes.error],
    ["Contract sync check", contractsRes.error],
  ] as const;
  for (const [check, error] of technicalErrors) {
    if (!error) continue;
    addException(
      "Check failure",
      "Critical",
      check,
      "System check",
      "",
      "Query failed",
      error.message
    );
  }

  const platformRows: CsvCell[][] = [
    [
      "Application runtime",
      "Next.js",
      process.env.NODE_ENV === "production" ? "Production" : "Development",
      "Available",
      generatedAt,
    ],
    [
      "Supabase URL",
      "Environment configuration",
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Missing",
      generatedAt,
    ],
    [
      "Supabase anonymous key",
      "Environment configuration",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Configured" : "Missing",
      generatedAt,
    ],
    [
      "Profiles",
      "Data store",
      profilesCountRes.count ?? "",
      profilesCountRes.error ? `Error: ${profilesCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Contracts",
      "Data store",
      contractsCountRes.count ?? "",
      contractsCountRes.error ? `Error: ${contractsCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Support tickets",
      "Data store",
      ticketsCountRes.count ?? "",
      ticketsCountRes.error ? `Error: ${ticketsCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Invoices",
      "Data store",
      invoicesCountRes.count ?? "",
      invoicesCountRes.error ? `Error: ${invoicesCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Payments",
      "Data store",
      paymentsCountRes.count ?? "",
      paymentsCountRes.error ? `Error: ${paymentsCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Audit log",
      "Data store",
      auditCountRes.count ?? "",
      auditCountRes.error ? `Error: ${auditCountRes.error.message}` : "Reachable",
      generatedAt,
    ],
    [
      "Role permission definitions",
      "Access configuration",
      permissionsRes.data?.length ?? "",
      permissionsRes.error
        ? `Error: ${permissionsRes.error.message}`
        : `${PAGE_PERMISSION_CATALOG.length} pages expected per role`,
      generatedAt,
    ],
  ];

  const exports: ExportDefinition[] = [
    {
      title: "User access inventory",
      category: "Access",
      description: "Portal identities, assigned C2C roles, and account status for access certification.",
      filename: "admin-user-access-inventory",
      headers: [
        "User ID",
        "Name",
        "Email",
        "Role",
        "Access status",
        "Demo account",
        "Generated at",
        "Generated by",
      ],
      rows: accessRows,
      error: usersRes.error?.message,
    },
    {
      title: "Role permission matrix",
      category: "Access",
      description: "Complete page-level access configuration, including blocked pages and locked Admin access.",
      filename: "admin-role-permission-matrix",
      headers: [
        "Role",
        "Page key",
        "Page",
        "Module",
        "Access",
        "Control",
        "Updated at",
        "Updated by",
        "Generated at",
        "Generated by",
      ],
      rows: permissionRows,
      error: permissionsRes.error?.message,
    },
    {
      title: "System change audit",
      category: "Audit",
      description: "Latest 1,000 recorded changes for evidence collection and incident support.",
      filename: "admin-system-change-audit",
      headers: ["Event ID", "When", "Actor", "Action", "Entity", "Record ID", "Details"],
      rows: auditRows,
      error: auditRes.error?.message,
    },
    {
      title: "Technical exception snapshot",
      category: "Support",
      description: "Failed jobs, stalled process steps, and synchronization failures currently detected.",
      filename: "admin-technical-exceptions",
      headers: [
        "Category",
        "Severity",
        "Affected process",
        "Record type",
        "Record ID",
        "Detected value",
        "Details",
        "Generated at",
        "Generated by",
      ],
      rows: exceptionRows,
    },
    {
      title: "Platform support snapshot",
      category: "Support",
      description: "Runtime configuration and C2C data-store reachability without exposing secret values.",
      filename: "admin-platform-support-snapshot",
      headers: ["Component", "Type", "Value / count", "Status", "Checked at"],
      rows: platformRows,
    },
  ];

  const available = exports.filter((item) => !item.error).length;
  const unavailable = exports.length - available;

  return (
    <div>
      <PageHeader
        title="Data Exports"
        description="Admin-triggered extracts for access reviews, audit evidence, troubleshooting, and system support."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Home
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Available extracts" value={String(available)} tone="success" />
        <StatCard
          label="Unavailable extracts"
          value={String(unavailable)}
          tone={unavailable ? "error" : "success"}
        />
        <StatCard label="Generated by" value={admin.full_name} hint={admin.email} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {exports.map((item) => (
          <div key={item.filename} className="rounded-box border border-base-300 bg-base-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="badge badge-ghost badge-sm">{item.category}</span>
                <p className="mt-2 font-semibold">{item.title}</p>
              </div>
              <span className={`badge badge-sm ${item.error ? "badge-error" : "badge-success"}`}>
                {item.error ? "Unavailable" : "Ready"}
              </span>
            </div>
            <p className="mt-2 text-sm opacity-70">{item.description}</p>
            {item.error ? (
              <p className="mt-3 rounded-lg bg-error/10 p-2 text-xs text-error">
                Source error: {item.error}
              </p>
            ) : (
              <p className="mt-3 text-xs opacity-60">{item.rows.length} row(s) in current snapshot</p>
            )}
            <div className="mt-4">
              <CsvExportButton
                filename={item.filename}
                headers={item.headers}
                rows={item.error ? [] : item.rows}
                label={
                  <>
                    <Download className="h-4 w-4" aria-hidden />
                    Generate CSV
                  </>
                }
                className="btn btn-sm btn-primary"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-box border border-base-300 bg-base-100 p-4 text-sm opacity-80">
        Extracts are generated only when an Admin requests them. Secret key values are never included.
        Downloaded files may contain sensitive access or audit data and should be stored according to
        company retention policy.
      </div>
    </div>
  );
}
