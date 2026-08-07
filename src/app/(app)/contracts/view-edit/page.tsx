import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ViewEditContractsClient } from "@/components/ViewEditContractsClient";
import { ErrorState, PageHeader } from "@/components/ui";
import {
  canEditContracts,
  canViewContractsModule,
  listContracts,
  type ContractListRow,
} from "@/lib/contracts";

export default async function ViewEditContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/contracts");

  const canEdit = canEditContracts(profile.role);
  const supabase = await createClient();
  const { data, error } = await listContracts(supabase);
  const contracts = (data ?? []) as ContractListRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="View and Edit Contracts"
        description="Browse every agreement. Click a status badge to filter. View opens the PDF; Edit uses the same stepped screens as New Contract."
        actions={
          canEdit ? (
            <Link href="/contracts/new" className="btn btn-primary btn-sm">
              New contract
            </Link>
          ) : null
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error ? (
        <ViewEditContractsClient contracts={contracts} canEdit={canEdit} />
      ) : null}
    </div>
  );
}
