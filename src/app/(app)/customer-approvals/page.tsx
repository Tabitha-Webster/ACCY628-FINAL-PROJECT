import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { CustomerApprovalActions } from "@/components/CustomerApprovalActions";
import { CustomerApprovalsSchemaNotice } from "@/components/CustomerApprovalsSchemaNotice";
import { PageLayout } from "@/components/PageLayout";
import { DataTable, EmptyState, ErrorState, StatusBadge } from "@/components/ui";
import { canApproveCustomers } from "@/lib/customers/queries";
import { formatDate } from "@/lib/format";

type ApprovalRow = {
  id: string;
  name: string;
  primary_contact: string | null;
  contact_email: string | null;
  status: string;
  created_at: string;
  signup_at: string | null;
  approval_note: string | null;
};

function isSchemaGap(message: string) {
  return (
    message.includes("approval_note") ||
    message.includes("signup_at") ||
    message.includes("pending_approval") ||
    message.includes("rejected") ||
    message.includes("customer_status")
  );
}

export default async function CustomerApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Admin only — approve/reject Pending Approval signups.
  if (!canApproveCustomers(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  let rows: ApprovalRow[] = [];
  let errorMessage: string | null = null;
  let schemaIncomplete = false;

  const full = await supabase
    .from("customers")
    .select("id, name, primary_contact, contact_email, status, created_at, signup_at, approval_note")
    .in("status", ["pending_approval", "rejected"])
    .order("signup_at", { ascending: false });

  if (!full.error) {
    rows = (full.data ?? []) as ApprovalRow[];
  } else if (isSchemaGap(full.error.message)) {
    // Fall back through optional columns / enum support.
    const core = await supabase
      .from("customers")
      .select("id, name, primary_contact, contact_email, status, created_at")
      .in("status", ["pending_approval", "rejected"])
      .order("created_at", { ascending: false });

    if (!core.error) {
      rows = (core.data ?? []).map((row) => ({
        ...row,
        signup_at: null,
        approval_note: null,
      })) as ApprovalRow[];
      schemaIncomplete = true;
    } else if (isSchemaGap(core.error.message)) {
      schemaIncomplete = true;
    } else {
      errorMessage = core.error.message;
    }
  } else {
    errorMessage = full.error.message;
  }

  if (errorMessage) {
    return (
      <PageLayout
        title="Customer Approvals"
        description="Admin only: approve or reject newly registered customer accounts."
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
      description="Admin only. Approve or reject newly registered customer accounts. Pending accounts can sign in but cannot use contracts, tickets, or billing."
      actions={
        <ButtonLink href="/customers" variant="secondary" size="sm">
          View customers
        </ButtonLink>
      }
    >
      {schemaIncomplete && rows.length === 0 ? <CustomerApprovalsSchemaNotice /> : null}

      {!schemaIncomplete && pending.length === 0 && rows.length === 0 ? (
        <EmptyState
          title="No customers awaiting review"
          description="New customer signups with Pending Approval status will appear here."
        />
      ) : null}

      {rows.length > 0 ? (
        <DataTable headers={["Customer name", "Contact name", "Email", "Signup date", "Status", "Decision"]}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="font-medium">{row.name}</td>
              <td>{row.primary_contact ?? "—"}</td>
              <td className="text-sm">{row.contact_email ?? "—"}</td>
              <td className="text-sm">{formatDate(row.signup_at ?? row.created_at)}</td>
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
      ) : null}
    </PageLayout>
  );
}
