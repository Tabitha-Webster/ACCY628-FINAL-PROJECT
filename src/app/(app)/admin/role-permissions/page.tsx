import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/constants";
import { PageHeader, ErrorState } from "@/components/ui";
import { RolePermissionsManager } from "@/components/RolePermissionsManager";
import { loadRolePermissionMatrix } from "@/lib/role-permissions-data";

export default async function AdminRolePermissionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard");

  let rows;
  try {
    rows = await loadRolePermissionMatrix();
  } catch (err) {
    return (
      <div>
        <PageHeader title="Role Permissions" />
        <ErrorState message={err instanceof Error ? err.message : "Could not load permissions."} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Role Permissions"
        description="Choose which application screens each C2C role can see and open."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="btn btn-sm btn-outline">
              Manage Access
            </Link>
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Admin Home
            </Link>
          </div>
        }
      />

      <RolePermissionsManager initialRows={rows} />
    </div>
  );
}
