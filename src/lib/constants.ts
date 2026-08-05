export type UserRole = "manager" | "technician" | "billing" | "customer" | "hr";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  customer_id: string | null;
  internal_cost_rate: number | null;
  is_demo_user: boolean;
  is_active: boolean;
};

export const DEMO_ACCOUNTS = [
  {
    role: "manager" as UserRole,
    label: "Manager",
    email: "manager@servicesync.demo",
    password: "1234",
    name: "Morgan Hale",
  },
  {
    role: "technician" as UserRole,
    label: "Technician",
    email: "tech@servicesync.demo",
    password: "1234",
    name: "Taylor Nguyen",
  },
  {
    role: "billing" as UserRole,
    label: "Billing & Accounting",
    email: "billing@servicesync.demo",
    password: "1234",
    name: "Jordan Blake",
  },
  {
    role: "hr" as UserRole,
    label: "HR",
    email: "hr@servicesync.demo",
    password: "1234",
    name: "Harper Wells",
  },
  {
    role: "customer" as UserRole,
    label: "Customer (Chad Corporation)",
    email: "customer@apexlegal.demo",
    password: "1234",
    name: "Casey Ortiz",
  },
] as const;

export type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  children?: NavItem[];
};

export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  manager: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/customers", label: "Customers" },
    { href: "/customer-approvals", label: "Approvals" },
    // Contracts & Agreements dropdown renders via ContractsAgreementsNavTree in AppShell
    { href: "/projects", label: "Projects" },
    { href: "/operations", label: "Service Operations" },
    { href: "/time-cost-approvals", label: "Approve Time & Costs" },
    { href: "/profitability", label: "Profitability" },
    { href: "/billing-collections", label: "Billing and Collections" },
    { href: "/payments", label: "Payment History" },
    { href: "/hr-analytics", label: "HR Analytics" },
    { href: "/controls", label: "Controls and Exceptions" },
  ],
  technician: [
    { href: "/dashboard", label: "My Assignments" },
    { href: "/customers", label: "Customers" },
    // Contracts & Agreements dropdown renders via ContractsAgreementsNavTree in AppShell
    { href: "/tickets", label: "Support Tickets" },
    { href: "/projects", label: "Project Tasks" },
    { href: "/time-costs", label: "Submit Time and Costs" },
    { href: "/additional-work", label: "Additional Work Requests" },
  ],
  billing: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/customers", label: "Customers" },
    // Contracts & Agreements + Billing/Collections/Accounting trees render in AppShell
  ],
  hr: [
    { href: "/dashboard", label: "HR Home" },
    { href: "/customers", label: "Customers" },
    { href: "/customer-approvals", label: "Approvals" },
    { href: "/hr-analytics", label: "HR Analytics" },
    { href: "/hr-positions", label: "Positions" },
  ],
  customer: [
    { href: "/dashboard", label: "Customer Home" },
    { href: "/pending-approval", label: "Pending Approval" },
    { href: "/my-contracts", label: "My Contracts & Agreements" },
    { href: "/my-projects", label: "Projects" },
    { href: "/service-usage", label: "Service Usage" },
    { href: "/support-requests", label: "Support Requests" },
  ],
};

/** Role-specific copy for the Contracts & Agreements nav destination. */
export const CONTRACTS_NAV_COPY: Record<
  UserRole,
  { href: string; title: string; description: string }
> = {
  manager: {
    href: "/contracts",
    title: "Manage Contracts",
    description:
      "Manage the full agreement lifecycle — draft, approval, active service, holds, renewals, and cancellations.",
  },
  technician: {
    href: "/contracts",
    title: "Contracts & Agreements",
    description:
      "Review active service agreements, included hours, and SLA terms that guide your ticket and project work.",
  },
  billing: {
    href: "/contracts",
    title: "Manage Contracts",
    description:
      "Confirm recurring fees, billing frequency, payment terms, and rates before generating invoices.",
  },
  hr: {
    href: "/contracts",
    title: "Contracts & Agreements",
    description: "Review active agreements only as needed for workforce and contractor cost context.",
  },
  customer: {
    href: "/my-contracts",
    title: "My Contracts & Agreements",
    description:
      "View the service agreements for your organization, including fees, included hours, and covered services.",
  },
};

export function roleHomePath(_role: UserRole) {
  return "/dashboard";
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/profile")) return true;
  const allowed = ROLE_NAV[role].some(
    (item) =>
      !item.disabled &&
      (pathname === item.href || pathname.startsWith(item.href + "/"))
  );
  if (allowed) return true;

  // Shared detail routes used by multiple roles
  const shared: Partial<Record<UserRole, string[]>> = {
    manager: [
      "/tickets",
      "/projects",
      "/additional-work",
      "/invoices",
      "/payments",
      "/ready-to-bill",
      "/billing-review",
      "/accounting",
      "/accounts-receivable",
      "/time-costs",
      "/contracts",
      "/billing-cost-approvals",
      "/customer-approvals",
      "/operations",
      "/controls",
      "/hr-analytics",
    ],
    technician: ["/contracts", "/customers", "/assignments"],
    billing: [
      "/customers",
      "/contracts",
      "/projects",
      "/tickets",
      "/ready-to-bill",
      "/billing-review",
      "/billing-cost-approvals",
      "/invoices",
      "/payments",
      "/accounts-receivable",
      "/accounting",
      "/hr-analytics",
    ],
    hr: ["/contracts", "/customers", "/customer-approvals"],
    customer: ["/projects", "/my-invoices", "/make-payment", "/tickets", "/pending-approval"],
  };

  return (shared[role] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
