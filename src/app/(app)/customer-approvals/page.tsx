import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { ButtonLink } from "@/components/Button";
import { CustomerApprovalActions } from "@/components/CustomerApprovalActions";
import { PageLayout } from "@/components/PageLayout";
import { DataTable, EmptyState, ErrorState, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/format";

type ApprovalRow = {
  id: string;
  name: string;
  primary_contact: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  approval_note: string | null;
};

export default async function CustomerApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  // Prefer the full manager-approval schema; fall back when migration is not applied yet.
  let rows: ApprovalRow[] = [];
  let errorMessage: string | null = null;

  const full = await supabase
    .from("customers")
    .select("id, name, primary_contact, contact_email, status, created_at, approval_note")
    .in("status", ["pending_approval", "rejected"])
    .order("created_at", { ascending: false });

  if (!full.error) {
    rows = (full.data ?? []) as ApprovalRow[];
  } else {
    const schemaGap =
      full.error.message.includes("approval_note") ||
      full.error.message.includes("pending_approval") ||
      full.error.message.includes("rejected");
    // Without the manager-approval migration, the dedicated queue cannot run.
    // Show an empty state instead of a hard database error.
    if (!schemaGap) {
      errorMessage = full.error.message;
    }
  }

  if (errorMessage) {
    return (
      <PageLayout
        title="Customer Approvals"
        description="Review newly registered customer accounts."
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            View customers
          </ButtonLink>
        }
      >
        <ErrorState message={errorMessage} />
      </PageLayout>
    );
  }

  const pending = rows.filter((row) => row.status === "pending_approval");

  return (
    <PageLayout
      title="Customer Approvals"
      description="Approve or reject newly registered customer accounts. Pending accounts can sign in but cannot use contracts, tickets, or billing."
      actions={
        <ButtonLink href="/customers" variant="secondary" size="sm">
          View customers
        </ButtonLink>
      }
    >
      {pending.length === 0 && rows.length === 0 ? (
        <EmptyState
          title="No customers awaiting review"
          description="New customer signups with Pending Approval status will appear here."
        />
      ) : (
        <DataTable headers={["Customer name", "Contact name", "Email", "Signup date", "Status", "Decision"]}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium">{row.name}</td>
              <td>{row.primary_contact ?? "—"}</td>
              <td className="text-sm">{row.contact_email ?? "—"}</td>
              <td className="text-sm">{formatDate(row.created_at)}</td>
              <td>
                <StatusBadge status={row.status} />
                {row.approval_note ? (
                  <p className="mt-1 max-w-xs text-xs opacity-60">Note: {row.approval_note}</p>
                ) : null}
              </td>
              <td className="min-w-56">
                <CustomerApprovalActions
                  customerId={row.id}
                  managerId={profile.id}
                  currentStatus={row.status}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageLayout>
  );
}
