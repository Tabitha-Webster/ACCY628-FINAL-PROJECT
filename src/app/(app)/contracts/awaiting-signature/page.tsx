import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { listAwaitingExecutiveSignatures } from "@/lib/contracts";

export default async function AwaitingExecutiveSignaturePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "executive" && profile.role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const { data: pending, error } = await listAwaitingExecutiveSignatures(supabase);
  const readyCount = pending.filter((item) => item.readyToSign).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Awaiting Your Signature"
        description="Contracts that need the executive / CEO signature before they can go to the customer."
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
        <>
          <p className="text-sm opacity-70">
            {readyCount} ready to sign
            {pending.length > readyCount
              ? ` · ${pending.length - readyCount} still need a manager signature packet`
              : ""}
          </p>
          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer</th>
                  <th>Manager</th>
                  <th>Manager signed</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <p className="font-medium">{item.contractNumber}</p>
                      <p className="text-xs opacity-60">{item.contractName}</p>
                    </td>
                    <td>{item.customerName}</td>
                    <td>{item.managerName}</td>
                    <td className="text-sm tabular-nums">{formatDateTime(item.signedAt)}</td>
                    <td>
                      <StatusBadge
                        status={item.readyToSign ? "awaiting_executive" : "pending_approval"}
                        label={item.readyToSign ? "Ready to sign" : "Needs manager packet"}
                      />
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/contracts/${item.contractId}#pdf-signatures`}
                        className="btn btn-primary btn-sm"
                      >
                        {item.readyToSign ? "Review & sign" : "Open contract"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
