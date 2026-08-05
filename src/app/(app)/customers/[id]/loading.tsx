import { PageLayout } from "@/components/PageLayout";
import { ButtonLink } from "@/components/Button";

/** Shown while a customer detail page is loading. */
export default function CustomerDetailLoading() {
  return (
    <PageLayout
      title="Customer"
      description="Loading customer details…"
      actions={
        <ButtonLink href="/customers" variant="secondary" size="sm">
          Back to list
        </ButtonLink>
      }
    >
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <p className="text-sm opacity-70">Retrieving this customer from Supabase…</p>
        <div className="skeleton h-40 w-full rounded-box" />
        <div className="skeleton h-32 w-full rounded-box" />
        <div className="skeleton h-40 w-full rounded-box" />
      </div>
    </PageLayout>
  );
}
