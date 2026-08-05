import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { AddCustomerForm } from "@/components/AddCustomerForm";
import { ButtonLink } from "@/components/Button";
import { PageLayout } from "@/components/PageLayout";

export default async function AddCustomerPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/customers");

  return (
    <PageLayout
      width="narrow"
      title="Add Customer"
      description="Enter the basics to create a customer record. Billing fields can be added later."
      actions={
        <ButtonLink href="/customers" variant="secondary" size="sm">
          Back to list
        </ButtonLink>
      }
    >
      <AddCustomerForm />
    </PageLayout>
  );
}
