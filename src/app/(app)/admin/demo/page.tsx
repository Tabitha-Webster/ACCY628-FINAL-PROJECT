import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DEMO_ACCOUNTS, isAdminRole } from "@/lib/constants";
import { PageHeader, DataTable, StatusBadge } from "@/components/ui";

export default async function AdminDemoSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isAdminRole(profile.role)) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        title="Demo Settings"
        description="Class demo accounts used by the login selector and in-app role switcher."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Admin Console
          </Link>
        }
      />

      <div className="mb-4 rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-semibold">How demos work</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 opacity-80">
          <li>
            With Demo Mode on, click a role on login or in the header switcher to sign in
            instantly — no password.
          </li>
          <li>
            Demo Mode is on by default: the header Demo Role control signs in to demo accounts
            without typing a password.
          </li>
          <li>
            Demo account passwords remain <code>1234</code> for manual email/password sign-in when
            Demo Mode is off.
          </li>
          <li>
            Set <code>NEXT_PUBLIC_DEMO_MODE=false</code> in <code>.env.local</code> (then restart
            the server) to require passwords again.
          </li>
          <li>Mark demo accounts with <code>is_demo_user = true</code> in User Access.</li>
        </ul>
      </div>

      <DataTable headers={["Role", "Display name", "Email", "Password"]}>
        {DEMO_ACCOUNTS.map((account) => (
          <tr key={account.email}>
            <td>
              <StatusBadge status={account.role} />
            </td>
            <td>{account.name}</td>
            <td>{account.email}</td>
            <td>
              <code>1234</code>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
