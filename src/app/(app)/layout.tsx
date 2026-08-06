import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentProfile, getLinkedCustomer } from "@/lib/auth";
import { isAdminRole, roleHomePath, type UserRole } from "@/lib/constants";
import { pathAllowedByPageKeys } from "@/lib/role-permissions";
import { loadAllowedPageKeysForRole } from "@/lib/role-permissions-data";
import { loadSystemConfiguration } from "@/lib/system-configuration-data";
import type { CustomerStatus } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  let customerStatus: CustomerStatus | null = null;
  if (profile.role === "customer") {
    const linked = await getLinkedCustomer(profile);
    customerStatus = linked?.status ?? null;
  }

  const allowedPageKeys = isAdminRole(profile.role)
    ? null
    : await loadAllowedPageKeysForRole(profile.role as UserRole);

  const { config: systemConfig } = await loadSystemConfiguration();

  return (
    <AppShell
      profile={profile}
      customerStatus={customerStatus}
      allowedPageKeys={allowedPageKeys}
      systemConfig={systemConfig}
    >
      {children}
    </AppShell>
  );
}

export async function requireRole(roles: UserRole[]) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

export async function requirePathAccess(pathname: string) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (isAdminRole(profile.role)) return profile;

  const allowedKeys = await loadAllowedPageKeysForRole(profile.role as UserRole);
  if (!pathAllowedByPageKeys(pathname, new Set(allowedKeys))) {
    redirect(roleHomePath(profile.role as UserRole));
  }
  return profile;
}
