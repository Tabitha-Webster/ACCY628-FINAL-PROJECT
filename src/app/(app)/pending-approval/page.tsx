import { redirect } from "next/navigation";
import { getCurrentProfile, getLinkedCustomer } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageLayout } from "@/components/PageLayout";

export default async function PendingApprovalPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer") redirect("/dashboard");

  const customer = await getLinkedCustomer(profile);

  if (customer?.status === "active") {
    redirect("/dashboard");
  }

  const rejected = customer?.status === "rejected";

  return (
    <PageLayout
      width="narrow"
      title={rejected ? "Registration Not Approved" : "Pending Approval"}
      description="Customer account status"
      actions={
        <ButtonLink href="/login" variant="secondary" size="sm">
          Back to Sign In
        </ButtonLink>
      }
    >
      <div className={`alert ${rejected ? "alert-error" : "alert-warning"} text-sm`}>
        <div className="space-y-2">
          {rejected ? (
            <>
              <p className="font-medium">Your customer registration was not approved.</p>
              {customer?.approval_note ? (
                <p>Note from reviewer: {customer.approval_note}</p>
              ) : null}
              <p>Please contact the company for assistance. Do not create a duplicate account.</p>
            </>
          ) : (
            <>
              <p className="font-medium">Your account is awaiting approval.</p>
              <p>
                Thanks for registering{customer?.name ? ` ${customer.name}` : ""}. A manager will
                review your customer account shortly.
              </p>
              <p>
                You can sign in, but you cannot submit tickets, enter contracts, or access billing
                information until your account is approved.
              </p>
            </>
          )}
        </div>
      </div>

      <Card title="What happens next">
        <ol className="list-decimal space-y-1 pl-5 text-sm opacity-80">
          <li>An admin reviews your signup on the Customer Approvals page.</li>
          <li>Once approved, your Customer Dashboard and service tools unlock automatically.</li>
          <li>If more information is needed, the company will contact you using your signup email.</li>
        </ol>
      </Card>

      {!rejected ? (
        <p className="text-xs opacity-60">Stay signed in — refresh after you are approved.</p>
      ) : null}
    </PageLayout>
  );
}
