import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { COMPANY_EMPLOYEES } from "@/lib/constants";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui";

export default async function AdminEmployeesPage() {
  await requireAdmin();

  return (
    <div>
      <PageHeader
        title="Employees"
        description="ServiceSync staff directory. Mark, Carson, and Evan share the technician, billing, and manager demo logins."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      <DataTable headers={["Name", "Title", "Department", "App role", "Demo login"]}>
        {COMPANY_EMPLOYEES.map((employee) => (
          <tr key={employee.name}>
            <td className="font-medium">{employee.name}</td>
            <td>{employee.title}</td>
            <td>{employee.department}</td>
            <td>
              <StatusBadge status={employee.role} />
            </td>
            <td>
              {!employee.hasLogin || !employee.email
                ? "No demo login"
                : employee.sharesRoleLogin
                  ? `Shares ${employee.email}`
                  : employee.email}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
