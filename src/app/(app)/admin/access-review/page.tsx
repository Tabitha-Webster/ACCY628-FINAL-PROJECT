import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { isAdminRole, ROLE_ACCESS_MATRIX } from "@/lib/constants";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui";

export default async function AdminAccessReviewPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        title="Security & Access Review"
        description="Which roles can see financial data and customer information across ServiceSync."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      <DataTable headers={["Area", "What it exposes", "Roles with access", "Financial", "Customer data"]}>
        {ROLE_ACCESS_MATRIX.map((row) => (
          <tr key={row.area}>
            <td className="font-medium">{row.area}</td>
            <td className="max-w-xs text-sm opacity-80">{row.description}</td>
            <td>
              <div className="flex flex-wrap gap-1">
                {row.roles.map((role) => (
                  <StatusBadge key={role} status={role} />
                ))}
              </div>
            </td>
            <td>
              <StatusBadge status={row.financial ? "yes" : "no"} />
            </td>
            <td>
              <StatusBadge status={row.customerData ? "yes" : "no"} />
            </td>
          </tr>
        ))}
      </DataTable>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
          <p className="font-semibold">Admin review tips</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 opacity-80">
            <li>Keep Admin accounts limited — they can reach manager and billing screens.</li>
            <li>Customer users should always have a customer link set in User Access.</li>
            <li>Deactivate users who leave the firm instead of deleting Auth records mid-demo.</li>
            <li>Demo users should keep <code>is_demo_user</code> checked for class walkthroughs.</li>
          </ul>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
          <p className="font-semibold">Suggested monthly admin checklist</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 opacity-80">
            <li>Review inactive and duplicate demo accounts.</li>
            <li>Clear the Exceptions Queue (SLA, approvals, overdue invoices).</li>
            <li>Run Data Quality and fix missing contract / customer links.</li>
            <li>Confirm only Admin/Manager/Billing can reach financial screens.</li>
            <li>Spot-check technician workload balance.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
