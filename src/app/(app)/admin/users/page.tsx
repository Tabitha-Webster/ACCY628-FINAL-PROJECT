import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole, type UserRole } from "@/lib/constants";
import { PageHeader, ErrorState } from "@/components/ui";
import { AdminUserManager, type AdminUserRow } from "@/components/AdminUserManager";
import { AdminCreateUserForm } from "@/components/AdminCreateUserForm";

export default async function AdminUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const [usersRes, customersRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, customer_id, internal_cost_rate, is_demo_user, is_active")
      .order("full_name"),
    supabase.from("customers").select("id, name").order("name"),
  ]);

  if (usersRes.error) {
    return (
      <div>
        <PageHeader title="User & Role Management" />
        <ErrorState message={usersRes.error.message} />
      </div>
    );
  }

  const users = (usersRes.data ?? []) as AdminUserRow[];
  const limitedVisibility = users.length <= 1;

  return (
    <div>
      <PageHeader
        title="User & Role Management"
        description="Assign roles, link customers, and activate or deactivate access."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      {limitedVisibility ? (
        <div className="alert alert-warning mb-4 text-sm">
          <span>
            Only your own profile is visible. Run{" "}
            <code className="text-xs">scripts/admin-access-policies.sql</code> in Supabase SQL Editor,
            then refresh this page.
          </span>
        </div>
      ) : null}

      <div className="mb-6">
        <AdminCreateUserForm customers={customersRes.data ?? []} />
      </div>

      <AdminUserManager
        users={users.map((u) => ({ ...u, role: u.role as UserRole }))}
        customers={customersRes.data ?? []}
        currentUserId={profile.id}
      />
    </div>
  );
}
