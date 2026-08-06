import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole } from "@/lib/constants";
import { PageHeader, ErrorState } from "@/components/ui";
import { AdminEmployeesManager, type EmployeeRow } from "@/components/AdminEmployeesManager";

export default async function AdminEmployeesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role) && profile.role !== "manager" && profile.role !== "hr") {
    redirect("/dashboard");
  }

  const canEdit = isAdminRole(profile.role);
  const supabase = await createClient();
  const employeesRes = await supabase
    .from("employees")
    .select("id, full_name, title, department, role, email, notes, is_active")
    .order("full_name");

  if (employeesRes.error) {
    return (
      <div>
        <PageHeader title="Employees" />
        <ErrorState message={employeesRes.error.message} />
        <p className="mt-3 text-sm opacity-70">
          If this is a missing-table or permission error, apply the employees migrations and confirm
          select access for admin, manager, and HR.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description={
          canEdit
            ? "Add, edit, or remove ServiceSync staff directory records. Login accounts are managed separately under User Access."
            : "View the ServiceSync staff directory. Only administrators can add, edit, or remove employees."
        }
        actions={
          canEdit ? (
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Admin Console
            </Link>
          ) : null
        }
      />

      <AdminEmployeesManager
        initialEmployees={(employeesRes.data ?? []) as EmployeeRow[]}
        canEdit={canEdit}
      />
    </div>
  );
}
