import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { canViewContractReports, canViewContractsModule } from "@/lib/contracts";

/**
 * Contracts & Agreements is a nav group only.
 * Send users to the appropriate submenu destination.
 */
export default async function ContractsIndexPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  if (canViewContractReports(profile.role)) {
    redirect("/contracts/reports");
  }

  redirect("/contracts/renewals");
}
