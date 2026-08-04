import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { canAccessPath, type UserRole } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return <AppShell profile={profile}>{children}</AppShell>;
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
