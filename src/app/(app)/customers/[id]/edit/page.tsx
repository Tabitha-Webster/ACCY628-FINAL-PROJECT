import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { EditCustomerForm, type EditCustomerInitial } from "@/components/EditCustomerForm";
import { PageLayout } from "@/components/PageLayout";
import { ErrorState } from "@/components/ui";
import {
  asCustomerStatus,
  canEditCustomers,
  getCustomerDetailForInternalRoles,
} from "@/lib/customers/queries";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canEditCustomers(profile.role)) redirect("/customers");

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId ?? "").trim();
  if (!id) redirect("/customers");

  const supabase = await createClient();
  const { customer, error } = await getCustomerDetailForInternalRoles(supabase, id);

  if (error) {
    return (
      <PageLayout
        title="Edit Customer"
        description="Update customer profile"
        actions={
          <ButtonLink href={`/customers/${id}`} variant="secondary" size="sm">
            Back to customer
          </ButtonLink>
        }
      >
        <ErrorState message={`Unable to load this customer. ${error.message}`} />
      </PageLayout>
    );
  }

  if (!customer) {
    return (
      <PageLayout
        title="Customer not found"
        description="Update customer profile"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message="That customer does not exist, or you do not have access to it." />
      </PageLayout>
    );
  }

  const initial: EditCustomerInitial = {
    id: customer.id,
    customerIdentifier: customer.customer_identifier ?? null,
    name: customer.name ?? "",
    status: asCustomerStatus(customer.status),
    industry: customer.industry ?? "",
    primaryContact: customer.primary_contact ?? "",
    contactEmail: customer.contact_email ?? "",
    contactPhone: customer.primary_contact_phone ?? "",
    billingContactName: customer.billing_contact_name ?? "",
    billingContactEmail: customer.billing_contact_email ?? "",
    billingAddress: customer.billing_address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    postalCode: customer.postal_code ?? "",
    existingNotes: customer.notes ?? null,
  };

  return (
    <PageLayout
      width="narrow"
      title="Edit Customer"
      description="Update customer information, then save to return to the profile."
      actions={
        <ButtonLink href={`/customers/${id}`} variant="secondary" size="sm">
          Back to customer
        </ButtonLink>
      }
    >
      <EditCustomerForm initial={initial} />
    </PageLayout>
  );
}
