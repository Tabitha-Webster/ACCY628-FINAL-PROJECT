export type UserRole = "admin" | "manager" | "technician" | "billing" | "customer" | "hr";

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
  "technician",
  "billing",
  "customer",
  "hr",
];

/** Display names for roles — "HR" stays fully capitalized. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  technician: "Technician",
  billing: "Billing",
  customer: "Customer",
  hr: "HR",
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
    area: "Executive Dashboard",
    description: "Company-wide KPIs and exception highlights",
    roles: ["admin", "manager"],
    financial: true,
    customerData: true,
  },
  {
    area: "Customers & Contracts",
    description: "Customer master data and contract terms",
    roles: ["admin", "manager", "billing", "technician"],
    financial: true,
    customerData: true,
  },
  {
    area: "Service Operations",
    description: "SLA monitoring, open work, hour usage",
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
    description: "Revenue recognition and margin analysis",
    roles: ["admin", "manager", "billing"],
    financial: true,
    customerData: true,
  },
  {
    area: "Admin Console",
    description: "User access, audit, demo settings, HR directory",
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
    password: "1234",
    name: "Tabitha Webster",
  },
  {
    role: "manager" as UserRole,
    label: "Manager",
    email: "manager@servicesync.demo",
    password: "1234",
    name: "Emilie Pierson",
  },
  {
    role: "technician" as UserRole,
    label: "Technician",
    email: "tech@servicesync.demo",
    password: "1234",
    name: "Jackson Pecunia",
  },
  {
    role: "billing" as UserRole,
    label: "Billing & Accounting",
    email: "billing@servicesync.demo",
    password: "1234",
    name: "Lindsay-Kate Williams",
  },
  {
    role: "hr" as UserRole,
    label: "HR",
    email: "hr@servicesync.demo",
    password: "1234",
    name: "Lily Walker",
  },
  {
    role: "customer" as UserRole,
    label: "Customer (Chad Corporation)",
    email: "casey.ortiz@chadcorporation.demo",
    password: "1234",
    name: "Casey Ortiz",
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
    name: "Lily Walker",
    title: "HR Manager",
    department: "Finance & Administration",
    hasLogin: true,
    sharesRoleLogin: false,
    email: "hr@servicesync.demo",
    role: "hr",
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
  {
    name: "Evan Bean",
    title: "Account Manager",
    department: "Project Delivery",
    hasLogin: true,
    sharesRoleLogin: true,
    email: "manager@servicesync.demo",
    role: "manager",
  },
];

export type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  children?: NavItem[];
};

const MANAGER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/customer-approvals", label: "Approvals" },
  { href: "/admin/employees", label: "Employees" },
  // Contracts & Agreements dropdown renders via ContractsAgreementsNavTree in AppShell
  { href: "/projects", label: "Projects" },
  { href: "/operations", label: "Service Operations" },
  { href: "/time-cost-approvals", label: "Approve Time & Costs" },
  { href: "/profitability", label: "Profitability" },
  { href: "/billing-collections", label: "Billing and Collections" },
  { href: "/payments", label: "Payment History" },
  { href: "/hr-analytics", label: "HR Analytics" },
  { href: "/controls", label: "Controls and Exceptions" },
];

export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Home" },
    // User Access dropdown renders via UserAccessNavTree in AppShell
    // Company Directory dropdown renders via CompanyDirectoryNavTree in AppShell
    // System dropdown renders via SystemNavTree in AppShell
    { href: "/admin/audit", label: "Audit Trail" },
    { href: "/admin/configurations", label: "Configurations" },
  ],
  manager: MANAGER_NAV,
  technician: [
    { href: "/dashboard", label: "My Assignments" },
    { href: "/assignments", label: "Assignments Workbench" },
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
    { href: "/hr-applicants", label: "Applicants" },
    { href: "/admin/employees", label: "Employees" },
    { href: "/hr-analytics", label: "HR Analytics" },
    { href: "/hr-positions", label: "Positions" },
    { href: "/admin/hr", label: "HR Directory" },
  ],
  customer: [
    { href: "/dashboard", label: "Customer Home" },
    { href: "/support-requests", label: "Make a Request" },
    { href: "/my-contracts", label: "My Contracts" },
    { href: "/my-invoices", label: "My Invoices" },
    { href: "/my-projects", label: "My Projects" },
    { href: "/service-usage", label: "Service Usage" },
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
    title: "My Contracts",
    description:
      "View the service agreements for your organization, including fees, included hours, and covered services.",
  },
};

export function roleHomePath(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "technician") return "/dashboard";
  if (role === "hr") return "/dashboard";
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
    "/contracts",
    "/billing-cost-approvals",
    "/customer-approvals",
    "/operations",
    "/controls",
    "/hr-analytics",
  ];
  const shared: Partial<Record<UserRole, string[]>> = {
    admin: [
      ...managerShared,
      "/admin",
      "/customers",
      "/assignments",
      "/support-requests",
      "/billing-collections",
    ],
    manager: managerShared,
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
    hr: ["/contracts", "/hr-applicants", "/hr-positions", "/admin/hr", "/admin/employees"],
    customer: ["/projects", "/my-invoices", "/make-payment", "/tickets", "/pending-approval"],
  };

  return (shared[role] ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}
