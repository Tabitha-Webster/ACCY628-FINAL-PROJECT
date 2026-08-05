export type UserRole = "manager" | "technician" | "billing" | "customer";

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
    { href: "/dashboard", label: "Executive Dashboard" },
    { href: "/customers", label: "Customers" },
    { href: "/contracts", label: "Contracts" },
    { href: "/operations", label: "Service Operations" },
    { href: "/profitability", label: "Profitability" },
    { href: "/billing-collections", label: "Billing and Collections" },
    { href: "/controls", label: "Controls and Exceptions" },
  ],
  technician: [
    { href: "/assignments", label: "My Assignments" },
    { href: "/tickets", label: "Support Tickets" },
    { href: "/projects", label: "Project Tasks" },
    { href: "/time-costs", label: "Submit Time and Costs" },
    { href: "/additional-work", label: "Additional Work Requests" },
  ],
  billing: [
    { href: "/dashboard", label: "Billing Dashboard" },
    { href: "/ready-to-bill", label: "Ready to Bill" },
    { href: "/invoices", label: "Invoices" },
    { href: "/payments", label: "Payments" },
    { href: "/accounts-receivable", label: "Accounts Receivable" },
    { href: "/accounting", label: "Accounting Review" },
  ],
  customer: [
    { href: "/dashboard", label: "Customer Home" },
    { href: "/my-contracts", label: "My Contracts" },
    { href: "/support-requests", label: "Support Requests" },
    { href: "/service-usage", label: "Service Usage" },
    { href: "/my-projects", label: "Projects" },
    { href: "/my-invoices", label: "Invoices and Payments" },
  ],
};

export function roleHomePath(role: UserRole) {
  if (role === "technician") return "/assignments";
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
      "/accounting",
      "/accounts-receivable",
      "/time-costs",
    ],
    technician: ["/contracts", "/customers"],
    billing: ["/customers", "/contracts", "/projects"],
    customer: [],
  };

  return (shared[role] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
