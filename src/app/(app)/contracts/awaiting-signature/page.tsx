import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { AwaitingExecutiveSignatureTable } from "@/components/AwaitingExecutiveSignatureTable";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { listAwaitingExecutiveSignatures } from "@/lib/contracts";

export default async function AwaitingExecutiveSignaturePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "executive" && profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: pending, error } = await listAwaitingExecutiveSignatures(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Awaiting Your Signature"
        description="Contracts that need the executive / CEO signature before they can go to the customer. Items waiting longer than 10 days are flagged."
        actions={
          <Link href="/contracts" className="btn btn-outline btn-sm">
            All contracts
          </Link>
        }
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && pending.length === 0 ? (
        <EmptyState
          title="Nothing waiting on you"
          description="When a manager signs and sends a contract for executive signature, it will appear here."
        />
      ) : null}

      {!error && pending.length > 0 ? (
        <AwaitingExecutiveSignatureTable items={pending} />
      ) : null}
    </div>
  );
}
