import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageLayout } from "@/components/PageLayout";

/** Placeholder until the edit-customer form is built. */
export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing"].includes(profile.role)) redirect("/customers");

  const { id } = await params;

  return (
    <PageLayout
      width="narrow"
      title="Edit Customer"
      description="Customer editing will be available in a later step."
      actions={
        <ButtonLink href={`/customers/${id}`} variant="secondary" size="sm">
          Back to customer
        </ButtonLink>
      }
    >
      <Card title="Coming soon">
        <p className="text-sm opacity-70">
          The edit form has not been built yet. Use Back to customer to return to the profile.
        </p>
      </Card>
    </PageLayout>
  );
}
