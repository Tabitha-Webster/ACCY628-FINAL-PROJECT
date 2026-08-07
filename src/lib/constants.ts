export type UserRole = "admin" | "manager" | "technician" | "billing" | "customer" | "executive";

export const USER_ROLES: UserRole[] = [
  "admin",
  "manager",
  "executive",
  "technician",
  "billing",
  "customer",
];

export function isKnownUserRole(role: string | null | undefined): role is UserRole {
  return Boolean(role && (USER_ROLES as string[]).includes(role));
}

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

/** Roles an admin can assign in User Access. */
export const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "manager",
  "executive",
  "technician",
  "billing",
  "customer",
];

/** Display names for roles. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  executive: "Executive",
  technician: "Technician",
  billing: "Billing",
  customer: "Customer",
};

export function roleLabel(role: UserRole | string) {
  return ROLE_LABELS[role as UserRole] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export function isAdminRole(role: UserRole | string) {
  return role === "admin";
}

/** Manager and Admin share executive / operations permissions. */
export function isManagerRole(role: UserRole | string) {
  return role === "manager" || role === "admin";
}

/** Roles that can use billing and collections tools. */
export function canUseBillingTools(role: UserRole | string) {
  return role === "manager" || role === "billing" || role === "admin";
}

/** Roles that can view internal customer and contract records. */
export function canViewCustomerRecords(role: UserRole | string) {
  return role === "manager" || role === "billing" || role === "technician" || role === "admin";
}

/** Static access matrix for Admin security review. */
export const ROLE_ACCESS_MATRIX: {
  area: string;
  description: string;
  roles: UserRole[];
  financial: boolean;
  customerData: boolean;
}[] = [
  {
    area: "Manager & Executive Dashboards",
    description: "Company-wide KPIs and exception highlights",
    roles: ["admin", "manager", "executive"],
    financial: true,
    customerData: true,
  },
  {
    area: "Customers & Contracts",
    description: "Customer master data and contract terms",
    roles: ["admin", "manager", "executive", "billing", "technician"],
    financial: true,
    customerData: true,
  },
  {
    area: "Ticket & Project Completion",
    description: "Match tickets and projects to contracts and mark delivery complete",
    roles: ["admin", "manager"],
    financial: false,
    customerData: true,
  },
  {
    area: "Technician Assignments",
    description: "Assigned tickets, time, materials, ad hoc work",
    roles: ["admin", "technician"],
    financial: false,
    customerData: true,
  },
  {
    area: "Billing & Collections",
    description: "Ready-to-bill, invoices, payments, AR",
    roles: ["admin", "manager", "billing"],
    financial: true,
    customerData: true,
  },
  {
    area: "Accounting / Profitability",
    description: "Revenue recognition overview and margin analysis",
    roles: ["admin", "manager", "billing"],
    financial: true,
    customerData: true,
  },
  {
    area: "Admin Console",
    description: "User access, audit, and demo settings",
    roles: ["admin"],
    financial: true,
    customerData: true,
  },
  {
    area: "Customer Portal",
    description: "Own contracts, tickets, invoices only",
    roles: ["customer"],
    financial: true,
    customerData: true,
  },
];

export const DEMO_ACCOUNTS = [
  {
    role: "admin" as UserRole,
    label: "Admin",
    email: "admin@servicesync.demo",
    name: "Tabitha Webster",
  },
  {
    role: "manager" as UserRole,
    label: "Manager",
    email: "manager@servicesync.demo",
    name: "Emilie Pierson",
  },
  {
    role: "executive" as UserRole,
    label: "Executive",
    email: "executive@servicesync.demo",
    password: "1234",
    name: "Evan Bean",
  },
  {
    role: "customer" as UserRole,
    label: "Customer",
    email: "casey.ortiz@chadcorporation.demo",
    name: "Casey Ortiz",
  },
  {
    role: "technician" as UserRole,
    label: "Technician",
    email: "tech@servicesync.demo",
    name: "Jackson Pecunia",
  },
  {
    role: "billing" as UserRole,
    label: "Billing & Accounting",
    email: "billing@servicesync.demo",
    name: "Lindsay-Kate Williams",
  },
] as const;

export type CompanyEmployee = {
  name: string;
  title: string;
  department: string;
  hasLogin: boolean;
  /** True when this person uses another teammate's role demo account. */
  sharesRoleLogin: boolean;
  email: string | null;
  role: Exclude<UserRole, "customer">;
};

export const COMPANY_EMPLOYEES: CompanyEmployee[] = [
  {
    name: "Tabitha Webster",
    title: "System Administrator",
    department: "Finance & Administration",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "admin@servicesync.demo",
    role: "admin",
  },
  {
    name: "Emilie Pierson",
    title: "Operations Manager",
    department: "Service Delivery",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "manager@servicesync.demo",
    role: "manager",
  },
  {
    name: "Evan Bean",
    title: "Chief Executive Officer",
    department: "Executive Office",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "executive@servicesync.demo",
    role: "executive",
  },
  {
    name: "Jackson Pecunia",
    title: "Lead Technician",
    department: "Service Delivery",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "tech@servicesync.demo",
    role: "technician",
  },
  {
    name: "Lindsay-Kate Williams",
    title: "Billing Specialist",
    department: "Finance & Administration",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "billing@servicesync.demo",
    role: "billing",
  },
  {
    name: "Mark Ashe",
    title: "Service Desk Technician",
    department: "Help Desk",
    hasLogin: true,
    sharesRoleLogin: true,
    email: "tech@servicesync.demo",
    role: "technician",
  },
  {
    name: "Carson Kimble",
    title: "Staff Accountant / AR",
    department: "Finance & Administration",
    hasLogin: true,
    sharesRoleLogin: true,
    email: "billing@servicesync.demo",
    role: "billing",
  },
];

export type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  children?: NavItem[];
};

const MANAGER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Manager Dashboard" },
  // Contracts & Agreements + Billing & Finance dropdowns render via AppShell after dashboard
  { href: "/operations", label: "Ticket & Project Completion" },
  { href: "/projects", label: "Projects" },
  // Company Directory dropdown renders via CompanyDirectoryNavTree in AppShell after projects
  { href: "/controls", label: "Controls and Exceptions" },
];

export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  admin: [
    // User Access / Company Directory / Approvals / System trees render in AppShell
    { href: "/admin/audit", label: "Change Log" },
    { href: "/admin/configurations", label: "Configurations" },
    { href: "/controls", label: "Controls and Exceptions" },
  ],
  manager: MANAGER_NAV,
  executive: [
    { href: "/dashboard", label: "Executive Dashboard" },
    { href: "/customers", label: "Customers" },
    { href: "/admin/employees", label: "Employees" },
    { href: "/accounts-receivable", label: "Accounts Receivable" },
    // Contracts & Agreements dropdown renders via ContractsAgreementsNavTree in AppShell
  ],
  technician: [
    { href: "/dashboard", label: "My Assignments" },
    { href: "/assignments", label: "Assignments Workbench" },
    { href: "/customers", label: "Customers" },
    // Contracts & Agreements + Service Delivery trees render in AppShell
  ],
  billing: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/customers", label: "Customers" },
    // Contracts & Agreements + Billing/Collections/Accounting trees render in AppShell
  ],
  customer: [
    { href: "/dashboard", label: "Customer Home" },
    { href: "/support-requests", label: "Make a Request" },
    { href: "/my-contracts", label: "My Contracts" },
    { href: "/service-usage", label: "Service Usage" },
    { href: "/my-invoices", label: "My Invoices" },
    { href: "/my-projects", label: "My Projects" },
  ],
};

/** Role-specific copy for the Contracts & Agreements nav destination. */
export const CONTRACTS_NAV_COPY: Record<
  UserRole,
  { href: string; title: string; description: string }
> = {
  admin: {
    href: "/contracts",
    title: "Manage Contracts",
    description:
      "Oversee the full agreement lifecycle across customers — draft, approval, active service, holds, renewals, and cancellations.",
  },
  manager: {
    href: "/contracts",
    title: "Manage Contracts",
    description:
      "Manage the full agreement lifecycle — draft, approval, active service, holds, renewals, and cancellations.",
  },
  executive: {
    href: "/contracts/awaiting-signature",
    title: "Contracts for Signature",
    description:
      "Review contracts awaiting executive signature, add your signature, and release them to the customer.",
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
  customer: {
    href: "/my-contracts",
    title: "My Contracts",
    description:
      "View your service agreements, download or print PDFs, and sign when ready. Open Service Usage for this month's hour breakdown.",
  },
};

export function roleHomePath(role: UserRole) {
  if (role === "admin") return "/admin";
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
  const managerShared = [
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
    "/time-cost-approvals",
    "/profitability",
    "/billing-collections",
    "/contracts",
    "/billing-cost-approvals",
    "/operations",
    "/controls",
    "/customers",
    "/admin/employees",
  ];
  const shared: Partial<Record<UserRole, string[]>> = {
    admin: [
      ...managerShared,
      "/admin",
      "/customers",
      "/customer-approvals",
      "/assignments",
      "/support-requests",
      "/billing-collections",
    ],
    manager: managerShared,
    executive: [
      "/contracts",
      "/customers",
      "/contracts/reports",
      "/contracts/awaiting-signature",
      "/accounts-receivable",
      "/admin/employees",
    ],
    technician: [
      "/contracts",
      "/customers",
      "/assignments",
      "/tickets",
      "/projects",
      "/time-costs",
      "/additional-work",
    ],
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
    ],
    customer: ["/projects", "/my-invoices", "/make-payment", "/tickets", "/pending-approval"],
  };

  return (shared[role] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
