import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/constants";

type AdminTool = {
  href: string;
  title: string;
  description: string;
};

const ACCESS_TOOLS: AdminTool[] = [
  {
    href: "/admin/users",
    title: "Manage Access",
    description: "Create logins, assign roles, and activate or deactivate accounts.",
  },
  {
    href: "/admin/role-permissions",
    title: "Role Permissions",
    description: "Choose which screens each C2C role can see and open.",
  },
  {
    href: "/admin/employees",
    title: "Employees",
    description: "Add, edit, or remove staff directory records.",
  },
  {
    href: "/admin/access-review",
    title: "Access Review",
    description: "Which roles can reach financial and customer data across the app.",
  },
  {
    href: "/admin/audit",
    title: "Audit Trail",
    description: "Record of changes to permissions, configuration, and critical records.",
  },
];

const SYSTEM_TOOLS: AdminTool[] = [
  {
    href: "/admin/configurations",
    title: "Configurations",
    description: "Company settings, tax defaults, numbering, integrations, and demo toggles.",
  },
  {
    href: "/admin/system",
    title: "Platform Status",
    description: "Company-wide pulse on the data the billing and service pipeline depends on.",
  },
  {
    href: "/admin/alerts",
    title: "System Alerts",
    description: "Conditions that stop billing, approvals, or service from moving.",
  },
  {
    href: "/admin/data-quality",
    title: "Data Quality",
    description: "Missing contracts, contacts, assignments, and broken customer-user links.",
  },
  {
    href: "/admin/exceptions",
    title: "Exception Log",
    description: "Items blocking invoicing, approvals, or collections that need an admin.",
  },
  {
    href: "/admin/exports",
    title: "Data Exports",
    description: "Download users, exceptions, workload, contracts, and overdue receivables.",
  },
  {
    href: "/admin/search",
    title: "Global Search",
    description: "Find any user, customer, contract, ticket, or invoice when diagnosing an issue.",
  },
  {
    href: "/admin/demo",
    title: "Demo Settings",
    description: "Demo accounts and role-switcher guidance for walkthroughs.",
  },
];

function ToolGrid({ tools }: { tools: AdminTool[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <Link
          key={tool.href}
          href={tool.href}
          className="rounded-box border border-base-300 bg-base-100 p-4 transition hover:border-primary/40 hover:bg-base-200/40"
        >
          <p className="font-semibold">{tool.title}</p>
          <p className="mt-1 text-sm opacity-70">{tool.description}</p>
        </Link>
      ))}
    </div>
  );
}

export default async function AdminHomePage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const [usersRes, customersRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active, is_demo_user, customer_id"),
    supabase.from("customers").select("id").eq("status", "active"),
  ]);

  const error = usersRes.error || customersRes.error;
  if (error) {
    return (
      <div>
        <PageHeader title="Admin Home" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const users = usersRes.data ?? [];
  const limitedVisibility = users.length <= 1;

  const activeUsers = users.filter((user) => user.is_active).length;
  const inactiveUsers = users.length - activeUsers;
  const demoUsers = users.filter((user) => user.is_demo_user).length;
  const portalUsers = users.filter((user) => user.role === "customer");
  const staffUsers = users.length - portalUsers.length;
  const unlinkedPortalUsers = portalUsers.filter((user) => !user.customer_id).length;

  const countsByRole = users.reduce<Record<string, { total: number; active: number; demo: number }>>(
    (acc, user) => {
      const entry = acc[user.role] ?? { total: 0, active: 0, demo: 0 };
      entry.total += 1;
      if (user.is_active) entry.active += 1;
      if (user.is_demo_user) entry.demo += 1;
      acc[user.role] = entry;
      return acc;
    },
    {}
  );
  const rolesPresent = Object.keys(countsByRole).length;
  const rolesWithoutUsers = ASSIGNABLE_ROLES.filter((role) => !countsByRole[role]);

  return (
    <div>
      <PageHeader
        title="Admin Home"
        description={`Welcome, ${profile.full_name}. Manage access, keep the platform healthy, and unblock the contract-to-cash pipeline.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="btn btn-sm btn-primary">
              Manage Access
            </Link>
            <Link href="/admin/role-permissions" className="btn btn-sm btn-outline">
              Role Permissions
            </Link>
            <Link href="/admin/alerts" className="btn btn-sm btn-outline">
              System Alerts
            </Link>
            <Link href="/admin/search" className="btn btn-sm btn-outline">
              Search
            </Link>
          </div>
        }
      />

      {limitedVisibility ? (
        <div className="alert alert-warning mb-6 text-sm">
          <span>
            You can currently see only your own profile. Run{" "}
            <code className="text-xs">scripts/admin-access-policies.sql</code> in Supabase so Admin can manage all
            users.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="User Accounts"
          value={String(users.length)}
          hint={`${staffUsers} staff · ${portalUsers.length} portal`}
        />
        <StatCard
          label="Active Logins"
          value={String(activeUsers)}
          hint={`${inactiveUsers} deactivated`}
          tone={inactiveUsers > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Roles In Use"
          value={`${rolesPresent} of ${ASSIGNABLE_ROLES.length}`}
          hint={
            rolesWithoutUsers.length > 0
              ? `Unused: ${rolesWithoutUsers.map(roleLabel).join(", ")}`
              : "Every role is assigned"
          }
        />
        <StatCard
          label="Unlinked Portal Users"
          value={String(unlinkedPortalUsers)}
          hint="Customer logins with no customer record"
          tone={unlinkedPortalUsers > 0 ? "error" : "success"}
        />
        <StatCard label="Active Customers" value={String(customersRes.data?.length ?? 0)} />
        <StatCard label="Demo Accounts" value={String(demoUsers)} hint="Used by the role switcher" />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Access by role</h2>
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Role</th>
                <th>Accounts</th>
                <th>Active</th>
                <th>Demo</th>
              </tr>
            </thead>
            <tbody>
              {ASSIGNABLE_ROLES.map((role) => {
                const entry = countsByRole[role];
                return (
                  <tr key={role}>
                    <td className="font-medium">{roleLabel(role)}</td>
                    <td className="tabular-nums">{entry?.total ?? 0}</td>
                    <td className="tabular-nums">{entry?.active ?? 0}</td>
                    <td className="tabular-nums">{entry?.demo ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Access &amp; identity</h2>
        <ToolGrid tools={ACCESS_TOOLS} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">System &amp; data</h2>
        <ToolGrid tools={SYSTEM_TOOLS} />
      </div>
    </div>
  );
}
