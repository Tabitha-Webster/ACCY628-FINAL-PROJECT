import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { type UserRole } from "@/lib/constants";
import { ButtonLink } from "@/components/Button";
import { CustomerListRetryButton } from "@/components/CustomerListRetryButton";
import { CustomerListSearch } from "@/components/CustomerListSearch";
import { CustomerSchemaNotice } from "@/components/CustomerSchemaNotice";
import { AdminCustomerAccessNotice } from "@/components/AdminCustomerAccessNotice";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState, ErrorState } from "@/components/ui";
import {
  canApproveCustomers,
  canEditCustomers,
  canViewCustomers,
  listCustomersForInternalRoles,
} from "@/lib/customers/queries";

export const dynamic = "force-dynamic";

function CustomerListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm opacity-70">Retrieving customer records…</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-28 rounded-2xl" />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function CustomerListContent({ role, profileId }: { role: UserRole; profileId: string }) {
  const supabase = await createClient();
  const { customers, error, schemaIncomplete } = await listCustomersForInternalRoles(supabase, {
    role,
    profileId,
  });

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorState message={`Unable to load customers from Supabase. ${error.message}`} />
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-sm font-medium">Something went wrong while retrieving records</p>
          <p className="mt-1 text-sm opacity-70">
            Check your connection and Supabase project access, then try loading the list again.
          </p>
          <div className="mt-3">
            <CustomerListRetryButton />
          </div>
        </div>
      </div>
    );
  }

  if (customers.length === 0) {
    if (role === "technician") {
      return (
        <EmptyState
          title="No assigned customers"
          description="Active customers appear here when you are assigned to their support tickets."
        />
      );
    }
    if (role === "admin") {
      return (
        <div className="space-y-4">
          <EmptyState
            title="No customers found"
            description="Admin is allowed in the app, but Supabase is not returning customer rows for this login yet."
          />
          <AdminCustomerAccessNotice />
        </div>
      );
    }
    return (
      <EmptyState
        title="No customers found"
        description="There are no customer records visible for your role yet. When matching customers are added, they will show up here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {schemaIncomplete ? <CustomerSchemaNotice /> : null}
      <CustomerListSearch
        key={`${customers.length}-${customers[0]?.id ?? "empty"}-${customers[customers.length - 1]?.id ?? ""}`}
        customers={customers}
        role={role}
      />
    </div>
  );
}

export default async function CustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewCustomers(profile.role)) redirect("/dashboard");

  const canManage = canEditCustomers(profile.role);
  const canApprove = canApproveCustomers(profile.role);
  const isTechnician = profile.role === "technician";
  const description = isTechnician
    ? "Customers linked to your assigned tickets — search, filter, and open a profile for contact details."
    : canManage
      ? "Shared live customer list from public.customers. Visibility depends on role; Admin can review Pending Approval signups."
      : "Shared live customer list — filtered for your role. Open a card to view the latest profile.";

  return (
    <PageLayout
      title="Customers"
      description={description}
      actions={
        <>
          {canApprove ? (
            <ButtonLink href="/customer-approvals" variant="secondary" size="sm">
              Review approvals
            </ButtonLink>
          ) : null}
          {canManage ? (
            <ButtonLink href="/customers/new" variant="primary" size="sm">
              Add Customer
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <Suspense fallback={<CustomerListSkeleton />}>
        <CustomerListContent role={profile.role} profileId={profile.id} />
      </Suspense>
    </PageLayout>
  );
}
