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
    label: "Customer (Apex Legal)",
    email: "customer@apexlegal.demo",
    password: "1234",
    name: "Casey Ortiz",
  },
] as const;

export type NavItem = {
  href: string;
  label: string;
};

export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  manager: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/customers", label: "Customers" },
    { href: "/contracts", label: "Contracts & Agreements" },
    { href: "/contracts/reports", label: "Contract Reports" },
    { href: "/operations", label: "Service Operations" },
    { href: "/profitability", label: "Profitability" },
    { href: "/billing-collections", label: "Billing and Collections" },
    { href: "/payments", label: "Payment History" },
    { href: "/hr-analytics", label: "HR Analytics" },
    { href: "/controls", label: "Controls and Exceptions" },
  ],
  technician: [
    { href: "/dashboard", label: "My Assignments" },
    { href: "/contracts", label: "Contracts & Agreements" },
    { href: "/tickets", label: "Support Tickets" },
    { href: "/projects", label: "Project Tasks" },
    { href: "/time-costs", label: "Submit Time and Costs" },
    { href: "/additional-work", label: "Additional Work Requests" },
  ],
  billing: [
    { href: "/dashboard", label: "Billing Dashboard" },
    { href: "/contracts", label: "Contracts & Agreements" },
    { href: "/contracts/reports", label: "Contract Reports" },
    { href: "/billing-review", label: "Billing Review" },
    { href: "/invoices", label: "Invoices" },
    { href: "/payments", label: "Payment History" },
    { href: "/accounts-receivable", label: "Accounts Receivable" },
    { href: "/accounting", label: "Accounting Review" },
    { href: "/hr-analytics", label: "HR Cost Analytics" },
  ],
  hr: [
    { href: "/dashboard", label: "HR Home" },
    { href: "/hr-analytics", label: "HR Analytics" },
    { href: "/hr-positions", label: "Positions" },
  ],
  customer: [
    { href: "/dashboard", label: "Customer Home" },
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
    title: "Contracts & Agreements",
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
    title: "Contracts & Agreements",
    description:
      "Confirm recurring fees, billing frequency, payment terms, and rates before generating invoices.",
  },
  hr: {
    href: "/contracts",
    title: "Contracts & Agreements",
    description: "Review service agreements that inform staffing and labor cost planning.",
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
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
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
    ],
    technician: ["/contracts", "/customers"],
    billing: ["/customers", "/contracts", "/projects", "/tickets", "/ready-to-bill"],
    customer: ["/my-invoices", "/make-payment", "/tickets"],
  };

  return (shared[role] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
