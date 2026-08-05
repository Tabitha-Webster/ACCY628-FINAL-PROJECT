import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { CustomerListRetryButton } from "@/components/CustomerListRetryButton";
import { CustomerListSearch } from "@/components/CustomerListSearch";
import { CustomerSchemaNotice } from "@/components/CustomerSchemaNotice";
import { HrCustomerAccessNotice } from "@/components/HrCustomerAccessNotice";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState, ErrorState } from "@/components/ui";
import type { UserRole } from "@/lib/constants";
import {
  canEditCustomers,
  canViewCustomers,
  listCustomersForInternalRoles,
} from "@/lib/customers/queries";

export const dynamic = "force-dynamic";

function CustomerListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm opacity-70">Retrieving customer records…</p>
      <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
        <div className="border-b border-base-300 bg-base-200/60 px-4 py-3">
          <div className="skeleton h-3 w-full max-w-3xl" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-base-200 px-4 py-3 last:border-b-0"
          >
            <div className="skeleton h-3 w-20 shrink-0" />
            <div className="skeleton h-3 w-40 shrink-0" />
            <div className="skeleton h-5 w-24 shrink-0" />
            <div className="skeleton h-3 w-28 shrink-0" />
            <div className="skeleton h-3 w-32 shrink-0" />
            <div className="skeleton h-3 min-w-0 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function CustomerListContent({ role }: { role: UserRole }) {
  const supabase = await createClient();
  const { customers, error, schemaIncomplete } = await listCustomersForInternalRoles(supabase);

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
    if (role === "hr") {
      return (
        <div className="space-y-4">
          <EmptyState
            title="No customers found"
            description="HR is allowed in the app, but Supabase is not returning customer rows for this login yet."
          />
          <HrCustomerAccessNotice />
        </div>
      );
    }
    return (
      <EmptyState
        title="No customers found"
        description="There are no customer records in Supabase yet. When customers are added to the customers table, they will show up here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {schemaIncomplete ? <CustomerSchemaNotice /> : null}
      <CustomerListSearch customers={customers} role={role} />
    </div>
  );
}

export default async function CustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewCustomers(profile.role)) redirect("/dashboard");

  const canManage = canEditCustomers(profile.role);
  const description = canManage
    ? "Shared live customer list. Manager and HR can add or edit customers; Technician and Billing can view the same records."
    : "Shared live customer list — same records Manager and HR maintain. Open a row to view the latest profile.";

  return (
    <PageLayout
      title="Customers"
      description={description}
      actions={
        <>
          {canManage ? (
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
        <CustomerListContent role={profile.role} />
      </Suspense>
    </PageLayout>
  );
}
