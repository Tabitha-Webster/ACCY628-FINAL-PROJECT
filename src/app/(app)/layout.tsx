import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentProfile, getLinkedCustomer } from "@/lib/auth";
import { canAccessPath, type UserRole } from "@/lib/constants";
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

  return (
    <AppShell profile={profile} customerStatus={customerStatus}>
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
  if (!canAccessPath(profile.role, pathname)) redirect("/dashboard");
  return profile;
}
