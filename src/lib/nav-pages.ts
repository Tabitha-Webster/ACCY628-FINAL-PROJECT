import { ROLE_NAV, type UserRole } from "@/lib/constants";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

export type SearchablePage = {
  href: string;
  label: string;
  group?: string;
};

const ADMIN_EXTRA_PAGES: SearchablePage[] = [
  { href: "/admin/users", label: "Manage Access", group: "User Access" },
  { href: "/admin/role-permissions", label: "Role Permissions", group: "User Access" },
  { href: "/admin/employees", label: "Employees", group: "Company Directory" },
  { href: "/customers", label: "Customers", group: "Company Directory" },
  { href: "/customer-approvals", label: "New Customers", group: "Approvals" },
  { href: "/admin/alerts", label: "Alerts", group: "System" },
  { href: "/admin/system", label: "Platform Status", group: "System" },
  { href: "/admin/exceptions", label: "Exception Log", group: "System" },
  { href: "/admin/exports", label: "Data Exports", group: "System" },
  { href: "/admin/search", label: "Global Search", group: "System" },
];

const CONTRACTS_PAGES: SearchablePage[] = [
  { href: "/contracts/reports", label: "Contracts Dashboard", group: "Contracts & Agreements" },
  { href: "/contracts", label: "Manage Contracts", group: "Contracts & Agreements" },
  { href: "/contracts/view-edit", label: "View and Edit Contracts", group: "Contracts & Agreements" },
  { href: "/contracts/awaiting-signature", label: "Awaiting Your Signature", group: "Contracts & Agreements" },
  { href: "/contracts/new", label: "New Contract", group: "Contracts & Agreements" },
  { href: "/contracts/renewals", label: "Renewal & Expiration", group: "Contracts & Agreements" },
  { href: "/contracts/customers", label: "Customer Contract Data", group: "Contracts & Agreements" },
];

const BILLING_TREE_PAGES: SearchablePage[] = [
  { href: "/billing-review", label: "Overview", group: "Billing" },
  { href: "/billing-cost-approvals", label: "Approve Costs", group: "Billing" },
  { href: "/invoices", label: "Invoices", group: "Billing" },
  { href: "/hr-analytics", label: "HR Cost Analytics", group: "Billing" },
  { href: "/accounts-receivable", label: "Accounts Receivable", group: "Collections" },
  { href: "/payments", label: "Payment History", group: "Collections" },
  { href: "/accounting", label: "Accounting Review", group: "Accounting" },
];

const MANAGER_BILLING_FINANCE_PAGES: SearchablePage[] = [
  { href: "/time-cost-approvals", label: "Approve Time & Costs", group: "Billing & Finance" },
  { href: "/profitability", label: "Profitability", group: "Billing & Finance" },
  { href: "/billing-collections", label: "Billing and Collections", group: "Billing & Finance" },
  { href: "/payments", label: "Payment History", group: "Billing & Finance" },
];

const MANAGER_COMPANY_DIRECTORY_PAGES: SearchablePage[] = [
  { href: "/customers", label: "Customers", group: "Company Directory" },
  { href: "/admin/employees", label: "Employees", group: "Company Directory" },
];

const SERVICE_DELIVERY_PAGES: SearchablePage[] = [
  { href: "/tickets", label: "Support Tickets", group: "Service Delivery" },
  { href: "/projects", label: "Project Tasks", group: "Service Delivery" },
  { href: "/time-costs", label: "Submit Time and Costs", group: "Service Delivery" },
  { href: "/additional-work", label: "Additional Work Requests", group: "Service Delivery" },
];

function dedupePages(pages: SearchablePage[]) {
  const seen = new Set<string>();
  const result: SearchablePage[] = [];
  for (const page of pages) {
    if (seen.has(page.href)) continue;
    seen.add(page.href);
    result.push(page);
  }
  return result;
}

/** Pages available in the current role's sidebar / screen set. */
export function pagesForRole(
  role: UserRole,
  allowedPageKeys: Set<string> | null = null,
  restrictedCustomer = false
): SearchablePage[] {
  if (restrictedCustomer) {
    return [{ href: "/pending-approval", label: "Pending Approval" }];
  }

  const pages: SearchablePage[] = ROLE_NAV[role].map((item) => ({
    href: item.href,
    label: item.label,
  }));

  if (role === "admin") {
    pages.push(...ADMIN_EXTRA_PAGES);
  }

  if (role === "admin" || role === "manager" || role === "technician" || role === "billing" || role === "executive") {
    pages.push(
      ...CONTRACTS_PAGES.filter((page) => {
        if (page.href === "/contracts/reports")
          return role === "admin" || role === "manager" || role === "billing" || role === "executive";
        if (page.href === "/contracts/new") return role === "admin" || role === "manager";
        if (page.href === "/contracts/customers") return role === "admin" || role === "manager";
        if (page.href === "/contracts/awaiting-signature") return role === "executive" || role === "admin";
        if (page.href === "/contracts/view-edit") return role === "admin" || role === "manager";
        if (page.href === "/contracts/renewals")
          return role === "admin" || role === "manager" || role === "billing" || role === "technician";
        return true;
      })
    );
  }

  if (role === "billing") {
    pages.push(...BILLING_TREE_PAGES);
  }

  if (role === "manager") {
    pages.push(...MANAGER_BILLING_FINANCE_PAGES, ...MANAGER_COMPANY_DIRECTORY_PAGES);
  }

  if (role === "technician") {
    pages.push(...SERVICE_DELIVERY_PAGES);
  }

  if (role === "customer") {
    pages.push(
      { href: "/make-payment", label: "Make a Payment", group: "My Invoices" }
    );
  }

  const unique = dedupePages(pages);
  if (role === "admin") return unique;

  return unique.filter((page) => hrefAllowedByPageKeys(page.href, allowedPageKeys));
}

export function filterPagesCaseInsensitive(pages: SearchablePage[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages.filter((page) => {
    const haystack = `${page.label} ${page.group ?? ""} ${page.href}`.toLowerCase();
    return haystack.includes(q);
  });
}
