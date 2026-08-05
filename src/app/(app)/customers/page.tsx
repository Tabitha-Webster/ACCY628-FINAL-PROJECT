import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { CustomerListRetryButton } from "@/components/CustomerListRetryButton";
import {
  CustomerListSearch,
  type CustomerListRow,
} from "@/components/CustomerListSearch";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState, ErrorState } from "@/components/ui";

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

async function CustomerListContent() {
  const supabase = await createClient();
  // Live schema only — same core fields the dashboard uses (plus contact/industry for the list).
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, status, industry, primary_contact, contact_email")
    .order("name", { ascending: true });

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

  const rows = (customers ?? []) as CustomerListRow[];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No customers found"
        description="There are no customer records in Supabase yet. When customers are added to the customers table, they will show up here automatically."
      />
    );
  }

  return <CustomerListSearch customers={rows} />;
}

export default async function CustomersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  return (
    <PageLayout
      title="Customers"
      description="Customer accounts loaded from Supabase."
      actions={
        <>
          {profile.role === "manager" ? (
            <ButtonLink href="/customer-approvals" variant="secondary" size="sm">
              Review approvals
            </ButtonLink>
          ) : null}
          {["manager", "billing"].includes(profile.role) ? (
            <ButtonLink href="/customers/new" variant="primary" size="sm">
              Add Customer
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <Suspense fallback={<CustomerListSkeleton />}>
        <CustomerListContent />
      </Suspense>
    </PageLayout>
  );
}
