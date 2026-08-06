import { ASSIGNABLE_ROLES, type UserRole } from "@/lib/constants";

export type PagePermissionKey =
  | "home"
  | "admin_home"
  | "manage_access"
  | "role_permissions"
  | "employees"
  | "customers"
  | "customer_approvals"
  | "contracts"
  | "contracts_reports"
  | "contracts_renewals"
  | "contracts_awaiting_signature"
  | "contracts_view_edit"
  | "contracts_customers"
  | "contracts_new"
  | "projects"
  | "operations"
  | "time_cost_approvals"
  | "profitability"
  | "billing_collections"
  | "payments"
  | "hr_analytics"
  | "controls"
  | "assignments"
  | "tickets"
  | "time_costs"
  | "additional_work"
  | "billing_review"
  | "billing_cost_approvals"
  | "invoices"
  | "accounts_receivable"
  | "accounting"
  | "ready_to_bill"
  | "hr_positions"
  | "hr_directory"
  | "my_contracts"
  | "my_projects"
  | "service_usage"
  | "support_requests"
  | "my_invoices"
  | "make_payment"
  | "pending_approval"
  | "admin_alerts"
  | "admin_approvals"
  | "admin_search"
  | "admin_assignments"
  | "admin_renewals"
  | "admin_billing_center"
  | "admin_exports"
  | "admin_exceptions"
  | "admin_system"
  | "admin_audit"
  | "admin_configurations";

export type PagePermissionDef = {
  key: PagePermissionKey;
  label: string;
  description: string;
  /** Path prefixes covered by this permission. Longest match wins. */
  pathPrefixes: string[];
  /** Roles that have this page enabled by default. */
  defaultRoles: UserRole[];
  /** If true, only shown/editable for admin matrix as locked always-on. */
  adminOnly?: boolean;
  group: string;
};

/** Catalog of screens an admin can grant or revoke per role. */
export const PAGE_PERMISSION_CATALOG: PagePermissionDef[] = [
  {
    key: "home",
    label: "Home / Dashboard",
    description: "Role home page and primary landing screen.",
    pathPrefixes: ["/dashboard"],
    defaultRoles: ["manager", "technician", "billing", "customer", "hr", "admin", "executive"],
    group: "Core",
  },
  {
    key: "admin_home",
    label: "Admin Home",
    description: "System admin landing page.",
    pathPrefixes: ["/admin"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin",
  },
  {
    key: "manage_access",
    label: "Manage Access",
    description: "Create and maintain portal logins and roles.",
    pathPrefixes: ["/admin/users"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin",
  },
  {
    key: "role_permissions",
    label: "Role Permissions",
    description: "Edit which pages each role can open.",
    pathPrefixes: ["/admin/role-permissions"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin",
  },
  {
    key: "employees",
    label: "Employees",
    description: "Internal employee directory.",
    pathPrefixes: ["/admin/employees"],
    defaultRoles: ["admin", "manager", "hr", "executive"],
    group: "Company Directory",
  },
  {
    key: "customers",
    label: "Customers",
    description: "Customer master list and customer records.",
    pathPrefixes: ["/customers"],
    defaultRoles: ["admin", "manager", "technician", "billing", "hr", "executive"],
    group: "Company Directory",
  },
  {
    key: "customer_approvals",
    label: "Customer Approvals",
    description: "Approve or reject new customer signup requests.",
    pathPrefixes: ["/customer-approvals"],
    defaultRoles: ["admin", "manager", "hr"],
    group: "Company Directory",
  },
  {
    key: "contracts",
    label: "Manage Contracts",
    description: "Contract list and contract detail screens.",
    pathPrefixes: ["/contracts"],
    defaultRoles: ["admin", "manager", "technician", "billing", "hr", "executive"],
    group: "Contracts",
  },
  {
    key: "contracts_reports",
    label: "Contracts Dashboard",
    description: "Contract metrics and reporting.",
    pathPrefixes: ["/contracts/reports"],
    defaultRoles: ["admin", "manager", "billing", "executive"],
    group: "Contracts",
  },
  {
    key: "contracts_renewals",
    label: "Renewal & Expiration",
    description: "Contracts nearing renewal or past end date.",
    pathPrefixes: ["/contracts/renewals"],
    defaultRoles: ["admin", "manager", "billing", "technician", "executive"],
    group: "Contracts",
  },
  {
    key: "contracts_awaiting_signature",
    label: "Awaiting Your Signature",
    description: "Executive queue of contracts waiting for CEO signature.",
    pathPrefixes: ["/contracts/awaiting-signature"],
    defaultRoles: ["executive", "admin"],
    group: "Contracts",
  },
  {
    key: "contracts_view_edit",
    label: "View and Edit Contracts",
    description: "Simple contract list with PDF view and stepped edit.",
    pathPrefixes: ["/contracts/view-edit"],
    defaultRoles: ["admin", "manager"],
    group: "Contracts",
  },
  {
    key: "contracts_customers",
    label: "Contracts by Customer",
    description: "Customer-focused contract browse.",
    pathPrefixes: ["/contracts/customers"],
    defaultRoles: ["admin", "manager", "billing", "technician"],
    group: "Contracts",
  },
  {
    key: "contracts_new",
    label: "New Contract",
    description: "Create a new service agreement.",
    pathPrefixes: ["/contracts/new"],
    defaultRoles: ["admin", "manager"],
    group: "Contracts",
  },
  {
    key: "projects",
    label: "Projects",
    description: "Project and project task screens.",
    pathPrefixes: ["/projects"],
    defaultRoles: ["admin", "manager", "technician"],
    group: "Operations",
  },
  {
    key: "operations",
    label: "Service Operations",
    description: "SLA monitoring and open work overview.",
    pathPrefixes: ["/operations"],
    defaultRoles: ["admin", "manager"],
    group: "Operations",
  },
  {
    key: "assignments",
    label: "Assignments",
    description: "Technician assignment workbench.",
    pathPrefixes: ["/assignments"],
    defaultRoles: ["admin", "technician"],
    group: "Operations",
  },
  {
    key: "tickets",
    label: "Support Tickets",
    description: "Internal support ticket queue.",
    pathPrefixes: ["/tickets"],
    defaultRoles: ["admin", "manager", "technician"],
    group: "Operations",
  },
  {
    key: "time_costs",
    label: "Submit Time and Costs",
    description: "Log billable time and material costs.",
    pathPrefixes: ["/time-costs"],
    defaultRoles: ["admin", "technician"],
    group: "Operations",
  },
  {
    key: "time_cost_approvals",
    label: "Approve Time & Costs",
    description: "Manager approval queue for time and costs.",
    pathPrefixes: ["/time-cost-approvals"],
    defaultRoles: ["admin", "manager"],
    group: "Operations",
  },
  {
    key: "additional_work",
    label: "Additional Work Requests",
    description: "Out-of-scope work request workflow.",
    pathPrefixes: ["/additional-work"],
    defaultRoles: ["admin", "manager", "technician"],
    group: "Operations",
  },
  {
    key: "billing_review",
    label: "Billing Overview",
    description: "Monthly package and invoice prep overview.",
    pathPrefixes: ["/billing-review"],
    defaultRoles: ["admin", "billing", "manager"],
    group: "Billing",
  },
  {
    key: "ready_to_bill",
    label: "Ready to Bill",
    description: "Work ready to convert into invoices.",
    pathPrefixes: ["/ready-to-bill"],
    defaultRoles: ["admin", "billing", "manager"],
    group: "Billing",
  },
  {
    key: "billing_cost_approvals",
    label: "Approve Costs",
    description: "Billing review of submitted costs.",
    pathPrefixes: ["/billing-cost-approvals"],
    defaultRoles: ["admin", "billing"],
    group: "Billing",
  },
  {
    key: "invoices",
    label: "Invoices",
    description: "Invoice list and invoice detail.",
    pathPrefixes: ["/invoices"],
    defaultRoles: ["admin", "billing", "manager"],
    group: "Billing",
  },
  {
    key: "accounts_receivable",
    label: "Accounts Receivable",
    description: "Open AR, aging, and collection status.",
    pathPrefixes: ["/accounts-receivable"],
    defaultRoles: ["admin", "billing", "manager", "executive"],
    group: "Billing",
  },
  {
    key: "payments",
    label: "Payment History",
    description: "Recorded customer payments.",
    pathPrefixes: ["/payments"],
    defaultRoles: ["admin", "billing", "manager"],
    group: "Billing",
  },
  {
    key: "accounting",
    label: "Accounting Review",
    description: "Accounting and recognition review screens.",
    pathPrefixes: ["/accounting"],
    defaultRoles: ["admin", "billing", "manager"],
    group: "Billing",
  },
  {
    key: "billing_collections",
    label: "Billing and Collections",
    description: "Combined billing and collections workspace.",
    pathPrefixes: ["/billing-collections"],
    defaultRoles: ["admin", "manager"],
    group: "Billing",
  },
  {
    key: "profitability",
    label: "Profitability",
    description: "Margin and profitability analysis.",
    pathPrefixes: ["/profitability"],
    defaultRoles: ["admin", "manager"],
    group: "Analytics",
  },
  {
    key: "hr_analytics",
    label: "HR Analytics",
    description: "Workforce and cost analytics.",
    pathPrefixes: ["/hr-analytics"],
    defaultRoles: ["admin", "manager", "billing", "hr"],
    group: "Analytics",
  },
  {
    key: "controls",
    label: "Controls and Exceptions",
    description: "Business risks and control guidance.",
    pathPrefixes: ["/controls"],
    defaultRoles: ["admin", "manager"],
    group: "Analytics",
  },
  {
    key: "hr_positions",
    label: "Positions",
    description: "HR open positions.",
    pathPrefixes: ["/hr-positions"],
    defaultRoles: ["hr"],
    group: "HR",
  },
  {
    key: "hr_directory",
    label: "HR Directory",
    description: "Departments, positions, and contractors.",
    pathPrefixes: ["/admin/hr"],
    defaultRoles: ["hr", "admin"],
    group: "HR",
  },
  {
    key: "my_contracts",
    label: "My Contracts",
    description: "Customer portal contracts.",
    pathPrefixes: ["/my-contracts"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "my_projects",
    label: "My Projects",
    description: "Customer portal projects.",
    pathPrefixes: ["/my-projects"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "service_usage",
    label: "Service Usage",
    description: "Customer portal usage view.",
    pathPrefixes: ["/service-usage"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "support_requests",
    label: "Make a Request",
    description: "Customer portal support requests.",
    pathPrefixes: ["/support-requests"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "my_invoices",
    label: "My Invoices",
    description: "Customer portal invoices.",
    pathPrefixes: ["/my-invoices"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "make_payment",
    label: "Make a Payment",
    description: "Customer portal payment screen.",
    pathPrefixes: ["/make-payment"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "pending_approval",
    label: "Pending Approval",
    description: "Waiting screen for unapproved customer accounts.",
    pathPrefixes: ["/pending-approval"],
    defaultRoles: ["customer"],
    group: "Customer Portal",
  },
  {
    key: "admin_alerts",
    label: "Admin Alerts",
    description: "System risk alerts for admins.",
    pathPrefixes: ["/admin/alerts"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_approvals",
    label: "Approvals Inbox",
    description: "Central admin approvals queue.",
    pathPrefixes: ["/admin/approvals"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_search",
    label: "Admin Search",
    description: "Global admin search.",
    pathPrefixes: ["/admin/search"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_assignments",
    label: "Assignment Board",
    description: "Admin ticket assignment board.",
    pathPrefixes: ["/admin/assignments-board"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_renewals",
    label: "Contract Renewals",
    description: "Admin renewals queue.",
    pathPrefixes: ["/admin/renewals"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_billing_center",
    label: "Billing Center",
    description: "Admin billing control center.",
    pathPrefixes: ["/admin/billing-center"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_exports",
    label: "CSV Exports",
    description: "Admin data exports.",
    pathPrefixes: ["/admin/exports"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_exceptions",
    label: "Exceptions",
    description: "Admin exceptions queue.",
    pathPrefixes: ["/admin/exceptions"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_system",
    label: "Platform Status",
    description: "Jobs, syncs, and environment health overview.",
    pathPrefixes: ["/admin/system"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_audit",
    label: "Audit Trail",
    description: "Change-only audit history for sensitive system records.",
    pathPrefixes: ["/admin/audit"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
  {
    key: "admin_configurations",
    label: "Configurations",
    description: "Company settings, tax defaults, numbering, integrations, and demo toggles.",
    pathPrefixes: ["/admin/configurations"],
    defaultRoles: ["admin"],
    adminOnly: true,
    group: "Admin Tools",
  },
];

export const EDITABLE_PAGE_PERMISSIONS = PAGE_PERMISSION_CATALOG.filter((page) => !page.adminOnly);

export function defaultAllowedKeysForRole(role: UserRole): Set<string> {
  if (role === "admin") {
    return new Set(PAGE_PERMISSION_CATALOG.map((page) => page.key));
  }
  return new Set(
    PAGE_PERMISSION_CATALOG.filter((page) => page.defaultRoles.includes(role)).map((page) => page.key)
  );
}

export function buildDefaultPermissionRows() {
  const rows: { role: UserRole; page_key: string; can_view: boolean }[] = [];
  for (const role of ASSIGNABLE_ROLES) {
    for (const page of PAGE_PERMISSION_CATALOG) {
      rows.push({
        role,
        page_key: page.key,
        can_view: page.defaultRoles.includes(role) || role === "admin",
      });
    }
  }
  return rows;
}

/** Resolve the most specific page permission key for a pathname. */
export function pageKeyForPath(pathname: string): PagePermissionKey | null {
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return null;

  let best: PagePermissionDef | null = null;
  let bestLen = -1;

  for (const page of PAGE_PERMISSION_CATALOG) {
    for (const prefix of page.pathPrefixes) {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        if (prefix.length > bestLen) {
          best = page;
          bestLen = prefix.length;
        }
      }
    }
  }

  return best?.key ?? null;
}

/**
 * Whether a nav href should show for the current allowed page keys.
 * null allowedPageKeys means "use defaults unavailable / fail open to defaults".
 */
export function hrefAllowedByPageKeys(href: string, allowedPageKeys: Set<string> | null): boolean {
  if (href === "/dashboard" || href === "/admin" || href.startsWith("/profile")) return true;
  if (allowedPageKeys == null) return true;

  const key = pageKeyForPath(href);
  if (!key) return true;
  return allowedPageKeys.has(key);
}

export function pathAllowedByPageKeys(pathname: string, allowedPageKeys: Set<string> | null): boolean {
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/customer-signup" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname === "/dashboard" ||
    pathname.startsWith("/profile")
  ) {
    return true;
  }

  if (allowedPageKeys == null) return true;

  // Admin always has all keys when loading succeeded; callers should pass full set.
  const key = pageKeyForPath(pathname);
  if (!key) {
    // Uncatalogued routes keep existing page-level guards.
    return true;
  }
  return allowedPageKeys.has(key);
}

export function editableRoles(): UserRole[] {
  return ASSIGNABLE_ROLES.filter((role) => role !== "admin");
}
